// Consistency fix: moving a player between teams/groups should work the
// same way everywhere in the app. Balance Teams already uses a per-player
// dropdown (one <select> next to each player, picking their team moves
// them instantly) — Training's Groups tab used to use a different,
// separate tap-to-select-then-"Move here" flow, and Training's Match Teams
// tab (small-sided scrimmage teams) had no reassignment control at all.
// Both now use the same dropdown pattern as Balance Teams. This covers
// Match Teams specifically; training-flow.test.js covers the Groups tab.
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
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const trainingId = state.trainings[0].id;

  await page.goto(`${BASE}/index.html#/training/${trainingId}/attendance`);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(100);

  await page.goto(`${BASE}/index.html#/training/${trainingId}/matches`);
  await page.waitForSelector('[data-action="build-matches"]');
  await page.click('[data-action="build-matches"]');
  await page.waitForTimeout(150);

  assert((await page.locator('[data-move-to-team], [data-team-player]').count()) === 0, 'No leftover tap-to-select move controls on this tab');

  const firstSelect = page.locator('[data-match-team-assign]').first();
  assert((await page.locator('[data-match-team-assign]').count()) > 0, 'Each player on a match team has their own move dropdown');
  const playerId = await firstSelect.getAttribute('data-match-team-assign');
  const sourceTeamId = await firstSelect.evaluate((el) => el.value);
  const optionValues = await firstSelect.locator('option').evaluateAll((opts) => opts.map((o) => o.value));
  const targetTeamId = optionValues.find((v) => v !== sourceTeamId);
  assert(targetTeamId, 'At least one other match team is offered as a move target');

  const totalBefore = await page.$$eval('.card [style*="font-weight:700"]', (els) =>
    els.filter((e) => /^Team \d+ \(/.test(e.textContent.trim())).reduce((sum, e) => sum + Number(e.textContent.match(/\((\d+)\)/)[1]), 0)
  );

  await firstSelect.selectOption(targetTeamId);
  await page.waitForTimeout(150);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const training = state.trainings.find((t) => t.id === trainingId);
  const sourceTeam = training.matchTeams.find((t) => t.id === sourceTeamId);
  const targetTeam = training.matchTeams.find((t) => t.id === targetTeamId);
  assert(!sourceTeam.playerIds.includes(playerId), 'Player no longer appears on the source team in localStorage');
  assert(targetTeam.playerIds.includes(playerId), 'Player now appears on the target team in localStorage');

  const totalAfter = await page.$$eval('.card [style*="font-weight:700"]', (els) =>
    els.filter((e) => /^Team \d+ \(/.test(e.textContent.trim())).reduce((sum, e) => sum + Number(e.textContent.match(/\((\d+)\)/)[1]), 0)
  );
  assert(totalBefore === totalAfter, `Total headcount across teams unchanged by the move (${totalBefore} before, ${totalAfter} after)`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING MATCH-TEAM MOVE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
