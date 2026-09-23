const { launch, BASE_URL } = require('./support/launch');
const { PNG_1X1_BASE64 } = require('./support/fixtures');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Same mock as before, but this time we specifically care about attachment
// bytes surviving the round trip, so it's instrumented to report file sizes.
const MOCK_JSZIP_INIT_SCRIPT = () => {
  class MockJSZip {
    constructor() { this._files = {}; }
    file(path, content) {
      if (content === undefined) {
        const c = this._files[path];
        if (c === undefined) return null;
        return {
          async: async (type) => {
            if (type === 'string') return c.isString ? c.data : await c.data.text();
            return c.isString ? new Blob([c.data]) : c.data;
          },
        };
      }
      this._files[path] = { isString: typeof content === 'string', data: content };
      window.__lastZipFileSizes = window.__lastZipFileSizes || {};
      if (content instanceof Blob) window.__lastZipFileSizes[path] = content.size;
      return this;
    }
    async generateAsync() {
      const entries = {};
      for (const [path, c] of Object.entries(this._files)) {
        if (c.isString) { entries[path] = { isString: true, data: c.data }; continue; }
        const buf = await c.data.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        entries[path] = { isString: false, data: btoa(binary) };
      }
      return new Blob([JSON.stringify(entries)], { type: 'application/x-mock-zip' });
    }
  }
  MockJSZip.loadAsync = async (file) => {
    const text = await file.text();
    const entries = JSON.parse(text);
    const zip = new MockJSZip();
    for (const [path, c] of Object.entries(entries)) {
      if (c.isString) { zip._files[path] = { isString: true, data: c.data }; continue; }
      const binary = atob(c.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      zip._files[path] = { isString: false, data: new Blob([bytes]) };
    }
    return zip;
  };
  window.JSZip = MockJSZip;
};

function readState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
}

(async () => {
  const browser = await launch();
  const errors = [];

  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(MOCK_JSZIP_INIT_SCRIPT);

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  // Add a drill WITH an image attachment — the seeded drills have none, so
  // this is the case that actually exercises the attachments/ folder.
  await page.goto(BASE + '/index.html#/drills');
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Cone Diagram With Image');
  await page.setInputFiles('#drill-file', { name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64') });
  await page.waitForTimeout(300);
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);

  const stateBeforeExport = await readState(page);
  const drillWithImage = stateBeforeExport.drills.find((d) => d.name === 'Cone Diagram With Image');
  assert(!!drillWithImage && !!drillWithImage.attachment, 'Drill with an image attachment exists before export');
  const originalDataUrl = drillWithImage.attachment.dataUrl;
  console.log('Original attachment dataUrl length:', originalDataUrl.length, 'type:', drillWithImage.attachment.type);

  // Export and capture the ZIP file sizes the mock recorded as it was built.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-action="export-zip"]'),
  ]);
  const zipPath = await download.path();

  const zipFileSizes = await page.evaluate(() => window.__lastZipFileSizes);
  console.log('Files written into the ZIP (path -> byte size):', JSON.stringify(zipFileSizes, null, 2));
  const attachmentEntries = Object.entries(zipFileSizes).filter(([p]) => p.startsWith('attachments/'));
  assert(attachmentEntries.length === 1, 'Exactly one attachments/ file was written into the ZIP, found ' + attachmentEntries.length);
  const [attachmentPath, attachmentSize] = attachmentEntries[0];
  console.log('Attachment file in ZIP:', attachmentPath, '=', attachmentSize, 'bytes');
  assert(attachmentSize > 0, 'The image attachment file written into the ZIP has non-zero byte size (' + attachmentSize + ' bytes) — the image data is genuinely included, not just a text reference');
  assert(attachmentPath.endsWith('.jpg'), 'Image attachment is stored in the ZIP with a .jpg extension, got: ' + attachmentPath);

  // Now "hand the ZIP to another coach" — fresh library, fresh browser context.
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  page2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page2.addInitScript(MOCK_JSZIP_INIT_SCRIPT);
  await page2.goto(BASE + '/index.html');
  await page2.evaluate(() => localStorage.clear());
  await page2.reload();
  await page2.goto(BASE + '/index.html#/drills');
  await page2.waitForSelector('[data-action="add-drill"]');

  await page2.setInputFiles('#drill-zip-import-input', zipPath);
  await page2.waitForFunction(() => {
    const el = document.querySelector('#drill-zip-status');
    return el && !el.hidden && el.textContent.includes('Imported');
  }, { timeout: 8000 });
  const statusText = await page2.textContent('#drill-zip-status');
  console.log('Import status on the "other coach" device:', statusText);
  assert(/Imported 4 drill/.test(statusText), 'All 4 drills (3 seeded + the one with an image) imported, got: ' + statusText);
  assert(!statusText.includes('left out'), 'No attachment was left out during import, got: ' + statusText);

  const stateAfterImport = await readState(page2);
  const importedDrill = stateAfterImport.drills.find((d) => d.name === 'Cone Diagram With Image');
  assert(!!importedDrill, 'The drill with the image made it into the other coach\'s library');
  assert(!!importedDrill.attachment, 'The imported drill still has an attachment (image was not dropped)');
  assert(importedDrill.attachment.type === 'image', 'Imported attachment type is preserved as "image", got: ' + importedDrill.attachment.type);
  console.log('Imported attachment dataUrl length:', importedDrill.attachment.dataUrl.length);
  assert(importedDrill.attachment.dataUrl.startsWith('data:image/jpeg'), 'Imported attachment dataUrl is a real image data URL, got prefix: ' + importedDrill.attachment.dataUrl.slice(0, 25));
  assert(importedDrill.attachment.dataUrl === originalDataUrl, 'Imported image dataUrl is byte-for-byte identical to the original (round-tripped losslessly through the ZIP)');

  // Actually decode it as an image in the browser to prove it's not just a matching string — render it and check real pixel dimensions.
  const decodedOk = await page2.evaluate((dataUrl) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ ok: true, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ ok: false });
    img.src = dataUrl;
  }), importedDrill.attachment.dataUrl);
  console.log('Decoded imported image dimensions:', decodedOk);
  assert(decodedOk.ok && decodedOk.width > 0 && decodedOk.height > 0, 'The imported attachment decodes as a real, valid image in the browser');

  assert(errors.length === 0, 'No console/page errors during the image round-trip test: ' + errors.join(', '));

  await context2.close();
  await page.close();
  await browser.close();
  console.log('\nALL ZIP IMAGE ROUND-TRIP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
