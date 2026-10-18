// Reported: the live match's substitution flow felt confusing/hard to
// manage. Root cause found: there are two separate ways to start a sub —
// tap a bench card first (arms `selectingInboundId`, shows a "Bringing on:
// X — tap an on-field player to swap" banner), or tap a pitch-diagram chip
// for an on-field player (opens its own modal, independent of any armed
// bench pick). If a coach armed a bench pick and then resolved things the
// OTHER way (via the pitch-chip modal, a GK change, Auto-Fill Field, etc.),
// the armed pick was left stale: the "Bringing on" banner kept showing a
// substitution the coach never meant to still be pending, and tapping any
// on-field card afterward would silently run that stale, unrelated swap.
//
// The actual bug was a classic ordering mistake, not a missing reset: every
// completion path DID eventually set `selectingInboundId = null`, but only
// AFTER calling update() — and update() re-renders synchronously as part of
// notifying its listeners, so that render still read the about-to-be-cleared
// value. Moving every reset to BEFORE its update() call is the fix. This
// covers the pitch-chip modal specifically (the path from the bug report),
// plus confirms the banner is gone and the stale bench player stays
// un-subbed rather than silently going on later.
const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

async function dismissAnyConfirmsOrAlerts(page, label) {
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(150);
    const confirmBtn = await page.$('[data-confirm-ok]');
    const alertBtn = await page.$('[data-alert-ok]');
    if (!confirmBtn && !alertBtn) return;
    console.log(`(${label}: dismissing a confirm/alert dialog)`);
    await (confirmBtn || alertBtn).click();
  }
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

  // ============ Arm a bench-first substitution ============
  const benchIds = await page.locator('[data-bench-player]').evaluateAll((els) => els.map((e) => e.dataset.benchPlayer));
  const armedBenchId = benchIds[0];
  const otherBenchId = benchIds[1];
  await page.locator(`[data-bench-player="${armedBenchId}"]`).click();
  await page.waitForTimeout(150);
  assert((await page.locator('text=Bringing on:').count()) === 1, 'Arming a bench pick shows the "Bringing on" banner');

  // ============ Resolve a DIFFERENT substitution via the pitch-chip modal instead ============
  const outId = freshGame.live.onField[0];
  await page.locator(`[data-live-pitch-slot] [data-open-sub="${outId}"]`).click();
  await page.waitForSelector('#pitch-sub-form');
  await page.selectOption('#pitch-sub-form [name="targetId"]', otherBenchId);
  await page.click('#pitch-sub-form button[type="submit"]');
  await dismissAnyConfirmsOrAlerts(page, 'pitch-modal swap');

  // ============ The stale bench-first selection must NOT still be armed ============
  const staleBannerCount = await page.locator('text=Bringing on:').count();
  assert(staleBannerCount === 0, `The "Bringing on" banner clears once a sub is resolved a different way, got ${staleBannerCount} banner(s) still showing`);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(!freshGame.live.onField.includes(armedBenchId), 'The originally-armed bench player was never actually subbed in — only the pitch-modal swap happened');
  assert(freshGame.live.onField.includes(otherBenchId), 'The player actually chosen via the pitch-modal swap IS on the field');

  // ============ Tapping an on-field card now does nothing (no sub is armed) ============
  const anotherOnFieldId = freshGame.live.onField.find((id) => id !== otherBenchId);
  const onFieldCount = await page.locator('.onfield-grid [data-onfield-player]').count();
  assert(onFieldCount === 0, `No on-field card is even clickable once nothing is armed (no stray data-onfield-player attributes), got ${onFieldCount}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE SUB-SELECTION NOT-STALE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
