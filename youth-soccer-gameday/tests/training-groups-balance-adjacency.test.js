// Follow-up to the stream-purity fix: with "Balance numbers across
// groups" turned ON, the algorithm used to move a player into whichever
// remaining group happened to sit closest to it *in the filtered buckets
// array* — which, once streams with nobody in them are filtered out, can
// mean the only two groups left are the two extremes (A and D), so
// balancing would merge them. Fixed to measure real skill-stream
// distance instead, and only ever move a player one stream-step away.
// This covers both ends: balancing is a no-op when the only streams
// present are 3+ steps apart (leaves the imbalance rather than forcing
// it), and it still works normally for an adjacent chain.
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

  const trainingId = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    // Only stream A (6 players) and stream D (2 players) — nothing in
    // B or C — is the exact shape that used to trigger an A+D merge.
    const players = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, name: `Ava ${i}`, jerseyNumber: i + 1, positions: ['MID'], active: true, skillStream: 'A' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `d${i}`, name: `Dana ${i}`, jerseyNumber: i + 10, positions: ['MID'], active: true, skillStream: 'D' })),
    ];
    const training = { id: 't1', date: '2026-09-10', time: '18:00', location: '', presentIds: players.map((p) => p.id), groups: [], blocks: [] };
    const data = {
      team: { name: 'Adjacency Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games: [],
      trainings: [training],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
    return 't1';
  });
  await page.reload();

  await page.goto(`${BASE}/index.html#/training/${trainingId}/groups`);
  await page.waitForTimeout(200);

  // ============ Balance ON, but only extremes (A, D) present — should NOT merge them ============
  await page.check('#group-balance-numbers');
  await page.click('[data-action="auto-build-groups"]');
  await page.waitForTimeout(200);

  const resultNoAdjacent = await page.evaluate((tId) => {
    const s = JSON.parse(localStorage.getItem('ysg-data-v2'));
    const t = s.trainings.find((x) => x.id === tId);
    return t.groups.map((g) => ({ name: g.name, count: g.playerIds.length }));
  }, trainingId);
  console.log('Groups with only A/D present, balance ON:', JSON.stringify(resultNoAdjacent));
  assert(resultNoAdjacent.length === 2, `Still exactly 2 groups (A and D kept separate), got ${resultNoAdjacent.length}`);
  assert(resultNoAdjacent.every((g) => g.name === 'A' || g.name === 'D'), `Neither group is a mixed "A+D" label, got names: ${resultNoAdjacent.map((g) => g.name).join(', ')}`);
  const aGroup = resultNoAdjacent.find((g) => g.name === 'A');
  const dGroup = resultNoAdjacent.find((g) => g.name === 'D');
  assert(aGroup.count === 6 && dGroup.count === 2, `Sizes stay as-is (6/2) rather than being forced even by crossing to the other extreme, got A=${aGroup.count} D=${dGroup.count}`);

  // ============ Balance ON with an adjacent chain present — still balances normally ============
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ysg-data-v2'));
    s.players.push(
      { id: 'b0', name: 'Bea 0', jerseyNumber: 20, positions: ['MID'], active: true, skillStream: 'B' },
      { id: 'c0', name: 'Cara 0', jerseyNumber: 21, positions: ['MID'], active: true, skillStream: 'C' },
    );
    const t = s.trainings.find((x) => x.id === 't1');
    t.presentIds.push('b0', 'c0');
    localStorage.setItem('ysg-data-v2', JSON.stringify(s));
  });
  await page.reload();
  await page.goto(`${BASE}/index.html#/training/${trainingId}/groups`);
  await page.waitForTimeout(200);
  // The balance checkbox's persistence is a plain JS module variable, so
  // (correctly) it doesn't survive a full page reload — only in-session
  // re-renders. Re-check it explicitly before rebuilding. Also clear
  // "Number of groups" (it carried the "2" from the first build above)
  // so this exercises pure balancing across all 4 streams, not a forced
  // merge down to 2 groups first.
  await page.check('#group-balance-numbers');
  await page.fill('#group-target-count', '');
  await page.click('[data-action="auto-build-groups"]');
  await page.waitForTimeout(200);

  const resultAdjacentChain = await page.evaluate((tId) => {
    const s = JSON.parse(localStorage.getItem('ysg-data-v2'));
    const t = s.trainings.find((x) => x.id === tId);
    return t.groups.map((g) => ({ name: g.name, count: g.playerIds.length }));
  }, trainingId);
  console.log('Groups with a full A-B-C-D chain present, balance ON:', JSON.stringify(resultAdjacentChain));
  const maxCount = Math.max(...resultAdjacentChain.map((g) => g.count));
  const minCount = Math.min(...resultAdjacentChain.map((g) => g.count));
  assert(maxCount - minCount <= 1, `Balancing evens sizes out to within 1 of each other when an adjacent chain lets it, got counts: ${resultAdjacentChain.map((g) => g.count).join(', ')}`);
  assert(resultAdjacentChain.every((g) => !g.name.includes('A') || !g.name.includes('D') || g.name.includes('B') || g.name.includes('C')), 'No group label jumps straight from A to D without a stream in between');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING GROUPS BALANCE-ADJACENCY TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
