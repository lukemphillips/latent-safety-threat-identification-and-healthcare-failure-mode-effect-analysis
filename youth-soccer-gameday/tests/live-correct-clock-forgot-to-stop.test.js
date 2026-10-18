// Double-checks the Correct Clock feature against the ACTUAL "forgot to
// stop the clock" mechanism, not just a pre-set elapsed value (see
// live-correct-clock.test.js for that, more detailed, coverage of the
// correction math itself). The live match clock runs off real wall-clock
// time (live.runStartedAt, a real Date.now() — see syncRunningClocks in
// store.js), specifically so it keeps counting correctly through a locked
// screen or backgrounded tab. That catch-up is driven by main.js's
// once-a-second setInterval ticker for any live+running match, not by
// merely loading/rendering the page. This seeds a match genuinely left
// running 40 real minutes ago, confirms the overrun actually gets caught
// up (not just asserted as already-correct), confirms Correct Clock is
// withheld while still running (editing a moving target would be wrong),
// and confirms pausing then correcting it brings the clock AND every
// on-field player's playing time back to the intended elapsed time
// together, not just one or the other.
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

  // 25-min periods; runStartedAt set 40 REAL minutes in the past — a 15-min
  // overrun past where period 1 should have ended, exactly the "forgot to
  // pause or end on time" scenario, built from a genuinely running clock
  // rather than a pre-set elapsedSeconds value.
  const gameId = await page.evaluate(() => {
    const players = [
      { id: 'p1', name: 'Alice', jerseyNumber: 2, positions: ['DEF'], active: true },
      { id: 'p2', name: 'Bob', jerseyNumber: 7, positions: ['MID'], active: true },
      { id: 'p3', name: 'Cara', jerseyNumber: 1, positions: ['GK'], active: true },
    ];
    const fortyMinAgo = Date.now() - 40 * 60 * 1000;
    const game = {
      id: 'g1', opponent: 'Forgot FC', date: '2026-09-01', time: '10:00', isHome: true,
      status: 'live', squadFormat: null, periodMinutes: 25, numPeriods: 2,
      presentIds: players.map((p) => p.id), formationId: null,
      lineup: { slots: { gk: 'p3', d1: 'p1', m1: 'p2' } },
      rsvps: {},
      live: {
        running: true, runStartedAt: fortyMinAgo, elapsedAtRunStart: 0,
        elapsedSeconds: 0, currentPeriod: 1, periodStartElapsed: { 1: 0 },
        scoreUs: 0, scoreThem: 0, onField: ['p1', 'p2'], gkByPeriod: { 1: 'p3' },
        sentOff: [], stintStart: { p1: 0, p2: 0, p3: 0 },
        playingTime: { p1: 0, p2: 0, p3: 0 }, subLog: [],
      },
    };
    const data = {
      team: { name: 'Forgot Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players, games: [game], trainings: [], drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
    return 'g1';
  });
  await page.reload();
  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  // The catch-up is driven by main.js's once-a-second ticker (it calls
  // update(), whose own syncRunningClocks recomputes elapsedSeconds from
  // the real wall-clock gap) — give it a couple of real ticks rather than
  // assuming it fires the instant the page renders.
  await page.waitForTimeout(2200);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let game = state.games.find((g) => g.id === gameId);
  assert(game.live.elapsedSeconds >= 2390 && game.live.elapsedSeconds <= 2420, `The real ~40-min wall-clock gap was actually caught up while still running, got ${game.live.elapsedSeconds}s`);
  assert(game.live.playingTime.p1 === game.live.elapsedSeconds, `The on-field player accrued the full overrun too, got p1=${game.live.playingTime.p1} vs elapsed=${game.live.elapsedSeconds}`);

  // ============ Correct Clock is withheld while the clock is still a moving target ============
  assert((await page.locator('[data-action="correct-clock"]').count()) === 0, 'Correct Clock is not offered while the clock is still running');

  // ============ Pause, then correct back to the scheduled 25:00 ============
  await page.click('[data-action="toggle-run"]');
  await page.waitForTimeout(200);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === gameId);
  const elapsedAfterPause = game.live.elapsedSeconds;

  await page.evaluate(() => { document.querySelectorAll('details[data-details-section]').forEach((d) => { d.open = true; }); });
  assert((await page.locator('[data-action="correct-clock"]').count()) === 1, 'Correct Clock IS offered now that the clock is paused');

  const overrunMinutes = Math.floor(elapsedAfterPause / 60) - 25;
  await page.click('[data-action="correct-clock"]');
  await page.waitForSelector('#clock-correction-form');
  await page.fill('#clock-correction-form [name="minutes"]', String(overrunMinutes));
  await page.click('#clock-correction-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === gameId);
  assert(game.live.elapsedSeconds >= 1495 && game.live.elapsedSeconds <= 1505, `Clock corrected back to ~25:00, got ${game.live.elapsedSeconds}`);
  assert(game.live.playingTime.p1 === game.live.elapsedSeconds, `On-field player p1's playing time corrected down in step with the clock, got ${game.live.playingTime.p1}`);
  assert(game.live.playingTime.p2 === game.live.elapsedSeconds, `On-field player p2's playing time corrected down in step with the clock, got ${game.live.playingTime.p2}`);
  assert(game.live.playingTime.p3 === game.live.elapsedSeconds, `The goalkeeper's playing time corrected down in step with the clock too, got ${game.live.playingTime.p3}`);
  assert(game.live.running === false, 'The clock stays paused after correcting it — does not silently resume running');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE CORRECT-CLOCK FORGOT-TO-STOP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
