const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

async function startFirstScheduledGame(page) {
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
  return scheduledGame.id;
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
  await page.check('[name="enableCards"]');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(200);

  const gameId = await startFirstScheduledGame(page);

  // ============ CASE 1: Injury, then legitimately Recover (not a mistake) ============
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let freshGame = state.games.find((g) => g.id === gameId);
  const injuredId = freshGame.live.onField[0];

  await page.click(`.onfield-grid [data-action="log-card"][data-player-id="${injuredId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'injury');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert((freshGame.live.sentOff || []).includes(injuredId), 'Injured player is sent off');

  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(150);
  await page.click(`[data-action="recover-player"][data-player-id="${injuredId}"]`);
  await page.waitForSelector('#recover-form');
  const recoverBodyText = await page.textContent('#recover-form');
  assert(recoverBodyText.includes('injury'), `Recover dialog names the reason (injury), got: ${recoverBodyText}`);
  const mistakeCheckedByDefault = await page.isChecked('#recover-form [name="mistake"]');
  assert(mistakeCheckedByDefault === false, '"Logged by mistake" checkbox defaults unchecked');
  await page.click('#recover-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert(!(freshGame.live.sentOff || []).includes(injuredId), 'Recovered player is no longer sent off');
  const benchIds1 = await page.$$eval('[data-bench-player]', (els) => els.map((e) => e.dataset.benchPlayer));
  assert(benchIds1.includes(injuredId), 'Recovered (non-mistake) player shows up on the bench again');
  const injuryEventStillThere = freshGame.live.subLog.some((e) => e.type === 'send-off' && e.playerId === injuredId && e.reason === 'injury');
  assert(injuryEventStillThere, 'Original injury send-off record is kept (legitimate recovery, not a mistake)');
  const recoveredEvent = freshGame.live.subLog.some((e) => e.type === 'recovered' && e.playerId === injuredId);
  assert(recoveredEvent, 'A "recovered" event is logged for the record');
  let liveText = await page.textContent('#app');
  assert(liveText.includes('Back available'), 'Match Events log shows the recovery');

  // ============ CASE 2: Straight red card logged by mistake, fully undone ============
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  const wrongPlayerId = freshGame.live.onField.find((id) => id !== injuredId);

  await page.click(`.onfield-grid [data-action="log-card"][data-player-id="${wrongPlayerId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'red');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert((freshGame.live.sentOff || []).includes(wrongPlayerId), 'Red-carded player is sent off');
  const redCountBefore = freshGame.live.subLog.filter((e) => e.type === 'card' && e.cardType === 'red').length;
  assert(redCountBefore === 1, 'One red card logged so far');

  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(150);
  await page.click(`[data-action="recover-player"][data-player-id="${wrongPlayerId}"]`);
  await page.waitForSelector('#recover-form');
  const redReasonText = await page.textContent('#recover-form');
  assert(redReasonText.includes('red card'), `Recover dialog names the reason (red card), got: ${redReasonText}`);
  await page.check('#recover-form [name="mistake"]');
  await page.click('#recover-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert(!(freshGame.live.sentOff || []).includes(wrongPlayerId), 'Mistakenly red-carded player is no longer sent off');
  const redCountAfter = freshGame.live.subLog.filter((e) => e.type === 'card' && e.cardType === 'red').length;
  assert(redCountAfter === 0, `The erroneous red card is removed from the record entirely, got ${redCountAfter} remaining`);
  const noRecoveredEventForRed = !freshGame.live.subLog.some((e) => e.type === 'recovered' && e.playerId === wrongPlayerId);
  assert(noRecoveredEventForRed, 'No "recovered" event is added for a corrected mistake (record reads as if it never happened)');
  const benchIds2 = await page.$$eval('[data-bench-player]', (els) => els.map((e) => e.dataset.benchPlayer));
  assert(benchIds2.includes(wrongPlayerId), 'Corrected player shows up on the bench again');

  // ============ CASE 3: Second yellow auto-send-off, corrected as a mistake — first yellow survives ============
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  const twoYellowId = freshGame.live.onField.find((id) => id !== injuredId && id !== wrongPlayerId);

  await page.click(`.onfield-grid [data-action="log-card"][data-player-id="${twoYellowId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'yellow');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  await page.click(`.onfield-grid [data-action="log-card"][data-player-id="${twoYellowId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'yellow');
  await page.click('#card-form button[type="submit"]');
  await page.waitForSelector('[data-alert-ok]');
  await page.click('[data-alert-ok]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert((freshGame.live.sentOff || []).includes(twoYellowId), 'Second-yellow player is sent off');
  let yellowCount = freshGame.live.subLog.filter((e) => e.type === 'card' && e.cardType === 'yellow' && e.playerId === twoYellowId).length;
  assert(yellowCount === 2, `Both yellows logged before correction, got ${yellowCount}`);

  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(150);
  await page.click(`[data-action="recover-player"][data-player-id="${twoYellowId}"]`);
  await page.waitForSelector('#recover-form');
  const secondYellowReasonText = await page.textContent('#recover-form');
  assert(secondYellowReasonText.includes('second yellow'), `Recover dialog names the reason (second yellow), got: ${secondYellowReasonText}`);
  await page.check('#recover-form [name="mistake"]');
  await page.click('#recover-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert(!(freshGame.live.sentOff || []).includes(twoYellowId), 'Corrected second-yellow player is no longer sent off');
  yellowCount = freshGame.live.subLog.filter((e) => e.type === 'card' && e.cardType === 'yellow' && e.playerId === twoYellowId).length;
  assert(yellowCount === 1, `Only the erroneous (second) yellow is removed — the legitimate first yellow remains, got ${yellowCount} remaining`);
  const sendOffEventGone = !freshGame.live.subLog.some((e) => e.type === 'send-off' && e.playerId === twoYellowId && e.reason === 'second yellow');
  assert(sendOffEventGone, 'The auto-generated send-off event is also removed');

  assert(errors.length === 0, 'No console/page errors during recover testing: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL RECOVER TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
