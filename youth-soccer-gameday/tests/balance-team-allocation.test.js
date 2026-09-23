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

  // ============ Roster: field exists on the player edit form and persists ============
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const firstPlayer = state.players[0];

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click(`[data-action="edit-player"][data-id="${firstPlayer.id}"]`);
  await page.waitForSelector('[name="teamAllocation"]');
  await page.fill('[name="teamAllocation"]', '9.4');
  await page.click('#player-form button[type="submit"]');
  await page.waitForTimeout(150);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const savedPlayer = state.players.find((p) => p.id === firstPlayer.id);
  assert(savedPlayer.teamAllocation === '9.4', `Team allocation saved on the roster, got "${savedPlayer.teamAllocation}"`);

  // Reopening the form shows the saved value.
  await page.click(`[data-action="edit-player"][data-id="${firstPlayer.id}"]`);
  await page.waitForSelector('[name="teamAllocation"]');
  const reopenedValue = await page.inputValue('[name="teamAllocation"]');
  assert(reopenedValue === '9.4', `Reopening the edit form shows the saved value, got "${reopenedValue}"`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.click('body', { position: { x: 5, y: 5 } }).catch(() => {});

  // Roster row shows a badge for it.
  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  const rosterText = await page.textContent('#app');
  assert(rosterText.includes('9.4'), 'Roster row displays the team allocation badge');

  // ============ Set a second value directly for a sort test ============
  const secondPlayer = state.players[1];
  await page.click(`[data-action="edit-player"][data-id="${secondPlayer.id}"]`);
  await page.waitForSelector('[name="teamAllocation"]');
  await page.fill('[name="teamAllocation"]', '9.5');
  await page.click('#player-form button[type="submit"]');
  await page.waitForTimeout(150);

  // ============ Balance Teams: column present, sortable, numeric-aware ============
  await page.goto(BASE + '/index.html#/balance');
  await page.waitForTimeout(200);

  const headers = await page.$$eval('table th', (els) => els.map((e) => e.textContent.trim()));
  assert(headers.some((h) => h.startsWith('Team Allocation')), `Team Allocation column header present, got ${JSON.stringify(headers)}`);

  const inputValue1 = await page.inputValue(`[data-team-alloc="${firstPlayer.id}"]`);
  assert(inputValue1 === '9.4', `Squad table's Team Allocation input shows the saved value, got "${inputValue1}"`);

  await page.click('[data-squad-sort="teamAllocation"]');
  await page.waitForTimeout(100);
  const allocCells = await page.$$eval('table tbody tr td:nth-child(4) input', (els) => els.map((e) => e.value));
  // Blank values sort first (empty string), then "9.4" before "9.5".
  const idxOf94 = allocCells.indexOf('9.4');
  const idxOf95 = allocCells.indexOf('9.5');
  assert(idxOf94 !== -1 && idxOf95 !== -1 && idxOf94 < idxOf95, `9.4 sorts before 9.5 ascending, got ${JSON.stringify(allocCells)}`);

  // ============ Editing the Team Allocation cell directly on this page persists ============
  const anyOtherInput = await page.$('table tbody tr:last-child input[data-team-alloc]');
  const otherPlayerId = await anyOtherInput.evaluate((el) => el.dataset.teamAlloc);
  await anyOtherInput.fill('9.6');
  await anyOtherInput.dispatchEvent('change');
  await page.waitForTimeout(150);

  const stateAfterInlineEdit = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const editedPlayer = stateAfterInlineEdit.players.find((p) => p.id === otherPlayerId);
  assert(editedPlayer.teamAllocation === '9.6', `Editing the Team Allocation cell directly on Balance Teams persists to the roster, got "${editedPlayer.teamAllocation}"`);

  // Numeric-aware sort: 10.1 should sort after 9.6, not before it lexicographically
  // (the earlier inline-edit step above already renamed the "9.5" row to "9.6").
  await page.fill(`[data-team-alloc="${firstPlayer.id}"]`, '10.1');
  await page.dispatchEvent(`[data-team-alloc="${firstPlayer.id}"]`, 'change');
  await page.waitForTimeout(150);
  const allocCellsAfter = await page.$$eval('table tbody tr td:nth-child(4) input', (els) => els.map((e) => e.value));
  const idx101 = allocCellsAfter.indexOf('10.1');
  const idx96 = allocCellsAfter.indexOf('9.6');
  assert(idx101 !== -1 && idx96 !== -1 && idx96 < idx101, `Numeric-aware sort: "9.6" sorts before "10.1" (not lexicographic), got ${JSON.stringify(allocCellsAfter)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TEAM-ALLOCATION TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
