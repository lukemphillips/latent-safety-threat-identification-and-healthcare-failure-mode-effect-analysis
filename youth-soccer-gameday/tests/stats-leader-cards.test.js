// Requested improvement: the Leaders table had grown to 13 columns and
// needed horizontal scrolling to read on a phone. This covers its
// replacement — a compact table of just the key stats, sortable by
// tapping a column header (as before), with each row now also tappable
// to open a modal with that player's full stat breakdown.
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

  await page.evaluate(() => {
    const players = [
      { id: 'p1', name: 'Ava Martinez', jerseyNumber: 7, positions: ['FWD'], active: true },
      { id: 'p2', name: 'Liam Chen', jerseyNumber: 1, positions: ['GK'], active: true },
      { id: 'p3', name: 'Noah Patel', jerseyNumber: 4, positions: ['DEF'], active: true },
    ];
    const game = {
      id: 'g1',
      opponent: 'Riverside Rovers',
      date: '2026-09-01',
      time: '10:00',
      isHome: true,
      status: 'completed',
      presentIds: players.map((p) => p.id),
      live: {
        scoreUs: 3, scoreThem: 1,
        playingTime: { p1: 900, p2: 1500, p3: 600 },
        subLog: [
          { type: 'goal-us', atSeconds: 100, scorerId: 'p1', scorerName: 'Ava Martinez' },
          { type: 'goal-us', atSeconds: 400, scorerId: 'p1', scorerName: 'Ava Martinez' },
          { type: 'goal-us', atSeconds: 700, scorerId: 'p3', scorerName: 'Noah Patel', assistId: 'p1', assistName: 'Ava Martinez' },
          { type: 'save', atSeconds: 200, playerId: 'p2' },
        ],
      },
    };
    const data = {
      team: { name: 'Table Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games: [game],
      trainings: [],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
  });
  await page.reload();
  await page.goto(BASE + '/index.html#/stats');
  await page.waitForTimeout(200);

  // ============ A compact table with sortable headers and tappable rows ============
  assert((await page.locator('th[data-sort-col]').count()) > 0, 'Leaders table has sortable column headers');
  assert((await page.locator('th[data-sort-col="potm"]').count()) === 0, 'Deep stats (POTM, captaincies, awards, attendance, PT%) are not table columns — only the key-stat set is');
  assert((await page.locator('tr[data-action="open-player-stats"]').count()) === 3, 'One tappable row per player, got ' + (await page.locator('tr[data-action="open-player-stats"]').count()));
  assert((await page.locator('text=Tap a column to sort').count()) === 1, 'The tap hint sits above the table, not after scrolling past it');

  // ============ Default sort (goals, desc) puts the top scorer first ============
  const firstRowBefore = await page.locator('tr[data-action="open-player-stats"]').first().getAttribute('data-player-id');
  assert(firstRowBefore === 'p1', `Default sort (goals) puts the top scorer (Ava Martinez) first, got player id "${firstRowBefore}"`);

  // ============ Tapping a column header re-sorts by that stat ============
  await page.click('th[data-sort-col="minutes"]');
  await page.waitForTimeout(150);
  const firstRowAfterMinutesSort = await page.locator('tr[data-action="open-player-stats"]').first().getAttribute('data-player-id');
  assert(firstRowAfterMinutesSort === 'p2', `Tapping the Min header sorts by minutes played (Liam Chen has the most), got player id "${firstRowAfterMinutesSort}"`);

  // ============ Tapping the same header again flips the direction ============
  await page.click('th[data-sort-col="minutes"]');
  await page.waitForTimeout(150);
  const firstRowAscMinutes = await page.locator('tr[data-action="open-player-stats"]').first().getAttribute('data-player-id');
  assert(firstRowAscMinutes === 'p3', `Tapping Min again flips to ascending (Noah Patel has the fewest), got player id "${firstRowAscMinutes}"`);

  // ============ Tapping a row opens the full stat breakdown ============
  await page.locator('tr[data-action="open-player-stats"][data-player-id="p1"]').click();
  await page.waitForTimeout(200);
  const modalText = await page.locator('.modal-body').innerText();
  const modalTitle = await page.locator('.modal-header h3').innerText();
  assert(modalTitle === 'Ava Martinez', `Modal title is the player's name, got "${modalTitle}"`);
  assert(modalText.includes('Appearances'), 'Modal lists Appearances');
  assert(modalText.includes('Minutes Played'), 'Modal lists Minutes Played');
  assert(modalText.includes('Assists'), 'Modal lists Assists');
  assert(modalText.includes('Match Attendance'), 'Modal lists deep stats not shown in the table, like Match Attendance');

  const goalsRow = await page.locator('.sublog-item', { hasText: 'Goals' }).innerText();
  assert(goalsRow.includes('2'), `Goals row in the modal shows 2 for Ava Martinez, got: ${goalsRow}`);

  await page.click('[data-close-modal]');
  await page.waitForTimeout(150);
  assert((await page.locator('dialog.modal[open]').count()) === 0, 'Modal closes');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL STATS LEADER-CARDS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
