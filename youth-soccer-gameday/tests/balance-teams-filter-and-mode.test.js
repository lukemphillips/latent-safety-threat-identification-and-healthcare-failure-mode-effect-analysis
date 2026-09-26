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

  // Give a few players a team allocation so the filter chips have
  // something to show, matching how a coach running sub-teams would set
  // them up on the roster first.
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const active = state.players.filter((p) => p.active && !p.isGuest);
  const allocatedIds = active.slice(0, 4).map((p) => p.id);
  await page.evaluate(async (ids) => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      s.players.forEach((p) => { if (ids.includes(p.id)) p.teamAllocation = '9.4'; });
    });
  }, allocatedIds);

  await page.goto(BASE + '/index.html#/balance');
  await page.waitForTimeout(200);

  // ============ Filter by team allocation ============
  const rowCountBefore = await page.$$eval('table tbody tr', (els) => els.length);
  assert(rowCountBefore === active.length, `All active players shown before filtering, got ${rowCountBefore} of ${active.length}`);

  await page.click('[data-team-alloc-filter="9.4"]');
  await page.waitForTimeout(100);
  const rowCountFiltered = await page.$$eval('table tbody tr', (els) => els.length);
  assert(rowCountFiltered === 4, `Filtering to "9.4" shows only those 4 players, got ${rowCountFiltered}`);

  // Filtering scopes who's actually included for the split, not just which
  // rows are shown — a coach who filters and taps Random Split straight
  // away (without first clearing everyone else) should only get those 4.
  const squadHeading = await page.textContent('.section-title:has-text("Squad")');
  assert(squadHeading.includes(`(4/${active.length})`), `Squad heading reflects only the 4 filtered players just from filtering, got "${squadHeading}"`);

  await page.click('[data-action="clear-team-alloc-filter"]');
  await page.waitForTimeout(100);
  const rowCountAfterClear = await page.$$eval('table tbody tr', (els) => els.length);
  assert(rowCountAfterClear === active.length, `Clearing the filter shows everyone again, got ${rowCountAfterClear}`);
  const squadHeadingAfterClear = await page.textContent('.section-title:has-text("Squad")');
  assert(squadHeadingAfterClear.includes(`(${active.length}/${active.length})`), `Clearing the filter restores everyone to the included count too, got "${squadHeadingAfterClear}"`);

  // ============ Select All while filtered only adds the filtered team ============
  // Reported bug: filter the squad list down to one team allocation, then
  // "Select All" pulled in the ENTIRE roster instead of just the 4 players
  // the filter was showing, so a random split included everyone.
  await page.click('[data-action="select-none"]');
  await page.waitForTimeout(100);
  await page.click('[data-team-alloc-filter="9.4"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="select-all"]');
  await page.waitForTimeout(100);

  const squadHeadingAfterFilteredSelectAll = await page.textContent('.section-title:has-text("Squad")');
  assert(squadHeadingAfterFilteredSelectAll.includes(`(4/${active.length})`), `"Select All" while filtered to "9.4" only selects those 4, got "${squadHeadingAfterFilteredSelectAll}"`);

  await page.click('[data-action="split"]');
  await page.waitForTimeout(150);
  const splitPlayerNames = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  assert(splitPlayerNames.length === 4, `Random split with the filtered selection only includes those 4 players, got ${splitPlayerNames.length}: ${JSON.stringify(splitPlayerNames)}`);

  // Reset squad selection back to everyone for the rest of this test.
  await page.click('[data-action="clear-team-alloc-filter"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="select-all"]');
  await page.waitForTimeout(100);

  // ============ Balance by ability or stream ============
  const modeTabs = await page.$$eval('[data-split-mode]', (els) => els.map((e) => e.textContent.trim()));
  assert(modeTabs.includes('Mixed ability') && modeTabs.includes('Same stream'), `Both balance modes are offered, got ${JSON.stringify(modeTabs)}`);

  await page.click('[data-split-mode="same"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="split"]');
  await page.waitForTimeout(150);

  let teamCardsText = await page.$$eval('.card', (els) => els.map((e) => e.textContent));
  assert(teamCardsText.some((t) => /Team \d+ \(\d+\)/.test(t)), 'Same-stream split produced team cards');

  await page.click('[data-split-mode="mixed"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="split"]');
  await page.waitForTimeout(150);

  teamCardsText = await page.$$eval('.card', (els) => els.map((e) => e.textContent));
  assert(teamCardsText.some((t) => /Team \d+ \(\d+\)/.test(t)), 'Mixed-ability split produced team cards');

  // ============ Move a player between teams from the Teams section ============
  const firstAssignSelect = await page.$('[data-team-assign]');
  const movedPlayerId = await firstAssignSelect.evaluate((el) => el.dataset.teamAssign);
  const optionValues = await firstAssignSelect.$$eval('option', (opts) => opts.map((o) => o.value));
  const currentValue = await firstAssignSelect.inputValue();
  const targetValue = optionValues.find((v) => v !== currentValue);
  assert(targetValue !== undefined, 'A different team option exists to move this player into');

  await firstAssignSelect.selectOption(targetValue);
  await page.waitForTimeout(150);

  // Balance Teams' split isn't persisted to storage (it's page-only state),
  // so confirm the move took effect in the DOM instead: both the Squad
  // table's dropdown and the moved player's Team-card dropdown (there are
  // two controls per player once split — one in each section) should now
  // agree on the new team index.
  const selectValuesForPlayer = await page.$$eval('[data-team-assign]', (els, id) => els
    .filter((el) => el.dataset.teamAssign === id)
    .map((el) => el.value), movedPlayerId);
  assert(selectValuesForPlayer.length === 2, `Both the Squad table and Team card expose a move control for this player, got ${selectValuesForPlayer.length}`);
  assert(selectValuesForPlayer.every((v) => v === targetValue), `Both controls for the moved player agree on team ${targetValue}, got ${JSON.stringify(selectValuesForPlayer)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL BALANCE TEAMS FILTER/MODE/MOVE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
