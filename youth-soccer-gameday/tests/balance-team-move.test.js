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

  // Nav to Balance Teams (Schedule section).
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const game = state.games[0];
  assert(game, 'Sample game exists');

  await page.goto(`${BASE}/index.html#/balance/${game.id}`);
  await page.waitForSelector('[data-action="split"]');
  await page.click('[data-action="split"]');
  await page.waitForTimeout(200);

  // Reassignment lives in a select per included player — one in the Squad
  // table's own "Team" column, and one alongside each player in their Team
  // card below (so a coach can move someone from whichever section they're
  // already looking at) — not a tap-to-select-then-"Move here" flow.
  const teamAssignSelects = await page.$$('select[data-team-assign]');
  assert(teamAssignSelects.length > 0, `A Team dropdown is shown per included player, found ${teamAssignSelects.length}`);

  const bodyText = await page.textContent('#tab-content, #app, body');
  assert(bodyText.includes('Move a player between teams'), 'Hint banner text describes the Team-dropdown flow');
  assert(!bodyText.includes('Move here'), 'Old "Move here" hint text is gone');
  assert((await page.$$('[data-team-player]')).length === 0, 'Team cards no longer render clickable player buttons');
  assert((await page.$$('[data-move-to-team]')).length === 0, 'Old "Move here" buttons no longer exist anywhere');

  const firstSelect = teamAssignSelects[0];
  const playerId = await firstSelect.evaluate((el) => el.dataset.teamAssign);
  const originalValue = await firstSelect.evaluate((el) => el.value);
  const otherValue = originalValue === '0' ? '1' : '0';

  const totalBefore = await page.$$eval('.card [style*="font-weight:700"]', (els) =>
    els.filter((e) => /^Team \d+ \(/.test(e.textContent.trim())).reduce((sum, e) => sum + Number(e.textContent.match(/\((\d+)\)/)[1]), 0)
  );

  await firstSelect.selectOption(otherValue);
  await page.waitForTimeout(150);

  // Re-query since the whole page re-renders on every change.
  const movedSelect = await page.$(`select[data-team-assign="${playerId}"]`);
  const newValue = await movedSelect.evaluate((el) => el.value);
  assert(newValue === otherValue, `Player's Team dropdown reflects the move, got value=${newValue} expected=${otherValue}`);

  const totalAfter = await page.$$eval('.card [style*="font-weight:700"]', (els) =>
    els.filter((e) => /^Team \d+ \(/.test(e.textContent.trim())).reduce((sum, e) => sum + Number(e.textContent.match(/\((\d+)\)/)[1]), 0)
  );
  assert(totalAfter === totalBefore, `Total headcount across teams unchanged by the move (${totalBefore} before, ${totalAfter} after)`);

  // Moving the same player back should restore the original assignment.
  const movedBack = await page.$(`select[data-team-assign="${playerId}"]`);
  await movedBack.selectOption(originalValue);
  await page.waitForTimeout(150);
  const restoredSelect = await page.$(`select[data-team-assign="${playerId}"]`);
  const restoredValue = await restoredSelect.evaluate((el) => el.value);
  assert(restoredValue === originalValue, `Moving back restores the original team, got ${restoredValue} expected ${originalValue}`);

  assert(errors.length === 0, 'No console/page errors during balance-teams move testing: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL BALANCE-TEAMS MOVE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
