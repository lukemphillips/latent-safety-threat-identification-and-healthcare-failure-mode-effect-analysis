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

  // ============ Game Detail: back link to Matchday ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('.card[href*="/game/"]');
  await page.waitForTimeout(150);
  const gameBackLink = await page.$('a[href="#/schedule"]');
  assert(!!gameBackLink, 'Game Detail shows a link back to Matchday');
  const gameBackText = (await gameBackLink.textContent()).trim();
  assert(gameBackText.includes('Back to Matchday'), `Game Detail back link reads correctly, got "${gameBackText}"`);
  await gameBackLink.click();
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => location.hash) === '#/schedule', 'Clicking it actually returns to the Matchday list');

  // ============ Training Detail: back link to Training ============
  await page.goto(BASE + '/index.html#/training');
  await page.waitForTimeout(150);
  const trainingLink = await page.$('a[href*="/training/"]');
  assert(!!trainingLink, 'A training session link exists in the list');
  await trainingLink.click();
  await page.waitForTimeout(150);
  const trainingBackLink = await page.$('a[href="#/training"]');
  assert(!!trainingBackLink, 'Training Detail shows a link back to Training');
  const trainingBackText = (await trainingBackLink.textContent()).trim();
  assert(trainingBackText.includes('Back to Training'), `Training Detail back link reads correctly, got "${trainingBackText}"`);
  await trainingBackLink.click();
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => location.hash) === '#/training', 'Clicking it actually returns to the Training list');

  // ============ Help page: Home tab highlighted ============
  await page.goto(BASE + '/index.html#/');
  await page.waitForTimeout(150);
  await page.click('a[href="#/help"]');
  await page.waitForTimeout(150);
  const activeNavCount = await page.locator('.nav-item.active').count();
  assert(activeNavCount === 1, `Exactly one nav tab is highlighted on the Help page, got ${activeNavCount}`);
  const activeNavText = await page.locator('.nav-item.active').textContent();
  assert(activeNavText.includes('Home'), `Help page highlights the Home tab, got "${activeNavText}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL NAV BACK-LINK / HELP-HIGHLIGHT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
