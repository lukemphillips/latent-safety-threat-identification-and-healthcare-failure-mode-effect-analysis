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

  await page.goto(BASE + '/index.html#/balance');
  await page.waitForTimeout(200);

  // ============ Table renders with the expected columns ============
  // Column order: [checkbox] Name | Stream | Team Allocation | Team (split).
  const headers = await page.$$eval('table th', (els) => els.map((e) => e.textContent.trim()));
  assert(headers.some((h) => h.startsWith('Name')), `Name column header present, got ${JSON.stringify(headers)}`);
  assert(headers.some((h) => h.startsWith('Stream')), `Stream column header present, got ${JSON.stringify(headers)}`);
  assert(headers.some((h) => h.startsWith('Team Allocation')), `Team Allocation column header present, got ${JSON.stringify(headers)}`);
  assert(headers.some((h) => h === 'Team'), `Team (split) column header present, got ${JSON.stringify(headers)}`);

  // ============ Default sort is by Name, ascending ============
  // Each cell reads "<jersey#> <name>" — strip the jersey number prefix so
  // the comparison is on the actual name, not the digit-prefixed string
  // (e.g. "10 Isla" vs "2 Liam" sorts wrong lexicographically otherwise).
  const stripJersey = (cellText) => cellText.replace(/^\S+\s+/, '');
  const namesDefault = await page.$$eval('table tbody tr td:nth-child(2)', (els) => els.map((e) => e.textContent.trim()));
  const bareNamesDefault = namesDefault.map(stripJersey);
  const sortedNames = [...bareNamesDefault].sort((a, b) => a.localeCompare(b));
  assert(JSON.stringify(bareNamesDefault) === JSON.stringify(sortedNames), `Squad table defaults to Name ascending, got ${JSON.stringify(bareNamesDefault)}`);

  // ============ Clicking Name header again reverses to descending ============
  await page.click('[data-squad-sort="name"]');
  await page.waitForTimeout(100);
  const namesDesc = await page.$$eval('table tbody tr td:nth-child(2)', (els) => els.map((e) => e.textContent.trim()));
  const bareNamesDesc = namesDesc.map(stripJersey);
  assert(JSON.stringify(bareNamesDesc) === JSON.stringify([...sortedNames].reverse()), `Clicking Name again sorts descending, got ${JSON.stringify(bareNamesDesc)}`);
  const nameHeaderText = await page.textContent('[data-squad-sort="name"]');
  assert(nameHeaderText.includes('▼'), `Name header shows a ▼ once descending, got "${nameHeaderText}"`);

  // ============ Clicking Stream header sorts by stream (A, B, C, D, then unclassified) ============
  await page.click('[data-squad-sort="stream"]');
  await page.waitForTimeout(100);
  const streamHeaderText = await page.textContent('[data-squad-sort="stream"]');
  assert(streamHeaderText.includes('▲'), `Stream header shows ▲ on first click (fresh ascending sort), got "${streamHeaderText}"`);
  const streamCells = await page.$$eval('table tbody tr td:nth-child(3)', (els) => els.map((e) => e.textContent.trim()));
  const streamRank = (s) => (s.startsWith('Stream A') ? 0 : s.startsWith('Stream B') ? 1 : s.startsWith('Stream C') ? 2 : s.startsWith('Stream D') ? 3 : 4);
  const ranks = streamCells.map(streamRank);
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  assert(JSON.stringify(ranks) === JSON.stringify(sortedRanks), `Rows are ordered by stream after clicking Stream header, got ${JSON.stringify(ranks)}`);

  // ============ Before a split, Team column shows "Not split yet" ============
  const teamCellsBefore = await page.$$eval('table tbody tr td:nth-child(5)', (els) => els.map((e) => e.textContent.trim()));
  assert(teamCellsBefore.every((t) => t === 'Not split yet'), `Every row shows "Not split yet" before any split, got ${JSON.stringify(teamCellsBefore)}`);

  // ============ Unchecking a player, then re-checking, still works and doesn't error ============
  // Re-query the checkbox after each click since renderBalanceTeams() fully
  // replaces the table's DOM each time (any prior handle goes stale).
  await (await page.$('table tbody tr td:first-child input[type="checkbox"]')).click();
  await page.waitForTimeout(100);
  await (await page.$('table tbody tr td:first-child input[type="checkbox"]')).click();
  await page.waitForTimeout(100);

  // ============ Random Split populates the Team column with real dropdowns ============
  await page.click('[data-action="split"]');
  await page.waitForTimeout(200);

  const teamSelects = await page.$$('table tbody select[data-team-assign]');
  assert(teamSelects.length > 0, `Team column now shows dropdowns for included players, got ${teamSelects.length}`);

  const optionCounts = await page.$$eval('table tbody select[data-team-assign]', (els) => els.map((e) => e.options.length));
  assert(optionCounts.every((c) => c === 2), `Each Team dropdown offers exactly 2 options (2-team default split), got ${JSON.stringify(optionCounts)}`);

  // ============ Team cards below reflect the same total headcount as the squad ============
  const sectionTitles = await page.$$eval('.section-title', (els) => els.map((e) => e.textContent.trim()));
  const includedCountText = sectionTitles.find((t) => t.startsWith('Squad ('));
  const totalOnTeams = await page.$$eval('.card [style*="font-weight:700"]', (els) =>
    els.filter((e) => /^Team \d+ \(/.test(e.textContent.trim())).reduce((sum, e) => sum + Number(e.textContent.match(/\((\d+)\)/)[1]), 0)
  );
  const includedMatch = includedCountText.match(/Squad \((\d+)\//);
  assert(includedMatch, `Found the Squad count label, got "${includedCountText}"`);
  assert(Number(includedMatch[1]) === totalOnTeams, `Squad count (${includedMatch[1]}) matches total players across team cards (${totalOnTeams})`);

  // ============ Reassigning a player via the dropdown actually moves them ============
  const firstSelect = teamSelects[0];
  const playerId = await firstSelect.evaluate((el) => el.dataset.teamAssign);
  const originalValue = await firstSelect.evaluate((el) => el.value);
  const otherValue = originalValue === '0' ? '1' : '0';

  await firstSelect.selectOption(otherValue);
  await page.waitForTimeout(150);

  // Re-query since the DOM was fully re-rendered.
  const movedSelect = await page.$(`select[data-team-assign="${playerId}"]`);
  const newValue = await movedSelect.evaluate((el) => el.value);
  assert(newValue === otherValue, `Player's Team dropdown reflects the move (now Team ${Number(otherValue) + 1}), got value=${newValue}`);

  // ============ Team card totals still sum correctly after the manual move ============
  const totalAfterMove = await page.$$eval('.card [style*="font-weight:700"]', (els) =>
    els.filter((e) => /^Team \d+ \(/.test(e.textContent.trim())).reduce((sum, e) => sum + Number(e.textContent.match(/\((\d+)\)/)[1]), 0)
  );
  assert(totalAfterMove === totalOnTeams, `Total headcount across teams unchanged after a manual move (still ${totalOnTeams}), got ${totalAfterMove}`);

  // ============ Toggling squad membership after a split clears the Team column back to "Not split yet" ============
  const anyCheckbox = await page.$('table tbody tr td:first-child input[type="checkbox"]');
  await anyCheckbox.click();
  await page.waitForTimeout(150);
  const teamCellsAfterToggle = await page.$$eval('table tbody tr td:nth-child(5)', (els) => els.map((e) => e.textContent.trim()));
  assert(teamCellsAfterToggle.every((t) => t === 'Not split yet'), `Toggling squad membership invalidates the split, Team column resets, got ${JSON.stringify(teamCellsAfterToggle)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SQUAD-TABLE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
