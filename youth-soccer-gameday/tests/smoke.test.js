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
  await page.waitForTimeout(300);
  const homeText = await page.textContent('#app');
  assert(homeText.length > 0, 'Home page renders with fresh/empty data');

  // Load sample data and walk through the main sections that had this
  // session's work, since gaffer previously had none of it at all.
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(300);

  await page.goto(BASE + '/index.html#/training');
  await page.waitForSelector('h1:has-text("Training")');
  assert(await page.$('[data-action="add-training"]'), 'Training section loads (previously entirely missing from gaffer)');

  await page.goto(BASE + '/index.html#/drills');
  await page.waitForSelector('h1:has-text("Drill Library")');
  assert(await page.$('[data-action="add-drill"]'), 'Drill Library loads');

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const scheduledGame = state.games.find((g) => g.status === 'scheduled');
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);
  assert(await page.$('#formation-select'), 'Formations feature loads on the Squad tab');

  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}`);
  await page.waitForSelector('[data-action="start-game"]');
  await page.click('[data-action="start-game"]');
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/live`);
  await page.waitForTimeout(200);
  assert(await page.$('#live-pitch'), 'Live pitch view loads');
  assert(await page.$('[data-open-sub]'), 'Tap-to-substitute pitch chips render');

  assert(errors.length === 0, 'No console/page errors across the gaffer smoke test: ' + errors.join(', '));

  await browser.close();
  console.log('\nGAFFER SMOKE TEST PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
