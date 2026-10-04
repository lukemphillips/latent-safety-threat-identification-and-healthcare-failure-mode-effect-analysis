// Requested: when swapping goalkeepers, ask where the outgoing keeper
// should go — bench (sit out) or field (take over the incoming keeper's
// vacated outfield spot) — rather than always defaulting to the bench
// with no choice.
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

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let freshGame = state.games.find((g) => g.id === scheduledGame.id);
  const prevGkId = freshGame.live.gkByPeriod[freshGame.live.currentPeriod];
  const outfieldPlayerId = freshGame.live.onField.find((id) => id !== prevGkId);
  const prevGkSlotBefore = Object.entries(freshGame.lineup.slots).find(([, pid]) => pid === outfieldPlayerId)?.[0];
  assert(prevGkSlotBefore, 'The player we\'re about to promote to GK starts in some outfield slot');

  // ============ Choosing the new keeper (who IS on the field) reveals the destination field ============
  await page.click('[data-action="change-gk"]');
  await page.waitForSelector('#gk-form');
  assert(await page.isHidden('#prev-gk-destination-field'), 'Destination field starts hidden before picking a new keeper');
  await page.selectOption('#gk-form [name="gk"]', outfieldPlayerId);
  assert(await page.isVisible('#prev-gk-destination-field'), 'Destination field appears once an on-field player is chosen as the new keeper');
  const destLabel = await page.textContent('#prev-gk-destination-label');
  assert(destLabel.includes('go?'), `Destination label asks where the outgoing keeper should go, got "${destLabel}"`);

  // ============ Choosing "Field" sends the old keeper to the new keeper's vacated slot ============
  await page.selectOption('#gk-form [name="prevGkDestination"]', 'field');
  await page.click('#gk-form button[type="submit"]');
  await page.waitForTimeout(200);
  const confirmBtn = await page.$('[data-confirm-ok]');
  if (confirmBtn) { await confirmBtn.click(); await page.waitForTimeout(200); }

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(freshGame.live.gkByPeriod[freshGame.live.currentPeriod] === outfieldPlayerId, 'New GK is recorded for the current period');
  assert(freshGame.live.onField.includes(prevGkId), `Outgoing keeper is now on the field, got onField: ${JSON.stringify(freshGame.live.onField)}`);
  assert(!freshGame.live.onField.includes(outfieldPlayerId), 'New keeper is no longer counted as an on-field outfield player (they\'re in goal)');
  assert(freshGame.lineup.slots[prevGkSlotBefore] === prevGkId, `Outgoing keeper took over the exact slot the new keeper vacated, got ${JSON.stringify(freshGame.lineup.slots)}`);
  assert(freshGame.live.stintStart[prevGkId] != null, 'Outgoing keeper got a fresh stint-start timestamp for their new outfield spot');

  const gkChangeEntry = freshGame.live.subLog.find((e) => e.type === 'gk-change');
  assert(gkChangeEntry && gkChangeEntry.outToField === true, `The logged gk-change entry records that the outgoing keeper went to the field, got ${JSON.stringify(gkChangeEntry)}`);

  const eventLabel = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.sublog-item')];
    const match = items.find((el) => el.textContent.includes('Goalkeeper:'));
    return match ? match.textContent : null;
  });
  assert(eventLabel && eventLabel.includes('to field'), `Match Events shows the outgoing keeper went "to field", got "${eventLabel}"`);

  // ============ Swapping back: new keeper (prevGkId again) came from the bench, so no destination choice is offered ============
  await page.click('[data-action="change-gk"]');
  await page.waitForSelector('#gk-form');
  const benchCandidateId = state.players.find((p) =>
    freshGame.presentIds.includes(p.id) && !freshGame.live.onField.includes(p.id)
    && p.id !== outfieldPlayerId && !(freshGame.live.sentOff || []).includes(p.id)
  )?.id;
  if (benchCandidateId) {
    await page.selectOption('#gk-form [name="gk"]', benchCandidateId);
    assert(await page.isHidden('#prev-gk-destination-field'), 'No destination choice is offered when the incoming keeper was on the bench, not the field');
  }
  await page.keyboard.press('Escape');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL GK-SWAP-DESTINATION TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
