// Requested: let a Matchday-role coach add a fill-in player (short on
// numbers, a borrowed player from the other team, etc.) to a match squad.
// The Apps Script server has always accepted a brand-new player pushed
// from a Matchday token (see cloudSync.js's buildAppsScript — only EDITS
// to an existing player are rejected from that token) but the app's own
// UI had no way to create one at all on a Matchday device: the Roster
// tab's "+ Add" is fully blocked there. The new "+ Fill-In Player" button
// on a game's Squad tab (scheduled and live) is the client-side door for
// that — adds a genuinely new, non-guest roster player and marks them
// present for this match, without going through the blocked Roster form.
// Covers: it's available and works on a Matchday-role device, the player
// actually ends up usable (selectable on the pitch, not hidden like a
// Training-only "guest" would be), and it still works on a live match too.
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

  // ============ Simulate a Matchday-role device — the whole point of this feature ============
  await page.evaluate(() => {
    localStorage.setItem('ysg-cloud-sync-v1', JSON.stringify({
      url: 'https://example.com/exec?token=matchdaytoken',
      role: 'matchday',
      coachName: 'Assistant Coach',
      lastSyncedAt: new Date().toISOString(),
    }));
  });

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const scheduledGame = state.games.find((g) => g.status === 'scheduled');

  // ============ The Roster tab's own "+ Add" is still blocked on Matchday, as before ============
  await page.goto(BASE + '/index.html#/roster');
  await page.waitForSelector('[data-action="add-player"]');
  await page.click('[data-action="add-player"]');
  await page.waitForSelector('[data-alert-ok]');
  const alertText = await page.textContent('.modal-body');
  assert(alertText.includes('Full Edit device'), `Roster's own Add is still blocked on Matchday, got: ${alertText}`);
  await page.click('[data-alert-ok]');

  // ============ But the Squad tab's Fill-In Player button works fine on Matchday ============
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.waitForSelector('[data-action="add-fill-in"]');
  await page.click('[data-action="add-fill-in"]');
  await page.waitForSelector('#fill-in-form');
  await page.fill('#fill-in-form [name="name"]', 'Jamie Guestly');
  await page.fill('#fill-in-form [name="jerseyNumber"]', '77');
  await page.click('#fill-in-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let game = state.games.find((g) => g.id === scheduledGame.id);
  const fillIn = state.players.find((p) => p.name === 'Jamie Guestly');
  assert(!!fillIn, 'The fill-in player was actually created');
  assert(fillIn.jerseyNumber === 77, `Jersey number saved, got ${fillIn.jerseyNumber}`);
  assert(fillIn.active === true, 'Fill-in player is active');
  assert(fillIn.isGuest === false, 'Fill-in player is NOT flagged isGuest — that flag hides someone from every match screen, the opposite of what a fill-in needs');
  assert((game.presentIds || []).includes(fillIn.id), 'Fill-in player is marked present for this match');

  // ============ They're genuinely usable — selectable on the bench/pitch, not hidden ============
  const benchText = await page.locator('.player-grid, .pitch-wrap').allInnerTexts();
  assert(benchText.some((t) => t.includes('Jamie Guestly')), `Fill-in player actually shows up on the Squad tab (bench), got: ${JSON.stringify(benchText)}`);

  // ============ Duplicate jersey number gets the same advisory confirm as the full Roster form ============
  await page.click('[data-action="add-fill-in"]');
  await page.waitForSelector('#fill-in-form');
  await page.fill('#fill-in-form [name="name"]', 'Second Fill-In');
  await page.fill('#fill-in-form [name="jerseyNumber"]', '77');
  await page.click('#fill-in-form button[type="submit"]');
  await page.waitForSelector('[data-confirm-ok]');
  const dupeText = await page.textContent('.modal-body');
  assert(dupeText.includes('already wears #77'), `Dupe jersey number triggers an advisory confirm, got: ${dupeText}`);
  await page.click('[data-confirm-cancel]');
  await page.waitForTimeout(100);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!state.players.some((p) => p.name === 'Second Fill-In'), 'Cancelling the dupe-number confirm does not add the player');

  // ============ Also works from a LIVE match's Squad tab ============
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.waitForSelector('[data-action="mark-all-present"]');
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(100);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}`);
  await page.waitForSelector('[data-action="start-game"]');
  await page.click('[data-action="start-game"]');
  await page.waitForTimeout(200);

  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.waitForSelector('[data-action="add-fill-in"]');
  await page.click('[data-action="add-fill-in"]');
  await page.waitForSelector('#fill-in-form');
  await page.fill('#fill-in-form [name="name"]', 'Live Match Fill-In');
  await page.click('#fill-in-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  const liveFillIn = state.players.find((p) => p.name === 'Live Match Fill-In');
  assert(!!liveFillIn, 'Fill-in player added from a LIVE game\'s Squad tab was also created');
  assert((game.presentIds || []).includes(liveFillIn.id), 'Live fill-in player is marked present');
  assert(game.status === 'live', 'Game is still live throughout (sanity check)');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SQUAD ADD-FILL-IN-PLAYER TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
