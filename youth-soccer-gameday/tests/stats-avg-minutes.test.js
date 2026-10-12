// Requested stat: average playing time per match actually played (total
// minutes divided by appearances), not just the raw totals already shown.
// A player with few, long appearances and one with many, short ones can
// have the same total minutes but very different averages, so this needs
// its own fixture/assertions rather than reusing stats-leader-cards.test.js
// (whose numbers are tuned for that file's own Min-column ordering).
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
      { id: 'p1', name: 'Alice Adams', jerseyNumber: 2, positions: ['DEF'], active: true },
      { id: 'p2', name: 'Bob Brown', jerseyNumber: 9, positions: ['FWD'], active: true },
      { id: 'p3', name: 'Cara Cole', jerseyNumber: 5, positions: ['MID'], active: true },
      { id: 'p4', name: 'Dana Diaz', jerseyNumber: 11, positions: ['FWD'], active: true },
    ];
    const mkGame = (id, date, playingTime) => ({
      id,
      opponent: 'Opponent ' + id,
      date,
      time: '10:00',
      isHome: true,
      status: 'completed',
      presentIds: players.map((p) => p.id),
      live: { scoreUs: 1, scoreThem: 0, playingTime, subLog: [] },
    });
    const games = [
      // Alice: 3 appearances of 600s each -> 1800s total, avg 600s (10').
      // Bob: 1 appearance of 1500s -> 1500s total, avg 1500s (25') - highest average despite lower total.
      // Cara: 2 appearances (300s, 1000s) -> 1300s total, avg 650s (11').
      // Dana: never actually gets on -> 0 apps, average should be "-".
      mkGame('g1', '2026-09-01', { p1: 600, p2: 1500, p3: 300, p4: 0 }),
      mkGame('g2', '2026-09-08', { p1: 600, p3: 1000, p4: 0 }),
      mkGame('g3', '2026-09-15', { p1: 600, p4: 0 }),
    ];
    const data = {
      team: { name: 'Avg Minutes Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games,
      trainings: [],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
  });
  await page.reload();
  await page.goto(BASE + '/index.html#/stats');
  await page.waitForTimeout(200);

  // ============ Avg Min is not a default column, but is offered in the "more stats" dropdown ============
  assert((await page.locator('th[data-sort-col="avgMinutes"]').count()) === 0, 'Avg Min is not a key-stat column shown by default');
  const dropdownOptionText = await page.locator('#leader-deep-sort-select option[value="avgMinutes"]').innerText();
  assert(dropdownOptionText === 'Avg Playing Time per Match', `Dropdown offers it with a clear full label, got "${dropdownOptionText}"`);

  // ============ Selecting it sorts by true per-appearance average, not total minutes ============
  await page.selectOption('#leader-deep-sort-select', 'avgMinutes');
  await page.waitForTimeout(150);
  assert((await page.locator('th[data-sort-col="avgMinutes"]').count()) === 1, 'Selecting Avg Min from the dropdown adds it as a table column');

  const order = await page.locator('tr[data-action="open-player-stats"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-player-id')));
  assert(JSON.stringify(order.slice(0, 3)) === JSON.stringify(['p2', 'p3', 'p1']),
    `Sorted desc by average (Bob 25' > Cara 11' > Alice 10'), despite Alice having the highest total minutes, got order: ${order.join(', ')}`);

  // Read each row's Avg Min cell by its column index rather than guessing position.
  const avgByPlayer = {};
  const cellsPerRow = await page.locator('tr[data-action="open-player-stats"]').count();
  const avgColIndex = await page.locator('th[data-sort-col]').evaluateAll((ths) => ths.findIndex((th) => th.dataset.sortCol === 'avgMinutes'));
  for (let i = 0; i < cellsPerRow; i++) {
    const row = page.locator('tr[data-action="open-player-stats"]').nth(i);
    const pid = await row.getAttribute('data-player-id');
    // avgColIndex already accounts for the Player (name) header sitting at
    // index 0 in the th[data-sort-col] list, which lines up with the name
    // cell at td index 0 — no offset needed.
    const cellText = await row.locator('td').nth(avgColIndex).innerText();
    avgByPlayer[pid] = cellText;
  }
  assert(avgByPlayer.p2 === '25′', `Bob's average is his single 1500s appearance, got "${avgByPlayer.p2}"`);
  assert(avgByPlayer.p3 === '11′', `Cara's average rounds (300+1000)/2=650s to 11', got "${avgByPlayer.p3}"`);
  assert(avgByPlayer.p1 === '10′', `Alice's average is 1800s/3=600s=10', despite having the most total minutes, got "${avgByPlayer.p1}"`);
  assert(avgByPlayer.p4 === '—', `Dana never actually played (0 apps), so her average shows as "-", got "${avgByPlayer.p4}"`);

  // ============ The player detail modal shows it with a full label too ============
  await page.locator('tr[data-action="open-player-stats"][data-player-id="p2"]').click();
  await page.waitForTimeout(200);
  const modalText = await page.locator('.modal-body').innerText();
  assert(modalText.includes('Avg Playing Time per Match'), 'Modal lists the average under its full label');
  const avgRow = await page.locator('.sublog-item', { hasText: 'Avg Playing Time per Match' }).innerText();
  assert(avgRow.includes("25'") || avgRow.includes('25′'), `Modal shows Bob's average as 25', got: ${avgRow}`);
  await page.click('[data-close-modal]');
  await page.waitForTimeout(150);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL STATS AVG-MINUTES TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
