const { launch, BASE_URL } = require('./support/launch');
const { PNG_1X1_BASE64, pdfBuffer } = require('./support/fixtures');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('dialog', (d) => { console.log('native dialog:', d.message()); d.dismiss(); });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Load sample data (seeds 3 drills).
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  // Drill Library reachable from Training.
  await page.goto(BASE + '/index.html#/training');
  const libLink = await page.$('a[href="#/drills"]');
  assert(libLink, 'Drill Library link is present on the Training page');
  await libLink.click();
  await page.waitForSelector('h1:has-text("Drill Library")');

  const seededCards = await page.$$('.card:has(button[data-action="edit-drill"])');
  assert(seededCards.length === 3, 'Three seeded drills are listed, found ' + seededCards.length);

  // Search filter.
  await page.fill('#drill-search', 'Triangles');
  await page.waitForTimeout(150);
  const filtered = await page.$$('.card:has(button[data-action="edit-drill"])');
  assert(filtered.length === 1, 'Search narrows to 1 matching drill, found ' + filtered.length);
  await page.fill('#drill-search', '');
  await page.waitForTimeout(150);

  // Add a drill with a valid weblink.
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Shooting Practice');
  await page.fill('#drill-form [name="description"]', 'Rotating shots on goal from the edge of the box.');
  await page.fill('#drill-form [name="link"]', 'youtube.com/watch?v=example');
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let drill = state.drills.find((d) => d.name === 'Shooting Practice');
  assert(!!drill, 'New drill with weblink persisted');
  assert(drill.link === 'https://youtube.com/watch?v=example', 'Bare-domain link normalized to https://, got: ' + drill.link);

  // Reject an unsafe link scheme — inline error, form stays open with values intact.
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Bad Link Drill');
  await page.fill('#drill-form [name="link"]', 'javascript:alert(1)');
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(150);
  const inlineErrorText = await page.textContent('#drill-form-error');
  const inlineErrorHidden = await page.getAttribute('#drill-form-error', 'hidden');
  assert(inlineErrorHidden === null, 'Inline error banner is shown (not the shared alertDialog) for an invalid link');
  console.log('Inline error text:', inlineErrorText);
  const stillOpenForm = await page.$('#drill-form [name="name"]');
  assert(!!stillOpenForm, 'Form stays open after an invalid link is rejected (not silently saved)');
  const nameStillThere = await page.inputValue('#drill-form [name="name"]');
  assert(nameStillThere === 'Bad Link Drill', "Previously typed name wasn't lost when the link was rejected");
  await page.click('[data-close-modal]');
  await page.waitForTimeout(100);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!state.drills.some((d) => d.name === 'Bad Link Drill'), 'Drill with unsafe link scheme was never saved');

  // Add a drill with an image attachment.
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Cone Diagram Drill');
  await page.setInputFiles('#drill-file', { name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64') });
  await page.waitForFunction(() => {
    const el = document.querySelector('#drill-attachment-status');
    return el && el.textContent.includes('Ready') === false && !el.textContent.includes('Processing');
  }, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const statusText = await page.textContent('#drill-attachment-status');
  console.log('Attachment status after image upload:', statusText);
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const imgDrill = state.drills.find((d) => d.name === 'Cone Diagram Drill');
  assert(!!imgDrill && !!imgDrill.attachment, 'Image-attached drill persisted with an attachment');
  assert(imgDrill.attachment.type === 'image', 'Attachment type recorded as image');
  assert(imgDrill.attachment.dataUrl.startsWith('data:image/jpeg'), 'Image resized to jpeg data URL, got prefix: ' + imgDrill.attachment.dataUrl.slice(0, 20));

  // Add a drill with a valid, under-cap PDF attachment.
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Small PDF Drill');
  await page.setInputFiles('#drill-file', { name: 'small.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(500_000) });
  await page.waitForTimeout(400);
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const pdfDrill = state.drills.find((d) => d.name === 'Small PDF Drill');
  assert(!!pdfDrill && pdfDrill.attachment && pdfDrill.attachment.type === 'pdf', 'Small PDF attached and persisted');

  // Reject an oversized PDF.
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Huge PDF Drill');
  await page.setInputFiles('#drill-file', { name: 'huge.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(2_000_000) });
  await page.waitForFunction(() => {
    const el = document.querySelector('#drill-form-error');
    return el && !el.hidden;
  }, { timeout: 5000 });
  const alertText = await page.textContent('#drill-form-error');
  console.log('Oversized PDF inline error text:', alertText);
  assert(/1\.5\s*MB|too large|keep attachments under/i.test(alertText), 'Oversized PDF triggers a size-limit error: ' + alertText);
  const statusAfterReject = await page.textContent('#drill-attachment-status');
  assert(statusAfterReject.includes('No attachment'), 'Attachment status resets to "No attachment" after rejection, got: ' + statusAfterReject);
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const hugeDrill = state.drills.find((d) => d.name === 'Huge PDF Drill');
  assert(!!hugeDrill && !hugeDrill.attachment, 'Drill saved without the rejected oversized attachment');

  // Delete the "Bad Link Drill" test never got created; delete "Huge PDF Drill" via edit modal to clean up.
  await page.goto(BASE + '/index.html#/drills');
  await page.waitForTimeout(150);

  // Quick-fill a Plan block from the Drill Library.
  await page.goto(BASE + '/index.html#/training');
  await page.click('[data-action="add-training"]');
  await page.waitForSelector('#training-form');
  await page.click('#training-form button[type="submit"]');
  await page.waitForFunction(() => location.hash.includes('/attendance'));
  await page.click('a.tab:has-text("Plan")');
  await page.waitForSelector('[data-action="add-block"]');
  await page.click('[data-action="add-block"]');
  await page.waitForSelector('#block-form');
  const drillFillSelect = await page.$('#block-form [data-drill-fill="activity"]');
  assert(!!drillFillSelect, 'Block form shows a Drill Library quick-fill select for the whole-team activity');
  await page.selectOption('#block-form [data-drill-fill="activity"]', { label: 'Shooting Practice' });
  const activityValue = await page.inputValue('#block-form [name="activity"]');
  assert(activityValue === 'Shooting Practice', 'Selecting a drill fills the activity text field, got: ' + activityValue);
  const resetSelectValue = await page.$eval('#block-form [data-drill-fill="activity"]', (el) => el.value);
  assert(resetSelectValue === '', 'Quick-fill select resets to placeholder after use');
  await page.click('#block-form button[type="submit"]');
  await page.waitForTimeout(200);

  const blockText = await page.textContent('#tab-content .card');
  assert(blockText.includes('Shooting Practice'), 'Saved plan block shows the quick-filled drill name: ' + blockText);

  // Reload and confirm everything survives.
  await page.reload();
  await page.waitForSelector('h1:has-text("Training")');
  const blockTextAfterReload = await page.textContent('#tab-content .card');
  assert(blockTextAfterReload.includes('Shooting Practice'), 'Plan block with quick-filled drill survives a full reload');

  console.log('\nConsole/page errors captured:', consoleErrors.length ? consoleErrors : 'none');
  assert(consoleErrors.length === 0, 'No console/page errors during the full Drill Library flow');

  await browser.close();
  console.log('\nALL DRILL LIBRARY TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
