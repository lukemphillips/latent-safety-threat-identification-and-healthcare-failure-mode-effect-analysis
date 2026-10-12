// Requested improvement: the Leaders table had grown to 13 columns and
// needed horizontal scrolling to read on a phone. This covers its
// replacement — a sortable list of player cards (headline stat + tap
// through for the full breakdown) instead of one wide table.
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
      team: { name: 'Card Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
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

  // ============ No more wide table — a sort control and player cards ============
  assert((await page.locator('#leader-sort-select').count()) === 1, 'Leaders has a sort-by dropdown instead of clickable table headers');
  assert((await page.locator('[data-action="open-player-stats"]').count()) === 3, 'One tappable card per player, got ' + (await page.locator('[data-action="open-player-stats"]').count()));

  // ============ Default sort (goals, desc) shows Ava Martinez first with "2" ============
  const firstCardText = await page.locator('[data-action="open-player-stats"]').first().innerText();
  assert(firstCardText.includes('Ava Martinez'), `Default sort (goals) puts the top scorer first, got: ${firstCardText}`);
  assert(firstCardText.includes('2') && firstCardText.toLowerCase().includes('goals'), `Card shows the headline stat and its label, got: ${firstCardText}`);

  // ============ Changing the sort-by dropdown re-sorts and updates the headline stat ============
  await page.selectOption('#leader-sort-select', 'minutes');
  await page.waitForTimeout(150);
  const firstCardAfterMinutesSort = await page.locator('[data-action="open-player-stats"]').first().innerText();
  assert(firstCardAfterMinutesSort.includes('Liam Chen'), `Sorting by Minutes Played puts the player with the most minutes first, got: ${firstCardAfterMinutesSort}`);
  assert(firstCardAfterMinutesSort.toLowerCase().includes('minutes played'), `Headline label switches to Minutes Played, got: ${firstCardAfterMinutesSort}`);

  // ============ Toggling sort direction flips the order ============
  await page.click('[data-action="toggle-sort-dir"]');
  await page.waitForTimeout(150);
  const firstCardAscMinutes = await page.locator('[data-action="open-player-stats"]').first().innerText();
  assert(firstCardAscMinutes.includes('Noah Patel'), `Flipping to ascending puts the lowest-minutes player first, got: ${firstCardAscMinutes}`);

  // ============ Tapping a card opens the full stat breakdown ============
  await page.locator('[data-action="open-player-stats"][data-player-id="p1"]').click();
  await page.waitForTimeout(200);
  const modalText = await page.locator('.modal-body').innerText();
  const modalTitle = await page.locator('.modal-header h3').innerText();
  assert(modalTitle === 'Ava Martinez', `Modal title is the player's name, got "${modalTitle}"`);
  assert(modalText.includes('Appearances'), 'Modal lists Appearances');
  assert(modalText.includes('Minutes Played'), 'Modal lists Minutes Played');
  assert(modalText.includes('Assists'), 'Modal lists Assists');
  assert(modalText.includes('Match Attendance'), 'Modal lists Match Attendance');

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
