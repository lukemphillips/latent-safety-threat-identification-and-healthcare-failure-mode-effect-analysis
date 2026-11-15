// Stats used to be one long scroll through Player of the Week, Leaders,
// Goalkeeper Appearances, History, and Head-to-Head all stacked on top of
// each other. Now split into tabs (Leaders/History/Head-to-Head/Awards),
// same URL-routed pattern as Training's own tabs.
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

  // ============ Bare #/stats lands on Leaders, with a tab bar ============
  await page.goto(BASE + '/index.html#/stats');
  await page.waitForTimeout(150);
  const tabTexts = await page.$$eval('.tabs a.tab', (els) => els.map((e) => e.textContent.trim()));
  assert(JSON.stringify(tabTexts) === JSON.stringify(['Leaders', 'History', 'Head-to-Head', 'Awards']), `Tabs are ordered Leaders/History/Head-to-Head/Awards, got ${JSON.stringify(tabTexts)}`);
  const activeTab = await page.textContent('.tabs a.tab.active');
  assert(activeTab.trim() === 'Leaders', `Leaders is the active/landing tab on bare #/stats, got "${activeTab}"`);
  assert(!!(await page.$('table th[data-sort-col]')), 'Leaders table is visible immediately');
  assert(!(await page.$('details[data-month]')), 'History content is not shown on the Leaders tab');

  // ============ Each tab is its own URL, loads only that tab's content ============
  await page.goto(BASE + '/index.html#/stats/history');
  await page.waitForTimeout(150);
  assert((await page.textContent('.tabs a.tab.active')).trim() === 'History', 'Navigating straight to #/stats/history marks History active');
  assert(!(await page.$('table th[data-sort-col]')), 'Leaders table is not shown on the History tab');

  await page.goto(BASE + '/index.html#/stats/h2h');
  await page.waitForTimeout(150);
  assert((await page.textContent('.tabs a.tab.active')).trim() === 'Head-to-Head', 'Navigating straight to #/stats/h2h marks Head-to-Head active');

  await page.goto(BASE + '/index.html#/stats/awards');
  await page.waitForTimeout(150);
  assert((await page.textContent('.tabs a.tab.active')).trim() === 'Awards', 'Navigating straight to #/stats/awards marks Awards active');
  assert(!!(await page.$('#recent-weeks')), 'Player of the Week content lives on the Awards tab');

  // ============ Clicking between tabs actually swaps content ============
  await page.goto(BASE + '/index.html#/stats');
  await page.waitForTimeout(150);
  await page.click('.tabs a.tab:has-text("History")');
  await page.waitForTimeout(150);
  assert(!!(await page.$('.section-title, .card')), 'History tab renders something');
  assert(!(await page.$('table th[data-sort-col]')), 'Switching to History hides the Leaders table');

  // ============ Setting a Player of the Week award keeps you on the Awards tab ============
  await page.goto(BASE + '/index.html#/stats/awards');
  await page.waitForTimeout(150);
  const setAwardBtn = await page.$('[data-action="set-week-award"]');
  if (setAwardBtn) {
    await setAwardBtn.click();
    await page.waitForSelector('#week-award-form');
    await page.click('#week-award-form input[name="players"]');
    await page.click('#week-award-form button[type="submit"]');
    await page.waitForTimeout(150);
    assert((await page.textContent('.tabs a.tab.active')).trim() === 'Awards', 'Saving an award re-renders back on the Awards tab, not Leaders');
  }

  // ============ Goalkeeper Appearances still lives on the Leaders tab ============
  await page.goto(BASE + '/index.html#/stats/leaders');
  await page.waitForTimeout(150);
  assert((await page.locator('details:has-text("Goalkeeper Appearances")').count()) === 1, 'Goalkeeper Appearances disclosure is on the Leaders tab');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL STATS TABS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
