// Requested improvement: Stats' History (and Player of the Week) got too
// long to scroll through over a season — this covers grouping History
// into month-by-month drop-downs (most recent open, older ones
// collapsed) and tucking older Player of the Week entries behind a
// drop-down too, once there are more than a couple of weeks.
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

  // Seed a team with matches spread across several months and several
  // weeks, directly in localStorage — faster and more controllable than
  // building it up through the UI one game at a time.
  await page.evaluate(() => {
    const players = Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i, positions: ['MID'] }));
    const games = [];
    // 3 matches in each of 4 months, each on a different Monday-anchored
    // week so Player of the Week has more than 2 weeks to group too.
    const months = ['2026-05', '2026-06', '2026-07', '2026-08'];
    months.forEach((m, mi) => {
      for (let i = 0; i < 3; i++) {
        const day = String(4 + i * 7).padStart(2, '0');
        games.push({
          id: `g-${mi}-${i}`,
          opponent: `Opponent ${mi}-${i}`,
          date: `${m}-${day}`,
          isHome: true,
          status: 'completed',
          presentIds: players.map((p) => p.id),
          live: { scoreUs: 2, scoreThem: 1, subLog: [] },
        });
      }
    });
    const data = {
      team: { name: 'Grouping FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games,
      trainings: [],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
  });
  // The app was already booted (with empty data) before this — a pure
  // hash-change navigation wouldn't reload the document or make it
  // re-read localStorage, so the seeded data needs an actual reload.
  await page.reload();
  await page.goto(BASE + '/index.html#/stats');
  await page.waitForTimeout(200);

  // ============ History grouped by month, most recent open ============
  const monthDetails = await page.$$('details[data-month]');
  assert(monthDetails.length === 4, `History has one drop-down per month, got ${monthDetails.length}`);

  const monthMeta = await page.evaluate(() =>
    [...document.querySelectorAll('details[data-month]')].map((d) => ({
      month: d.dataset.month,
      open: d.open,
      summary: d.querySelector('summary').textContent,
      gameLinks: d.querySelectorAll('a[href^="#/game/"]').length,
    }))
  );
  assert(monthMeta[0].month === '2026-08', `Months are ordered most-recent-first, got ${monthMeta.map((m) => m.month).join(', ')}`);
  assert(monthMeta[0].open === true, 'The most recent month is open by default');
  assert(monthMeta.slice(1).every((m) => m.open === false), `Every earlier month starts collapsed, got ${JSON.stringify(monthMeta.map((m) => m.open))}`);
  assert(/August 2026/.test(monthMeta[0].summary), `Most recent month is labelled correctly, got "${monthMeta[0].summary}"`);
  assert(/3W/.test(monthMeta[0].summary), `Month summary shows the win/draw/loss record, got "${monthMeta[0].summary}"`);
  assert(monthMeta.every((m) => m.gameLinks === 3), `Each month lists its own 3 matches, got ${JSON.stringify(monthMeta.map((m) => m.gameLinks))}`);

  // A collapsed month's matches aren't visible until expanded.
  const lastMonthLink = await page.$('details[data-month="2026-05"] a[href^="#/game/"]');
  assert(!(await lastMonthLink.isVisible()), 'A collapsed month\'s matches are not visible until expanded');
  await page.click('details[data-month="2026-05"] summary');
  assert(await lastMonthLink.isVisible(), 'Clicking an earlier month\'s summary expands it');

  // ============ Player of the Week: recent shown, older tucked away ============
  const weekCards = await page.$$('#recent-weeks > .card');
  assert(weekCards.length === 2, `Only the 2 most recent weeks show directly, got ${weekCards.length}`);
  const earlierWeeksDetails = await page.$('#earlier-weeks');
  assert(earlierWeeksDetails, 'Earlier weeks are tucked behind their own drop-down');
  const earlierWeeksSummary = await earlierWeeksDetails.textContent();
  assert(/earlier week/.test(earlierWeeksSummary), `Drop-down names how many earlier weeks it holds, got "${earlierWeeksSummary}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL STATS HISTORY-GROUPING TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
