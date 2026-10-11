// The Squad tab's pitch used to require 3 taps to swap two already-placed
// players (clear one back to the bench, place the other in the newly
// empty slot, then re-place the first from the bench) and a filled slot
// cleared itself the instant you tapped it, with no way to just move
// someone without losing track of who was there. This covers the
// reworked interaction: tapping any slot (filled or empty) selects it;
// a second tap on another slot swaps/moves, a second tap on a bench
// player substitutes them in, and tapping the SAME slot again clears it.
// Also covers the Squad tab's new collapsible sections (attendance starts
// open, the Substitution Plan starts closed) added in the same pass to
// cut down how much is on screen at once.
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

  const game = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.status === 'scheduled');
  });

  await page.goto(`${BASE}/index.html#/game/${game.id}/lineup`);
  await page.waitForTimeout(200);

  // ============ Collapsible sections: attendance open, sub plan closed, by default ============
  const attendanceOpen = await page.$eval('#attendance-details', (el) => el.open);
  assert(attendanceOpen, 'Attendance section starts open (nothing marked present yet)');

  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);

  const subPlanOpenByDefault = await page.$eval('[data-sub-plan-details]', (el) => el.open);
  assert(!subPlanOpenByDefault, 'Substitution Plan section starts collapsed');

  // ============ Swap two already-placed players in one tap each ============
  const before = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id).lineup.slots;
  }, game.id);
  assert(before.d1 && before.f1 && before.d1 !== before.f1, 'Two distinct slots (d1, f1) are both filled after Auto-Fill');

  await page.click('[data-pitch-slot="d1"]');
  await page.waitForTimeout(100);
  const selectingClass = await page.$eval('[data-pitch-slot="d1"]', (el) => el.className);
  assert(selectingClass.includes('selecting'), 'Tapping a FILLED slot selects it (no longer clears it instantly)');

  await page.click('[data-pitch-slot="f1"]');
  await page.waitForTimeout(150);
  const afterSwap = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id).lineup.slots;
  }, game.id);
  assert(afterSwap.d1 === before.f1 && afterSwap.f1 === before.d1, `A second tap on a different filled slot swaps the two occupants, got d1=${afterSwap.d1} f1=${afterSwap.f1} (expected d1=${before.f1} f1=${before.d1})`);

  // ============ Move a player into an empty slot ============
  // Clear m3 first (select it, tap it again) so there's an empty slot to move into.
  await page.click('[data-pitch-slot="m3"]');
  await page.waitForTimeout(100);
  await page.click('[data-pitch-slot="m3"]');
  await page.waitForTimeout(150);
  const afterClear = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id).lineup.slots;
  }, game.id);
  assert(!afterClear.m3, `Tapping an already-SELECTED filled slot again clears it, got ${afterClear.m3}`);

  const d2Occupant = afterClear.d2;
  assert(d2Occupant, 'd2 is still filled, ready to be moved');
  await page.click('[data-pitch-slot="d2"]');
  await page.waitForTimeout(100);
  await page.click('[data-pitch-slot="m3"]');
  await page.waitForTimeout(150);
  const afterMove = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id).lineup.slots;
  }, game.id);
  assert(afterMove.m3 === d2Occupant && !afterMove.d2, `Moving a player into an empty slot leaves the original slot empty, got m3=${afterMove.m3} d2=${afterMove.d2} (expected m3=${d2Occupant}, d2 empty)`);

  // ============ Substitute in a bench player ============
  const benchPlayerId = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    const assigned = new Set(Object.values(g.lineup.slots).filter(Boolean));
    const present = new Set(g.presentIds || []);
    const bench = mod.getState().players.find((p) => present.has(p.id) && !assigned.has(p.id));
    return bench ? bench.id : null;
  }, game.id);
  assert(benchPlayerId, 'At least one player is still on the bench');

  const gkBefore = afterMove.gk;
  await page.click('[data-pitch-slot="gk"]');
  await page.waitForTimeout(100);
  await page.click(`[data-bench-player="${benchPlayerId}"]`);
  await page.waitForTimeout(150);
  const afterSub = await page.evaluate(async ({ id, gkBefore }) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    const assigned = new Set(Object.values(g.lineup.slots).filter(Boolean));
    return { gk: g.lineup.slots.gk, previousGkBackOnBench: !assigned.has(gkBefore) || gkBefore === undefined };
  }, { id: game.id, gkBefore });
  assert(afterSub.gk === benchPlayerId, `The bench player taps straight into the selected slot, got gk=${afterSub.gk}, expected ${benchPlayerId}`);
  assert(afterSub.previousGkBackOnBench, 'The slot\'s previous occupant returns to the bench rather than vanishing');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SQUAD TAB MOVE/SWAP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
