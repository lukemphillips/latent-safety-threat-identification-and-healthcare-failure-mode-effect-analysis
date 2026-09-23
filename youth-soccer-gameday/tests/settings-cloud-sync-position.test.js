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
  await page.waitForTimeout(200);

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('#team-form');

  const sectionTitles = await page.$$eval('.section-title', (els) => els.map((e) => e.textContent.trim()));
  assert(sectionTitles[0] === 'Team', 'Team is the first settings section, got: ' + sectionTitles.join(', '));
  assert(sectionTitles[1] === 'Cloud Sync', 'Cloud Sync is the section right after Team, got: ' + sectionTitles.join(', '));

  assert(!(await page.$('[data-action="suggest-format"]')), 'Suggest format button is gone');
  const bodyText = await page.textContent('#app');
  assert(!bodyText.includes('Age-group format guide'), 'Age-group format guide heading is gone');
  assert(!bodyText.includes('FAI Player Development Plan'), 'FAI Player Development Plan reference table is gone');

  await page.goto(BASE + '/index.html#/help');
  await page.waitForSelector('h1:has-text("Help")');
  const helpText = await page.textContent('#app');
  assert(!helpText.includes('FAI/DDSL guide'), 'Help page no longer references the removed FAI/DDSL guide');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SETTINGS CLOUD-SYNC-POSITION TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
