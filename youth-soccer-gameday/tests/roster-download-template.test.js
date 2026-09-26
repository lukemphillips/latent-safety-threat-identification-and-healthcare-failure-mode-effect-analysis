const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click('[data-action="import-roster"]');
  await page.waitForTimeout(150);

  const downloadBtn = await page.$('[data-action="download-template"]');
  assert(!!downloadBtn, 'Download CSV Template button exists');
  const btnText = (await downloadBtn.textContent()).trim();
  assert(btnText.includes('Download CSV Template'), `Button reads "Download CSV Template", got "${btnText}"`);

  const copyBtn = await page.$('[data-action="copy-template"]');
  assert(!copyBtn, 'The old "copy to clipboard" action no longer exists');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.click(),
  ]);
  const filename = download.suggestedFilename();
  assert(filename === 'roster-template.csv', `Downloaded file is named roster-template.csv, got "${filename}"`);

  const stream = await download.createReadStream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const content = Buffer.concat(chunks).toString('utf-8');
  assert(content.includes('Name,Jersey #,Position,Stream,Guardian Name,Guardian Phone'), `Downloaded CSV has the expected header row, got: ${content.slice(0, 80)}`);
  assert(content.includes('Ava Martinez'), 'Downloaded CSV includes the example row');

  await page.waitForTimeout(150);
  const btnTextAfter = (await downloadBtn.textContent()).trim();
  assert(btnTextAfter.includes('Downloaded'), `Button shows a confirmation after click, got "${btnTextAfter}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL ROSTER DOWNLOAD-TEMPLATE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
