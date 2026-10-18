// Reported bug: forgetting to pause or end a match lets the clock (which
// runs off real wall-clock time, so it keeps going even with the screen
// locked) count on indefinitely, wrongly crediting the overrun to the
// match total and to whoever was on the pitch — with no way to correct it
// afterward. Covers the new "Correct Clock" action: only offered when the
// clock isn't running, removes the requested minutes from the current
// period's elapsed time AND from the playing time of whoever is currently
// on the pitch/in goal, clamps to what's actually elapsed this half, and
// logs a visible correction event rather than silently editing the match.
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

  // A live, PAUSED match, 30 minutes into period 1 (simulating "forgot to
  // end on time" — the coach has since paused/noticed and wants to correct
  // it before it's locked in for good at End Game). p1/p2 are on the pitch,
  // p3 is in goal, p4 already came off earlier (before the overrun) and
  // should be UNTOUCHED by the correction.
  const gameId = await page.evaluate(() => {
    const players = [
      { id: 'p1', name: 'Ava Martinez', jerseyNumber: 2, positions: ['DEF'], active: true },
      { id: 'p2', name: 'Bea Chen', jerseyNumber: 7, positions: ['MID'], active: true },
      { id: 'p3', name: 'Cara Diaz', jerseyNumber: 1, positions: ['GK'], active: true },
      { id: 'p4', name: 'Dana Fox', jerseyNumber: 9, positions: ['FWD'], active: true },
    ];
    const game = {
      id: 'g1',
      opponent: 'Overrun FC',
      date: '2026-09-01',
      time: '10:00',
      isHome: true,
      status: 'live',
      squadFormat: null,
      periodMinutes: 25,
      numPeriods: 2,
      presentIds: players.map((p) => p.id),
      formationId: null,
      lineup: { slots: { gk: 'p3' } },
      rsvps: {},
      live: {
        running: false,
        elapsedSeconds: 1800, // 30:00 — well past a normal 25-min half
        currentPeriod: 1,
        periodStartElapsed: { 1: 0 },
        scoreUs: 0,
        scoreThem: 0,
        onField: ['p1', 'p2'],
        gkByPeriod: { 1: 'p3' },
        sentOff: [],
        stintStart: { p1: 0, p2: 0, p3: 0 },
        playingTime: { p1: 1800, p2: 1800, p3: 1800, p4: 300 },
        subLog: [],
      },
    };
    const data = {
      team: { name: 'Clock Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games: [game],
      trainings: [],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
    return 'g1';
  });
  await page.reload();
  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });

  // ============ The action is offered (clock is paused) ============
  assert((await page.locator('[data-action="correct-clock"]').count()) === 1, 'Correct Clock action is offered while the clock is paused');

  // ============ Remove 20 minutes from the half ============
  await page.click('[data-action="correct-clock"]');
  await page.waitForSelector('#clock-correction-form');
  await page.fill('#clock-correction-form [name="minutes"]', '20');
  await page.click('#clock-correction-form button[type="submit"]');
  await page.waitForTimeout(200);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let live = state.games.find((g) => g.id === gameId).live;

  assert(live.elapsedSeconds === 600, `Match clock drops by the removed 20 minutes (1800s - 1200s = 600s), got ${live.elapsedSeconds}`);
  assert(live.playingTime.p1 === 600, `On-field player p1 loses the same 1200s, got ${live.playingTime.p1}`);
  assert(live.playingTime.p2 === 600, `On-field player p2 loses the same 1200s, got ${live.playingTime.p2}`);
  assert(live.playingTime.p3 === 600, `The goalkeeper p3 loses the same 1200s too, got ${live.playingTime.p3}`);
  assert(live.playingTime.p4 === 300, `A player already off the pitch (p4) is untouched, got ${live.playingTime.p4}`);
  assert(live.stintStart.p1 === 0 && live.stintStart.p2 === 0, 'Stint starts stay valid (still before the rewound clock)');

  const correctionEntry = live.subLog.find((e) => e.type === 'clock-correction');
  assert(!!correctionEntry, 'A clock-correction event is logged for transparency');
  assert(correctionEntry.secondsRemoved === 1200, `Logged event records exactly how much was removed, got ${correctionEntry.secondsRemoved}`);

  // ============ The Match Events log shows it in plain language ============
  // Re-render triggered by the submit above replaced the <details>, resetting
  // it to its tracked (still-closed) open state — reopen before reading it,
  // same as every other test that checks collapsed-by-default content here.
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  const eventsText = await page.locator('.sublog-item').allInnerTexts();
  assert(eventsText.some((t) => t.includes('Clock corrected') && t.includes('20:00')), `Match Events shows the correction in plain language, got: ${JSON.stringify(eventsText)}`);

  // ============ Trying to remove more than what's elapsed this half clamps, doesn't go negative ============
  await page.click('[data-action="correct-clock"]');
  await page.waitForSelector('#clock-correction-form');
  const maxAttr = await page.locator('#clock-correction-form [name="minutes"]').getAttribute('max');
  assert(Number(maxAttr) === 10, `The minutes field's own max matches what's actually elapsed this half (600s = 10 min), got max="${maxAttr}"`);
  await page.fill('#clock-correction-form [name="minutes"]', '10');
  await page.click('#clock-correction-form button[type="submit"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  live = state.games.find((g) => g.id === gameId).live;
  assert(live.elapsedSeconds === 0, `Removing everything left takes the clock to exactly 0, not negative, got ${live.elapsedSeconds}`);
  assert(live.playingTime.p1 === 0 && live.playingTime.p2 === 0 && live.playingTime.p3 === 0, 'Playing time floors at 0 rather than going negative');

  // ============ With no time left to remove, the action stops offering itself ============
  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  assert((await page.locator('[data-action="correct-clock"]').count()) === 0, 'Correct Clock disappears once this half has 0:00 elapsed — nothing left to remove');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE CORRECT-CLOCK TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
