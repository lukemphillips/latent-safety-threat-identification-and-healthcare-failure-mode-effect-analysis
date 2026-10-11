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

  const backupBtn = await page.$('[data-action="backup-data"]');
  assert(!!backupBtn, 'Backup Team Data button exists');

  // Clicking it should trigger a real file download, not just a clipboard
  // copy — a file is what "Restore from Backup" / "Merge in Another
  // Coach's Backup" expect via their own "Choose Backup File" picker.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    backupBtn.click(),
  ]);
  const filename = download.suggestedFilename();
  assert(/^bootroom-backup-thunder-fc-\d{4}-\d{2}-\d{2}\.json$/.test(filename), `Downloaded file is named like bootroom-backup-thunder-fc-YYYY-MM-DD.json, got "${filename}"`);

  const stream = await download.createReadStream();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const content = Buffer.concat(chunks).toString('utf-8');
  const payload = JSON.parse(content);
  assert(payload.team && payload.team.name === 'Thunder FC', `Downloaded backup contains the team, got name "${payload.team && payload.team.name}"`);
  assert(Array.isArray(payload.players) && payload.players.length === 12, `Downloaded backup contains all 12 players, got ${payload.players && payload.players.length}`);
  assert(Array.isArray(payload.games), 'Downloaded backup contains the games array');

  // The clipboard/textarea fallback this already relied on still works
  // alongside the download — needed in a sandboxed context (like the
  // Claude Artifact preview) where a page-initiated download silently
  // no-ops.
  await page.waitForTimeout(200);
  const fallbackText = await page.inputValue('#backup-fallback');
  const fallbackPayload = JSON.parse(fallbackText);
  assert(fallbackPayload.team && fallbackPayload.team.name === 'Thunder FC', 'The textarea fallback is still populated with the same backup JSON');

  const btnTextAfter = (await backupBtn.textContent()).trim();
  assert(btnTextAfter.includes('Copied') || btnTextAfter.includes('Select the text below'), `Button shows a clipboard confirmation after click, got "${btnTextAfter}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SETTINGS BACKUP-DOWNLOAD TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
