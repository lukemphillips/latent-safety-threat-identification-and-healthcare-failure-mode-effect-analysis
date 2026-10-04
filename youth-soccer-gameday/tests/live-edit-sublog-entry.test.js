// Requested: the ability to correct an already-logged in-game event —
// scorer being the named example — both before and after the match ends.
// Covers editing a goal's scorer/assist, deleting a goal (score
// adjusts), editing a save's credited player, deleting a save, deleting
// an opponent goal, and that all of this still works once the match is
// completed, not just while live.
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

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const scheduledGame = state.games.find((g) => g.status === 'scheduled');

  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}`);
  await page.waitForSelector('[data-action="start-game"]');
  await page.click('[data-action="start-game"]');
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/live`);
  await page.waitForTimeout(200);

  // ============ Log one of each editable event type ============
  await page.click('[data-action="log-goal-us"]');
  await page.waitForSelector('#goal-form');
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const onFieldIds = state.games.find((g) => g.id === scheduledGame.id).live.onField;
  const scorerId = onFieldIds[0];
  const otherPlayerId = onFieldIds[1];
  await page.selectOption('#goal-form [name="scorer"]', scorerId);
  await page.click('#goal-form button[type="submit"]');
  await page.waitForTimeout(150);

  await page.click('[data-action="log-save"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="log-goal-them"]');
  await page.waitForTimeout(150);

  // Expand Match Events so the edit buttons are actually visible/clickable.
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  await page.waitForTimeout(150);

  const editButtons = () => page.$$('[data-action="edit-sublog-entry"]');
  assert((await editButtons()).length === 3, `All 3 editable entries (goal-us, save, goal-them) show an edit button, got ${(await editButtons()).length}`);

  // ============ Edit the goal: change scorer and add an assist ============
  // Entries render most-recent-first, so index 2 (the 3rd button) is the goal we logged first.
  await (await editButtons())[2].click();
  await page.waitForSelector('#edit-goal-form');
  await page.selectOption('#edit-goal-form [name="scorer"]', otherPlayerId);
  await page.selectOption('#edit-goal-form [name="assist"]', scorerId);
  await page.click('#edit-goal-form button[type="submit"]');
  await page.waitForTimeout(150);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let game = state.games.find((g) => g.id === scheduledGame.id);
  let goalEntry = game.live.subLog.find((e) => e.type === 'goal-us');
  assert(goalEntry.scorerId === otherPlayerId, `Scorer was actually corrected, got ${goalEntry.scorerId}`);
  assert(goalEntry.assistId === scorerId, `Assist was set on the corrected entry, got ${goalEntry.assistId}`);
  assert(game.live.scoreUs === 1, `Editing the scorer doesn't touch the score, still ${game.live.scoreUs}`);

  // ============ Edit the save: reassign credit ============
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  await (await editButtons())[1].click();
  await page.waitForSelector('#edit-save-form');
  await page.selectOption('#edit-save-form [name="player"]', otherPlayerId);
  await page.click('#edit-save-form button[type="submit"]');
  await page.waitForTimeout(150);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  const saveEntry = game.live.subLog.find((e) => e.type === 'save');
  assert(saveEntry.playerId === otherPlayerId, `Save credit was reassigned, got ${saveEntry.playerId}`);

  // ============ Delete the opponent goal ============
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  assert(game.live.scoreThem === 1, 'Opponent score is 1 before deleting that goal');
  await (await editButtons())[0].click();
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  assert(game.live.scoreThem === 0, `Deleting the opponent goal decremented their score, got ${game.live.scoreThem}`);
  assert(!game.live.subLog.some((e) => e.type === 'goal-them'), 'The goal-them entry is actually gone from the log');

  // ============ End the match, then confirm editing still works post-match ============
  await page.click('[data-action="end-game"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });

  const editButtonsAfter = await page.$$('[data-action="edit-sublog-entry"]');
  assert(editButtonsAfter.length === 2, `Edit buttons are still present after the match ends, got ${editButtonsAfter.length}`);
  // The remaining 2 entries are the goal (idx 1, most recent-first after
  // removing goal-them) and the save (idx 0).
  await editButtonsAfter[1].click();
  await page.waitForSelector('#edit-goal-form');
  await page.click('[data-action="delete-entry"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  assert(game.status === 'completed', 'Game is still completed after a post-match edit');
  assert(game.live.scoreUs === 0, `Deleting the goal after the match ended still correctly adjusted the final score, got ${game.live.scoreUs}`);
  assert(!game.live.subLog.some((e) => e.type === 'goal-us'), 'The goal entry is gone after a post-match delete');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE EDIT-SUBLOG-ENTRY TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
