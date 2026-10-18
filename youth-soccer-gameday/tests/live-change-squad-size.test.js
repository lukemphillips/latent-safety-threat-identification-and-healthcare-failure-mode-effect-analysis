// Requested: ability to change how many players are on the pitch mid-match
// — a grassroots game doesn't always stay the size it was scheduled as (a
// team shows up short and plays 6-a-side instead of 7), and some leagues
// let the losing side bring on an extra player under an informal fair-play
// rule. The existing "Change Formation" live action only changed the
// tactical SHAPE within a fixed squad size; this covers it now also
// changing the SIZE itself — remapping the live lineup so no one currently
// on the pitch is dropped, and following the same inherit-vs-override
// convention as the pre-match Schedule form's own Format field (only
// stored on the game when it actually differs from the team's default).
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

  // A live match at the team's default 7-a-side, pitch exactly full
  // (6 outfield + 1 GK) — nothing ambiguous about "is there an open spot".
  const gameId = await page.evaluate(() => {
    const players = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, jerseyNumber: i + 1, positions: ['MID'], active: true,
    }));
    const onField = players.slice(0, 6).map((p) => p.id);
    const gk = players[6].id;
    const game = {
      id: 'g1',
      opponent: 'Size Change FC',
      date: '2026-09-01',
      time: '10:00',
      isHome: true,
      status: 'live',
      squadFormat: null,
      periodMinutes: 25,
      numPeriods: 2,
      presentIds: players.map((p) => p.id),
      formationId: null,
      lineup: { slots: { gk, d1: onField[0], d2: onField[1], m1: onField[2], m2: onField[3], m3: onField[4], f1: onField[5] } },
      rsvps: {},
      live: {
        running: false,
        elapsedSeconds: 600,
        currentPeriod: 1,
        periodStartElapsed: { 1: 0 },
        scoreUs: 0,
        scoreThem: 0,
        onField,
        gkByPeriod: { 1: gk },
        sentOff: [],
        stintStart: Object.fromEntries([...onField, gk].map((id) => [id, 0])),
        playingTime: Object.fromEntries([...onField, gk].map((id) => [id, 600])),
        subLog: [],
      },
    };
    const data = {
      team: { name: 'Size Test FC', squadFormat: 7, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
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

  // ============ The target shown is the team default (7-a-side -> 6 outfield) ============
  assert((await page.locator('text=On Field (6 / 6 target)').count()) === 1, 'Starts full at the 7-a-side target (6 outfield)');

  // ============ Change Formation offers a Squad size field, current size selected ============
  await page.click('[data-action="change-formation"]');
  await page.waitForSelector('#formation-form');
  assert((await page.locator('#formation-form [name="squadFormat"]').count()) === 1, 'A Squad size field is offered alongside Formation');
  assert(await page.locator('#formation-form [name="squadFormat"]').inputValue() === '7', 'Current squad size (7) is pre-selected');

  // ============ Growing the size (the "extra player" / "actually played 8-a-side" case) ============
  await page.selectOption('#formation-form [name="squadFormat"]', '8');
  await page.waitForTimeout(100);
  const formationLabelsFor8 = await page.locator('#formation-select option').allInnerTexts();
  assert(formationLabelsFor8.every((t) => t.includes('8-a-side')), `Formation choices update to 8-a-side options once size changes, got: ${JSON.stringify(formationLabelsFor8)}`);
  await page.click('#formation-form button[type="submit"]');
  await page.waitForTimeout(200);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let game = state.games.find((g) => g.id === gameId);
  assert(game.squadFormat === 8, `Game now carries an explicit squadFormat override (8), got ${game.squadFormat}`);
  assert(game.formationId && game.formationId.startsWith('8-'), `A valid 8-a-side formation was picked, got ${game.formationId}`);

  const allOriginalPlayersStillPlaced = [...game.live.onField, game.live.gkByPeriod[1]]
    .every((id) => Object.values(game.lineup.slots).includes(id));
  assert(allOriginalPlayersStillPlaced, 'Every player already on the pitch is still placed somewhere in the new lineup — no one silently dropped');
  assert(game.live.onField.length === 6, 'No one was added or removed from the pitch just by changing size, got onField length ' + game.live.onField.length);

  await page.waitForTimeout(100);
  assert((await page.locator('text=On Field (6 / 7 target)').count()) === 1, 'Target now reflects 8-a-side (7 outfield), with 1 open spot and no one forced on');

  // ============ Shrinking back to the team's own default collapses the override to null ============
  await page.click('[data-action="change-formation"]');
  await page.waitForSelector('#formation-form');
  assert(await page.locator('#formation-form [name="squadFormat"]').inputValue() === '8', 'Reopening shows the size just chosen (8), not the original default');
  await page.selectOption('#formation-form [name="squadFormat"]', '7');
  await page.waitForTimeout(100);
  await page.click('#formation-form button[type="submit"]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  game = state.games.find((g) => g.id === gameId);
  assert(game.squadFormat === null, `Picking the team's own default (7) again collapses back to null (inherit), rather than storing a redundant explicit 7, got ${game.squadFormat}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE CHANGE-SQUAD-SIZE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
