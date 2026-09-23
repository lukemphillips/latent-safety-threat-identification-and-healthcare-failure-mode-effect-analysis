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

  // ============ CARDS DISABLED: button reads "Remove", modal offers Injury/Other only ============
  const removeBtnText = await page.textContent('[data-action="open-card-picker"]');
  assert(removeBtnText.includes('Remove'), `Quick button reads "Remove" when cards are disabled, got "${removeBtnText}"`);
  await page.click('[data-action="open-card-picker"]');
  await page.waitForSelector('#quick-card-form');
  const noCardOptions = await page.$$eval('#quick-card-form [name="kind"] option', (els) => els.map((e) => e.value));
  assert(noCardOptions.length === 2 && !noCardOptions.includes('yellow'), `No-cards team's quick modal only offers Injury/Other, got ${JSON.stringify(noCardOptions)}`);
  await page.click('[data-close-modal]');
  await page.waitForTimeout(150);

  // ============ CARDS ENABLED ============
  await page.goto(`${BASE}/index.html#/settings`);
  await page.waitForSelector('[name="enableCards"]');
  await page.check('[name="enableCards"]');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(150);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/live`);
  await page.waitForTimeout(150);

  const cardBtnText = await page.textContent('[data-action="open-card-picker"]');
  assert(cardBtnText.includes('Card'), `Quick button reads "Card" when cards are enabled, got "${cardBtnText}"`);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let freshGame = state.games.find((g) => g.id === scheduledGame.id);
  const onFieldIds = freshGame.live.onField;
  const gkId = freshGame.live.gkByPeriod[1];
  const targetPlayerId = onFieldIds[0];
  const targetPlayerName = state.players.find((p) => p.id === targetPlayerId).name;

  await page.click('[data-action="open-card-picker"]');
  await page.waitForSelector('#quick-card-form');

  // Player dropdown includes on-field outfield players AND the current GK
  // (same pool as Log Goal / GK Save) — same simple <select> pattern the
  // Goalkeeper modal uses.
  const playerOptionValues = await page.$$eval('#quick-card-form [name="playerId"] option', (els) => els.map((e) => e.value).filter(Boolean));
  assert(playerOptionValues.includes(targetPlayerId), 'Player dropdown includes on-field outfield players');
  assert(playerOptionValues.includes(gkId), 'Player dropdown also includes the current goalkeeper');

  // Kind dropdown defaults to Yellow.
  const selectedKind = await page.$eval('#quick-card-form [name="kind"]', (el) => el.value);
  assert(selectedKind === 'yellow', `Kind dropdown defaults to Yellow when the modal opens, got "${selectedKind}"`);

  // Log a first yellow via the quick picker.
  await page.selectOption('#quick-card-form [name="playerId"]', targetPlayerId);
  await page.click('#quick-card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(freshGame.live.onField.includes(targetPlayerId), 'Player with a single yellow (via quick picker) stays on the field');
  const yellowCount1 = freshGame.live.subLog.filter((e) => e.type === 'card' && e.cardType === 'yellow' && e.playerId === targetPlayerId).length;
  assert(yellowCount1 === 1, `First yellow logged via quick picker, got ${yellowCount1}`);

  // Log a second yellow for the SAME player via the quick picker — should auto-send-off.
  await page.click('[data-action="open-card-picker"]');
  await page.waitForSelector('#quick-card-form');
  const selectedKind2 = await page.$eval('#quick-card-form [name="kind"]', (el) => el.value);
  assert(selectedKind2 === 'yellow', 'Kind dropdown defaults to Yellow again on the second open');
  await page.selectOption('#quick-card-form [name="playerId"]', targetPlayerId);
  await page.click('#quick-card-form button[type="submit"]');
  await page.waitForSelector('[data-alert-ok]');
  const alertText = await page.textContent('.modal');
  assert(alertText.includes('second yellow card') && alertText.includes('automatically sent off'), `Second yellow via quick picker triggers the same auto-send-off alert, got: ${alertText}`);
  await page.click('[data-alert-ok]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(!freshGame.live.onField.includes(targetPlayerId), `${targetPlayerName} removed from the field after a second yellow via the quick picker`);
  assert((freshGame.live.sentOff || []).includes(targetPlayerId), 'Player excluded from further subs after the quick-picker second yellow');
  const sendOffEvent = freshGame.live.subLog.find((e) => e.type === 'send-off' && e.playerId === targetPlayerId);
  assert(sendOffEvent && sendOffEvent.reason === 'second yellow', 'Send-off correctly tagged "second yellow" when triggered via the quick picker');

  // ============ Straight red via quick picker on a different player sends them off immediately ============
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  const secondTargetId = freshGame.live.onField.find((id) => id !== targetPlayerId);

  await page.click('[data-action="open-card-picker"]');
  await page.waitForSelector('#quick-card-form');
  await page.selectOption('#quick-card-form [name="playerId"]', secondTargetId);
  await page.selectOption('#quick-card-form [name="kind"]', 'red');
  await page.click('#quick-card-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(!freshGame.live.onField.includes(secondTargetId), 'Straight red via quick picker removes the player from the field');
  assert((freshGame.live.sentOff || []).includes(secondTargetId), 'Straight red via quick picker excludes the player from further subs');
  const redEvent = freshGame.live.subLog.find((e) => e.type === 'card' && e.cardType === 'red' && e.playerId === secondTargetId);
  assert(redEvent, 'Red card event logged via the quick picker');

  assert(errors.length === 0, 'No console/page errors during quick-card-picker testing: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL QUICK CARD PICKER TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
