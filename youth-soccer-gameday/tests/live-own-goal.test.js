// Requested: a way to log an own goal separately from a normal opponent
// goal — it counts for the opposition's score either way, but should never
// be credited as a 'goal-us' to whichever of our players it came off (that
// would wrongly inflate their scoring stats), and the match record should
// be able to say "own goal" rather than just "goal (opponent)". Covers:
// logging one with and without a named player, editing the attribution
// afterward, deleting one (score adjusts back down), the event log's
// plain-language label, and the post-match summary's own "Own Goals" line.
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

  // ============ Log an own goal, attributed to a specific player ============
  assert((await page.locator('[data-action="log-own-goal"]').count()) >= 1, 'An Own Goal action exists next to the opponent score');
  await page.click('[data-action="log-own-goal"]');
  await page.waitForSelector('#own-goal-form');
  const playerOptions = await page.locator('#own-goal-form [name="playerId"] option').allInnerTexts();
  assert(playerOptions[0].includes('Not sure'), 'The picker always offers an unattributed option first');
  assert(playerOptions.length > 1, 'On-pitch players are offered to attribute it to');

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let game = state.games.find((g) => g.id === scheduledGame.id);
  const onFieldId = game.live.onField[0];
  await page.selectOption('#own-goal-form [name="playerId"]', onFieldId);
  await page.click('#own-goal-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  assert(game.live.scoreThem === 1, `Own goal counts for the opposition's score, got ${game.live.scoreThem}`);
  const ownGoalEntry = game.live.subLog.find((e) => e.type === 'own-goal');
  assert(!!ownGoalEntry, 'An own-goal event is logged');
  assert(ownGoalEntry.playerId === onFieldId, `Attributed to the chosen player, got ${ownGoalEntry.playerId}`);
  assert(!game.live.subLog.some((e) => e.type === 'goal-us'), 'Crucially, NO goal-us entry was created — an own goal is never credited as one of our goals');

  // ============ The event log shows it in plain language, attributed ============
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  let eventsText = await page.locator('.sublog-item').allInnerTexts();
  const playerName = (await page.evaluate((pid) => JSON.parse(localStorage.getItem('ysg-data-v2')).players.find((p) => p.id === pid).name, onFieldId));
  assert(eventsText.some((t) => t.includes('Own goal') && t.includes(playerName)), `Match Events shows the own goal attributed by name, got: ${JSON.stringify(eventsText)}`);

  // ============ Editing it can clear the attribution ============
  const ownGoalRow = page.locator('.sublog-item', { hasText: 'Own goal' });
  await ownGoalRow.locator('[data-action="edit-sublog-entry"]').click();
  await page.waitForSelector('#edit-own-goal-form');
  await page.selectOption('#edit-own-goal-form [name="playerId"]', '');
  await page.click('#edit-own-goal-form button[type="submit"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  let entry = game.live.subLog.find((e) => e.type === 'own-goal');
  assert(entry.playerId === null && entry.playerName === '', 'Editing can clear the attribution back to unattributed');

  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  eventsText = await page.locator('.sublog-item').allInnerTexts();
  assert(eventsText.some((t) => t.trim().startsWith('😬 Own goal') && !t.includes('—')), `Unattributed own goal reads as plain "Own goal", got: ${JSON.stringify(eventsText)}`);

  // ============ Deleting it adjusts the score back down ============
  await page.locator('.sublog-item', { hasText: 'Own goal' }).locator('[data-action="edit-sublog-entry"]').click();
  await page.waitForSelector('#edit-own-goal-form');
  await page.click('[data-action="delete-entry"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  assert(game.live.scoreThem === 0, `Deleting the own goal adjusts the score back down, got ${game.live.scoreThem}`);
  assert(!game.live.subLog.some((e) => e.type === 'own-goal'), 'The own-goal entry is actually removed');

  // ============ Log one more (unattributed this time) and check the post-match summary ============
  await page.click('[data-action="log-own-goal"]');
  await page.waitForSelector('#own-goal-form');
  await page.click('#own-goal-form button[type="submit"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="end-game"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  const summaryText = await page.locator('.card', { hasText: 'Own Goals' }).innerText();
  assert(summaryText.includes('Unattributed'), `Post-match summary shows the Own Goals line, got: ${summaryText}`);
  assert(/\b1\b/.test(summaryText), `Summary shows exactly 1 own goal, got: ${summaryText}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE OWN-GOAL TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
