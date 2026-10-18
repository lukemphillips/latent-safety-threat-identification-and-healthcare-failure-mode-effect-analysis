// Redesign: substitutions used to work two different ways depending on
// where a coach started — tap a bench player first (armed a pending pick,
// shown as a "Bringing on: X" banner, completed by tapping an on-field
// player elsewhere), or tap a pitch-diagram chip (opened its own modal
// immediately). The two flows didn't know about each other, which is what
// let a pick armed one way go stale and silently fire if the coach
// resolved things the other way instead (see the now-removed
// live-sub-selection-not-stale.test.js, which tested that specific bug).
//
// Every substitution-starting tap now opens the same KIND of
// self-contained modal, whichever of the two places on screen it's tapped
// from — no pending/armed state left hanging between an action and its
// completion. This covers: tapping a bench player opens a picker offering
// Add-to-Pitch and swap-off options; tapping an on-field player (either
// the pitch chip OR the "On Field" grid card — both represent the same
// player and must behave identically) opens the complementary picker;
// completing either actually performs the right change; and no modal
// leaves any stray state behind for an unrelated later tap to pick up.
const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

async function dismissAnyConfirmsOrAlerts(page) {
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(150);
    const confirmBtn = await page.$('[data-confirm-ok]');
    const alertBtn = await page.$('[data-alert-ok]');
    if (!confirmBtn && !alertBtn) return;
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

  // ============ There is no leftover "armed selection" UI at all ============
  assert((await page.locator('text=Bringing on:').count()) === 0, 'No "Bringing on" banner exists anymore — nothing to arm, nothing to leak');
  assert((await page.locator('[data-action="cancel-sub"]').count()) === 0, 'No standalone cancel-sub control exists — every picker is a self-contained modal with its own Cancel/close');

  // ============ Tapping a bench player opens a picker, not an inline arm ============
  const benchIds = await page.locator('[data-bench-player]').evaluateAll((els) => els.map((e) => e.dataset.benchPlayer));
  const benchId = benchIds[0];
  await page.locator(`[data-bench-player="${benchId}"]`).click();
  await page.waitForSelector('#bench-sub-form');
  const benchOptionLabels = await page.locator('#bench-sub-form option').allInnerTexts();
  const hasAddOption = benchOptionLabels.some((t) => t.includes('Add to Pitch'));
  assert((await page.locator('#bench-sub-form optgroup[label^="Bring on for"] option').count()) > 0, `Bench picker always offers swapping with an on-field player, got: ${JSON.stringify(benchOptionLabels)}`);
  console.log(`(fixture ${hasAddOption ? 'has' : 'has no'} open spot — Add to Pitch option ${hasAddOption ? 'present' : 'absent'} as expected)`);
  await page.click('[data-close-modal]');
  await page.waitForTimeout(100);

  // ============ Complete a bench-player "Add to Pitch" (no swap) ============
  // Sample data's default formation/squad leaves at least one open spot
  // pre-kickoff in some formats — skip gracefully if this fixture started full.
  if (hasAddOption) {
    await page.locator(`[data-bench-player="${benchId}"]`).click();
    await page.waitForSelector('#bench-sub-form');
    await page.selectOption('#bench-sub-form [name="targetId"]', '__add__');
    await page.click('#bench-sub-form button[type="submit"]');
    await page.waitForTimeout(200);
    state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
    freshGame = state.games.find((g) => g.id === scheduledGame.id);
    assert(freshGame.live.onField.includes(benchId), 'Add to Pitch actually brings the bench player on');
    assert(freshGame.live.subLog.some((e) => e.type === 'add' && e.inId === benchId), 'An "add" event is logged for it');
  } else {
    console.log('(fixture started with the field already full — skipping the Add-to-Pitch sub-case, swap-off is covered below regardless)');
  }

  // ============ Tapping an on-field player's PITCH CHIP opens the complementary picker ============
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  const onFieldId = freshGame.live.onField[0];
  await page.locator(`[data-live-pitch-slot] [data-open-sub="${onFieldId}"]`).click();
  await page.waitForSelector('#pitch-sub-form');
  const pitchOptionGroups = await page.locator('#pitch-sub-form optgroup').evaluateAll((els) => els.map((e) => e.label));
  assert(pitchOptionGroups.some((l) => l.includes('Bring on from bench')), `Pitch-chip picker offers bringing someone on from the bench, got groups: ${JSON.stringify(pitchOptionGroups)}`);
  await page.click('[data-close-modal]');
  await page.waitForTimeout(100);

  // ============ Tapping the SAME player's "On Field" GRID CARD opens the identical picker ============
  // This is the core of the redesign: both visual representations of the
  // same on-field player must behave identically, not just the pitch chip.
  await page.locator(`.onfield-grid [data-open-sub="${onFieldId}"]`).click();
  await page.waitForSelector('#pitch-sub-form');
  assert((await page.locator('#pitch-sub-form').count()) === 1, 'Tapping the On Field grid card opens the exact same picker as the pitch chip');
  await page.click('[data-close-modal]');
  await page.waitForTimeout(100);

  // ============ Completing a swap via the grid card actually performs the sub ============
  const benchIds2 = await page.locator('[data-bench-player]').evaluateAll((els) => els.map((e) => e.dataset.benchPlayer));
  const incomingBenchId = benchIds2[0];
  await page.locator(`.onfield-grid [data-open-sub="${onFieldId}"]`).click();
  await page.waitForSelector('#pitch-sub-form');
  await page.selectOption('#pitch-sub-form [name="targetId"]', incomingBenchId);
  await page.click('#pitch-sub-form button[type="submit"]');
  await dismissAnyConfirmsOrAlerts(page);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(!freshGame.live.onField.includes(onFieldId), 'Completing the swap via the grid card actually takes the outgoing player off');
  assert(freshGame.live.onField.includes(incomingBenchId), 'And actually brings the chosen bench player on');

  // ============ No modal leaves any leftover state for an unrelated later tap ============
  // Tap a totally different bench player and then just close the modal
  // without choosing anything — nothing should have happened, and nothing
  // should be "armed" waiting for a later, unrelated tap to trigger it.
  const benchIds3 = await page.locator('[data-bench-player]').evaluateAll((els) => els.map((e) => e.dataset.benchPlayer));
  if (benchIds3.length) {
    const onFieldBefore = [...freshGame.live.onField];
    await page.locator(`[data-bench-player="${benchIds3[0]}"]`).click();
    await page.waitForSelector('#bench-sub-form');
    await page.click('[data-close-modal]');
    await page.waitForTimeout(100);
    assert((await page.locator('text=Bringing on:').count()) === 0, 'Closing a picker without choosing leaves no armed/pending state behind');
    const anyOnFieldCard = await page.locator('.onfield-grid [data-open-sub]').first();
    if (await anyOnFieldCard.count()) {
      await anyOnFieldCard.click();
      await page.waitForSelector('#pitch-sub-form');
      await page.click('[data-close-modal]');
      await page.waitForTimeout(100);
    }
    state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
    freshGame = state.games.find((g) => g.id === scheduledGame.id);
    assert(JSON.stringify([...freshGame.live.onField].sort()) === JSON.stringify([...onFieldBefore].sort()), 'Nothing changed on the pitch from closing pickers without choosing anything in them');
  }

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE SUB UNIFIED-FLOW TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
