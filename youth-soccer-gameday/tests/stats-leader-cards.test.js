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
    // A second, unrelated fixture that only Ava and Liam were marked
    // present for — gives Match Attendance a real spread (Ava/Liam 100%,
    // Noah 50%) to sort by via the "more stats" dropdown below.
    const game2 = {
      id: 'g2',
      opponent: 'Eastside United',
      date: '2026-09-08',
      time: '10:00',
      isHome: true,
      status: 'scheduled',
      presentIds: ['p1', 'p2'],
      rsvps: {},
    };
    const data = {
      team: { name: 'Table Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games: [game, game2],
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

  // ============ The Player column header sorts alphabetically ============
  assert((await page.locator('th[data-sort-col="name"]').count()) === 1, 'Player column header is itself sortable');
  await page.click('th[data-sort-col="name"]');
  await page.waitForTimeout(150);
  const namesInOrder = await page.locator('tr[data-action="open-player-stats"] td:first-child').allInnerTexts();
  assert(namesInOrder[0].startsWith('Ava Martinez'), `Tapping Player sorts A→Z (first tap), got order: ${namesInOrder.map((t) => t.split('\n')[0]).join(', ')}`);
  assert(namesInOrder[2].startsWith('Noah Patel'), `Noah Patel sorts last A→Z, got order: ${namesInOrder.map((t) => t.split('\n')[0]).join(', ')}`);

  // ============ "More stats" dropdown sorts by a stat not shown as a column, and adds it as one while active ============
  assert((await page.locator('#leader-deep-sort-select').count()) === 1, 'A "more stats" dropdown exists for stats not shown as table columns');
  assert((await page.locator('th[data-sort-col="attendance"]').count()) === 0, 'Match Attendance is not a column until actively sorted by');
  await page.selectOption('#leader-deep-sort-select', 'attendance');
  await page.waitForTimeout(150);
  assert((await page.locator('th[data-sort-col="attendance"]').count()) === 1, 'Selecting Match Attendance from the dropdown adds it as a table column');
  const firstRowByAttendance = await page.locator('tr[data-action="open-player-stats"]').first().getAttribute('data-player-id');
  assert(firstRowByAttendance === 'p1', `Sorting by Match Attendance (desc) puts a 100%-attendance player first (tied Ava/Liam, alphabetical breaks the tie), got player id "${firstRowByAttendance}"`);
  const lastRowByAttendance = await page.locator('tr[data-action="open-player-stats"]').last().getAttribute('data-player-id');
  assert(lastRowByAttendance === 'p3', `Noah Patel (50% attendance) sorts last, got player id "${lastRowByAttendance}"`);

  // Switching back to a key-stat column removes the deep column again.
  await page.click('th[data-sort-col="goals"]');
  await page.waitForTimeout(150);
  assert((await page.locator('th[data-sort-col="attendance"]').count()) === 0, 'Tapping a key-stat column header drops the deep-stat column again');

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
