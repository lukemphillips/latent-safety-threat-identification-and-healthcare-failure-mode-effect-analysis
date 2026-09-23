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

  // ============ CARDS DISABLED (default sample team) ============
  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(state.team.enableCards === false, 'Sample team starts with cards disabled');

  const gameId = await startFirstScheduledGame(page);

  // The on-field grid's card/remove control is now a small, muted corner
  // icon (not a full-width red button) so it can't easily be caught by
  // accident during a substitution tap — the distinguishing wording now
  // lives in its aria-label/title rather than visible text.
  const removeBtnLabel = await page.getAttribute('.onfield-grid [data-action="log-card"]', 'aria-label');
  assert(removeBtnLabel.includes('Remove from match'), `Non-card team's corner button is labelled "Remove from match", got "${removeBtnLabel}"`);

  // GK card's card/remove control is now also the small "⋯" icon, same as
  // the on-field grid — the distinguishing wording lives in aria-label.
  const gkRemoveBtnLabel = await page.getAttribute('.card [data-action="log-card"]', 'aria-label');
  assert(gkRemoveBtnLabel.includes('Remove from match'), `Non-card team's GK corner button is labelled "Remove from match", got "${gkRemoveBtnLabel}"`);

  await page.click('.onfield-grid [data-action="log-card"]');
  await page.waitForSelector('#card-form');
  const kindOptions = await page.$$eval('#card-form [name="kind"] option', (els) => els.map((e) => e.value));
  assert(kindOptions.length === 2 && kindOptions.includes('injury') && kindOptions.includes('other') && !kindOptions.includes('yellow'), `Non-card team's modal only offers Injury/Other, got ${JSON.stringify(kindOptions)}`);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const freshGame1 = state.games.find((g) => g.id === gameId);
  const firstOnFieldId = freshGame1.live.onField[0];

  await page.selectOption('#card-form [name="kind"]', 'injury');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let freshGame = state.games.find((g) => g.id === gameId);
  assert(!freshGame.live.onField.includes(firstOnFieldId), 'Injured player removed from on-field list');
  assert((freshGame.live.sentOff || []).includes(firstOnFieldId), 'Injured player added to sentOff (excluded from further subs)');
  const injuryEvent = freshGame.live.subLog.find((e) => e.type === 'send-off' && e.playerId === firstOnFieldId);
  assert(injuryEvent && injuryEvent.reason === 'injury', `Send-off event correctly tagged with reason "injury", got ${JSON.stringify(injuryEvent)}`);

  let liveText = await page.textContent('#app');
  assert(liveText.includes('(injury)'), 'Match Events log shows the injury reason');

  // Confirm the injured player no longer appears as a bench option (excluded from subs).
  const benchIds = await page.$$eval('[data-bench-player]', (els) => els.map((e) => e.dataset.benchPlayer));
  assert(!benchIds.includes(firstOnFieldId), 'Injured player does not show up on the bench for further substitution');

  // ============ CARDS ENABLED: second yellow auto-send-off ============
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[name="enableCards"]');
  await page.check('[name="enableCards"]');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(200);

  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(200);
  const cardBtnLabel = await page.getAttribute('.onfield-grid [data-action="log-card"]', 'aria-label');
  assert(cardBtnLabel.includes('Card / remove'), `Cards-enabled team's corner button is labelled "Card / remove", got "${cardBtnLabel}"`);
  const gkCardBtnLabel = await page.getAttribute('.card [data-action="log-card"]', 'aria-label');
  assert(gkCardBtnLabel.includes('Card / remove'), `Cards-enabled team's GK corner button is labelled "Card / remove", got "${gkCardBtnLabel}"`);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  const secondOnFieldId = freshGame.live.onField[0];

  // First yellow — should stay on.
  await page.click(`[data-action="log-card"][data-player-id="${secondOnFieldId}"]`);
  await page.waitForSelector('#card-form');
  const fullKindOptions = await page.$$eval('#card-form [name="kind"] option', (els) => els.map((e) => e.value));
  assert(fullKindOptions.length === 4 && fullKindOptions.includes('yellow') && fullKindOptions.includes('red'), `Cards-enabled modal offers all four options, got ${JSON.stringify(fullKindOptions)}`);
  await page.selectOption('#card-form [name="kind"]', 'yellow');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert(freshGame.live.onField.includes(secondOnFieldId), 'Player with a single yellow card stays on the field');
  assert(!(freshGame.live.sentOff || []).includes(secondOnFieldId), 'Player with a single yellow is not sent off');

  // Second yellow — should auto-send-off with a clear alert.
  await page.click(`[data-action="log-card"][data-player-id="${secondOnFieldId}"]`);
  await page.waitForSelector('#card-form');
  const warnText = await page.textContent('#card-form');
  assert(warnText.includes('automatically send them off'), 'Modal warns up front that a second yellow will auto-send-off');
  await page.selectOption('#card-form [name="kind"]', 'yellow');
  await page.click('#card-form button[type="submit"]');
  await page.waitForSelector('[data-alert-ok]');
  const alertText = await page.textContent('.modal');
  assert(alertText.includes('second yellow card') && alertText.includes('automatically sent off'), `Alert clearly explains the automatic send-off, got: ${alertText}`);
  await page.click('[data-alert-ok]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert(!freshGame.live.onField.includes(secondOnFieldId), 'Player with a second yellow is automatically removed from the field');
  assert((freshGame.live.sentOff || []).includes(secondOnFieldId), 'Player with a second yellow is automatically excluded from further subs');
  const yellowCount = freshGame.live.subLog.filter((e) => e.type === 'card' && e.cardType === 'yellow' && e.playerId === secondOnFieldId).length;
  assert(yellowCount === 2, `Both yellow cards are logged for stats purposes, got ${yellowCount}`);
  const secondYellowSendOff = freshGame.live.subLog.find((e) => e.type === 'send-off' && e.playerId === secondOnFieldId);
  assert(secondYellowSendOff && secondYellowSendOff.reason === 'second yellow', 'Send-off event tagged with reason "second yellow"');

  liveText = await page.textContent('#app');
  assert(liveText.includes('(second yellow)'), 'Match Events log shows "second yellow" as the send-off reason');

  // ============ Straight red card ============
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  const thirdOnFieldId = freshGame.live.onField.find((id) => id !== secondOnFieldId);
  await page.click(`[data-action="log-card"][data-player-id="${thirdOnFieldId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'red');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === gameId);
  assert(!freshGame.live.onField.includes(thirdOnFieldId), 'Straight red card removes the player from the field');
  assert((freshGame.live.sentOff || []).includes(thirdOnFieldId), 'Straight red card excludes the player from further subs');
  const redEvent = freshGame.live.subLog.find((e) => e.type === 'card' && e.cardType === 'red' && e.playerId === thirdOnFieldId);
  assert(redEvent, 'Red card event logged');

  assert(errors.length === 0, 'No console/page errors during send-off testing: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SEND-OFF TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
