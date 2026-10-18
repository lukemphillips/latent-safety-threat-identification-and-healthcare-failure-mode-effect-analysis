// Follow-up to the "Own Goal" feature: that one covers one of OUR players
// putting it in our OWN net (benefits the opposition). This covers the
// mirror case — one of THEIR players scoring into THEIR own net, which
// benefits US. It lives inside the existing "Us +1" / Log Goal flow
// (an "⚠️ Opponent own goal" choice in the scorer picker) rather than a
// separate button, since on the scoreboard it's exactly the same event as
// every other option there: our score going up. The app has no opposition
// roster to attribute it to a named player, so it takes an optional
// free-text note instead. Covers: logging one with and without a note,
// confirming it's never credited as 'goal-us' to any of our players,
// editing the note afterward, deleting it (score adjusts back down), the
// event log's label, and the post-match summary's own line for it.
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

  // ============ The "Opponent own goal" choice lives inside Log Goal, with a note field ============
  await page.click('[data-action="log-goal-us"]');
  await page.waitForSelector('#goal-form');
  const scorerOptionsText = await page.locator('#goal-form [name="scorer"] option').allInnerTexts();
  assert(scorerOptionsText.some((t) => t.includes('Opponent own goal')), `Scorer picker offers an opponent-own-goal choice, got: ${JSON.stringify(scorerOptionsText)}`);
  assert((await page.locator('[data-opp-og-note-field]').isHidden()), 'The note field stays hidden until opponent own goal is actually chosen');

  await page.selectOption('#goal-form [name="scorer"]', { label: '⚠️ Opponent own goal' });
  await page.waitForTimeout(100);
  assert((await page.locator('[data-assist-field]').isHidden()), 'Picking opponent own goal hides the (irrelevant) Assist field');
  assert((await page.locator('[data-opp-og-note-field]').isVisible()), 'And reveals the note field instead');

  await page.fill('#goal-form [name="oppOgNote"]', "their #4");
  await page.click('#goal-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let game = state.games.find((g) => g.id === scheduledGame.id);
  assert(game.live.scoreUs === 1, `Opponent own goal counts for OUR score, got ${game.live.scoreUs}`);
  const entry1 = game.live.subLog.find((e) => e.type === 'opponent-own-goal');
  assert(!!entry1, 'An opponent-own-goal event is logged');
  assert(entry1.note === 'their #4', `The free-text note is saved, got "${entry1.note}"`);
  assert(!game.live.subLog.some((e) => e.type === 'goal-us'), 'Crucially, NO goal-us entry was created — never credited to any of our players');

  // ============ The event log shows it in plain language, with the note ============
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  let eventsText = await page.locator('.sublog-item').allInnerTexts();
  assert(eventsText.some((t) => t.includes('Opponent own goal') && t.includes('their #4')), `Match Events shows it with the note, got: ${JSON.stringify(eventsText)}`);

  // ============ Editing can change the note ============
  await page.locator('.sublog-item', { hasText: 'Opponent own goal' }).locator('[data-action="edit-sublog-entry"]').click();
  await page.waitForSelector('#edit-opp-og-form');
  assert(await page.locator('#edit-opp-og-form [name="note"]').inputValue() === 'their #4', 'Edit form is pre-filled with the existing note');
  await page.fill('#edit-opp-og-form [name="note"]', 'their keeper, own net off a backpass');
  await page.click('#edit-opp-og-form button[type="submit"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  let entry = game.live.subLog.find((e) => e.type === 'opponent-own-goal');
  assert(entry.note === 'their keeper, own net off a backpass', `Note was actually updated, got "${entry.note}"`);
  assert(game.live.scoreUs === 1, 'Editing the note does not touch the score');

  // ============ Deleting it adjusts the score back down ============
  await page.locator('.sublog-item', { hasText: 'Opponent own goal' }).locator('[data-action="edit-sublog-entry"]').click();
  await page.waitForSelector('#edit-opp-og-form');
  await page.click('[data-action="delete-entry"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === scheduledGame.id);
  assert(game.live.scoreUs === 0, `Deleting it adjusts the score back down, got ${game.live.scoreUs}`);
  assert(!game.live.subLog.some((e) => e.type === 'opponent-own-goal'), 'The entry is actually removed');

  // ============ Log one more (no note) and check the post-match summary ============
  await page.click('[data-action="log-goal-us"]');
  await page.waitForSelector('#goal-form');
  await page.selectOption('#goal-form [name="scorer"]', { label: '⚠️ Opponent own goal' });
  await page.click('#goal-form button[type="submit"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="end-game"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  const summaryText = await page.locator('.card', { hasText: 'Opponent Own Goals' }).innerText();
  assert(summaryText.includes('No note'), `Post-match summary shows the Opponent Own Goals line, got: ${summaryText}`);
  assert(/\b1\b/.test(summaryText), `Summary shows exactly 1, got: ${summaryText}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE OPPONENT-OWN-GOAL TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
