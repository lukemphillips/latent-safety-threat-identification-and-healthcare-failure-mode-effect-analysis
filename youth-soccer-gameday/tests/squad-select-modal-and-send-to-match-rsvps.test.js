// Two related fixes:
//   1. Balance Teams' "Set as Match Squad"/"Set as Team X" (sendSquadToMatch)
//      only ever set presentIds, never rsvps — so a player sent onto the
//      pitch this way showed up neither In nor Out on the Squad tab's own
//      per-player control, even though they genuinely were present. Same
//      gap in gameDetail.js's "Apply Squad to Other Matches". Both now keep
//      rsvps in sync with presentIds.
//   2. The always-visible per-player In/Out list on the Squad tab is now an
//      on-demand "Select Squad" modal instead, opened from a summary card.
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

  const { gameId, activePlayers } = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    return {
      gameId: s.games.find((g) => g.status === 'scheduled').id,
      activePlayers: s.players.filter((p) => p.active && !p.isGuest),
    };
  });
  const excludedPlayer = activePlayers[0];

  // ============ 1. Balance Teams send-to-match keeps rsvps in sync with presentIds ============
  await page.goto(`${BASE}/index.html#/balance/${gameId}`);
  await page.waitForTimeout(150);
  await page.click(`[data-squad-toggle="${excludedPlayer.id}"]`);
  await page.waitForTimeout(100);

  const targetCheckbox = page.locator(`[data-target-game="${gameId}"]`);
  if (!(await targetCheckbox.isChecked())) await targetCheckbox.check();
  await page.waitForTimeout(100);
  await page.click('[data-action="import-squad"]');
  await page.waitForTimeout(150);

  const afterSend = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id);
  }, gameId);
  assert(!afterSend.presentIds.includes(excludedPlayer.id), `The deselected player wasn't sent to the match, got presentIds ${JSON.stringify(afterSend.presentIds)}`);
  assert(afterSend.presentIds.length === activePlayers.length - 1, `Everyone else was sent, got ${afterSend.presentIds.length} of ${activePlayers.length - 1}`);
  const presentSet = new Set(afterSend.presentIds);
  const rsvpsMatch = activePlayers.every((p) => afterSend.rsvps[p.id] === (presentSet.has(p.id) ? 'yes' : 'no'));
  assert(rsvpsMatch, `rsvps match presentIds for every active player (yes iff present), got rsvps ${JSON.stringify(afterSend.rsvps)} vs presentIds ${JSON.stringify(afterSend.presentIds)}`);

  // ============ 2. The Squad tab's picker already reflects that — a player pushed from Balance Teams shows as In, not unmarked ============
  await page.goto(`${BASE}/index.html#/game/${gameId}`);
  await page.waitForTimeout(150);
  const presentSummary = () => page.locator('.small.muted', { hasText: 'present' }).first().textContent();
  const summaryOnLoad = await presentSummary();
  assert(summaryOnLoad.includes(`${activePlayers.length - 1}/${activePlayers.length} present`), `Squad tab's own summary already reflects the Balance Teams assignment, got "${summaryOnLoad}"`);

  await page.click('[data-action="open-squad-picker"]');
  await page.waitForSelector('#squad-picker-list');
  const excludedBtnActive = await page.$eval(
    `[data-squad-status-btn][data-value="no"][data-player-id="${excludedPlayer.id}"]`,
    (el) => el.classList.contains('active'),
  );
  assert(excludedBtnActive, 'The deselected player already shows as Out in the picker, no extra tap needed');
  const includedPlayer = activePlayers.find((p) => p.id !== excludedPlayer.id);
  const includedBtnActive = await page.$eval(
    `[data-squad-status-btn][data-value="yes"][data-player-id="${includedPlayer.id}"]`,
    (el) => el.classList.contains('active'),
  );
  assert(includedBtnActive, 'A player sent to the match already shows as In in the picker, no extra tap needed');

  // ============ 3. The picker is a real on-demand modal: toggling updates in place, and the page behind it updates too ============
  await page.click(`[data-squad-status-btn][data-value="yes"][data-player-id="${excludedPlayer.id}"]`);
  await page.waitForTimeout(150);
  const countInModal = await page.textContent('#squad-picker-count');
  assert(countInModal.includes(`${activePlayers.length}/${activePlayers.length} present`), `Toggling inside the modal updates its own count without closing it, got "${countInModal}"`);
  const summaryBehindModal = await presentSummary();
  assert(summaryBehindModal.includes(`${activePlayers.length}/${activePlayers.length} present`), `The Squad tab behind the modal updates too, got "${summaryBehindModal}"`);

  await page.click('[data-close-modal]');
  await page.waitForTimeout(150);
  assert(!(await page.$('#squad-picker-list')), 'Closing the modal actually removes it from the page');

  // Reopening shows the change persisted, not just a transient in-modal state.
  await page.click('[data-action="open-squad-picker"]');
  await page.waitForSelector('#squad-picker-list');
  const reopenedBtnActive = await page.$eval(
    `[data-squad-status-btn][data-value="yes"][data-player-id="${excludedPlayer.id}"]`,
    (el) => el.classList.contains('active'),
  );
  assert(reopenedBtnActive, 'Reopening the picker shows the change actually stuck');

  // ============ 4. "Mark All In" and "+ Fill-In Player" stay directly on the Squad tab, no modal needed for those ============
  await page.click('[data-close-modal]');
  await page.waitForTimeout(150);
  assert(!!(await page.$('[data-action="mark-all-present"]')), '"Mark All In" is still a direct button on the Squad tab itself');
  assert(!!(await page.$('[data-action="add-fill-in"]')), '"+ Fill-In Player" is still a direct button on the Squad tab itself');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SQUAD SELECT-MODAL AND SEND-TO-MATCH RSVPS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
