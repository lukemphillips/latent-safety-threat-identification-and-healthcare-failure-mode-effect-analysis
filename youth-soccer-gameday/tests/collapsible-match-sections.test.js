// Three sections that used to always render fully expanded, now tucked
// behind a <details>/<summary> disclosure (same convention already used
// by Stats' "earlier weeks" and head-to-head cards): the Schedule page's
// "Past" matches, the game detail header's "Also on this date" card
// (shown when two+ fixtures share a date), and Stats' Goalkeeper
// Appearances table.
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

  // ============ Schedule page: Past matches is a closed-by-default disclosure ============
  const completedCount = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().games.filter((g) => g.status === 'completed').length;
  });
  assert(completedCount > 0, 'Sample data has at least one completed game to test with');

  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(200);
  const pastDetails = page.locator('details:has(summary:text-is("Past (' + completedCount + ')"))');
  assert((await pastDetails.count()) === 1, `Schedule page shows a "Past (${completedCount})" disclosure`);
  assert(!(await pastDetails.evaluate((el) => el.open)), 'Past matches section starts collapsed');
  await pastDetails.locator('summary').click();
  await page.waitForTimeout(100);
  assert(await pastDetails.evaluate((el) => el.open), 'Clicking the summary opens the Past section');
  assert((await pastDetails.locator('a.card').count()) >= completedCount, 'Opening it reveals the past game cards');

  // ============ Game detail: "Also on this date" is collapsible ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Sibling Match FC');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  const firstGame = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    return s.games.find((g) => g.status === 'scheduled' && g.opponent !== 'Sibling Match FC');
  });
  await page.evaluate(async ({ id, date }) => {
    const mod = await import('/js/store.js');
    mod.update((state) => {
      const sibling = state.games.find((g) => g.opponent === 'Sibling Match FC');
      sibling.date = date;
    });
  }, { id: firstGame.id, date: firstGame.date });

  await page.goto(`${BASE}/index.html#/game/${firstGame.id}`);
  await page.waitForTimeout(200);
  const siblingDetails = page.locator('details:has-text("Also on this date")');
  assert((await siblingDetails.count()) === 1, 'Game detail shows the "Also on this date" disclosure once a sibling fixture exists');
  assert(!(await siblingDetails.evaluate((el) => el.open)), 'It starts collapsed');
  await siblingDetails.locator('summary').click();
  await page.waitForTimeout(100);
  assert((await siblingDetails.locator('text=Sibling Match FC').count()) > 0, 'Opening it reveals the sibling match');

  // ============ Stats page: Goalkeeper Appearances is collapsible ============
  await page.goto(BASE + '/index.html#/stats');
  await page.waitForTimeout(200);
  const gkDetails = page.locator('details:has-text("Goalkeeper Appearances")');
  assert((await gkDetails.count()) === 1, 'Stats page shows the Goalkeeper Appearances disclosure');
  assert(!(await gkDetails.evaluate((el) => el.open)), 'It starts collapsed too');
  await gkDetails.locator('summary').click();
  await page.waitForTimeout(100);
  assert(await gkDetails.locator('table').isVisible(), 'Opening it reveals the appearances table');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL COLLAPSIBLE MATCH SECTIONS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
