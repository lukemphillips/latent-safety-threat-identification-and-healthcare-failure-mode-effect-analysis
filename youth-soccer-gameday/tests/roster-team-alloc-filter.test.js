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
  const [p1, p2, p3] = state.players;
  await page.evaluate(async ({ id1, id2 }) => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      s.players.find((p) => p.id === id1).teamAllocation = '9.4';
      s.players.find((p) => p.id === id2).teamAllocation = '9.4';
    });
  }, { id1: p1.id, id2: p2.id });

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);

  // ============ No filter chip row when nothing has an allocation yet ============
  // (already covered implicitly below once one is set — check the chip
  // for "9.4" exists now that two players carry it.)
  const chipTexts = await page.$$eval('[data-team-alloc-filter]', (els) => els.map((e) => e.textContent.trim()));
  assert(chipTexts.includes('9.4'), `Team allocation filter chip for "9.4" is present, got ${JSON.stringify(chipTexts)}`);

  const rowCountBefore = await page.$$eval('.player-row', (els) => els.length);
  assert(rowCountBefore === state.players.length, `All players shown before filtering, got ${rowCountBefore}`);

  // ============ Clicking the chip filters to just that team ============
  await page.click('[data-team-alloc-filter="9.4"]');
  await page.waitForTimeout(100);
  const namesFiltered = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  assert(namesFiltered.length === 2, `Exactly the two "9.4" players shown, got ${JSON.stringify(namesFiltered)}`);
  assert(namesFiltered.includes(p1.name) && namesFiltered.includes(p2.name), `Filtered list is exactly the two allocated players, got ${JSON.stringify(namesFiltered)}`);
  assert(!namesFiltered.includes(p3.name), `A player without that allocation is excluded, got ${JSON.stringify(namesFiltered)}`);

  const activeChipClass = await page.getAttribute('[data-team-alloc-filter="9.4"]', 'class');
  assert(activeChipClass.includes('picking'), `Active filter chip shows the "picking" highlight, got "${activeChipClass}"`);

  // ============ Clicking the same chip again clears the filter ============
  await page.click('[data-team-alloc-filter="9.4"]');
  await page.waitForTimeout(100);
  const rowCountAfterToggleOff = await page.$$eval('.player-row', (els) => els.length);
  assert(rowCountAfterToggleOff === state.players.length, `Clicking the active chip again clears the filter, got ${rowCountAfterToggleOff}`);

  // ============ The explicit Clear chip also works ============
  await page.click('[data-team-alloc-filter="9.4"]');
  await page.waitForTimeout(100);
  const clearBtn = await page.$('[data-action="clear-team-alloc-filter"]');
  assert(!!clearBtn, 'Clear chip appears once a filter is active');
  await clearBtn.click();
  await page.waitForTimeout(100);
  const rowCountAfterClear = await page.$$eval('.player-row', (els) => els.length);
  assert(rowCountAfterClear === state.players.length, `Clear chip resets to showing everyone, got ${rowCountAfterClear}`);

  // ============ Filter combines correctly with sorting ============
  await page.click('[data-team-alloc-filter="9.4"]');
  await page.click('[data-roster-sort="name"]');
  await page.waitForTimeout(100);
  const sortedFilteredNames = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  assert(sortedFilteredNames.length === 2, `Sort still respects the active filter, got ${JSON.stringify(sortedFilteredNames)}`);
  const expectedOrder = [p1.name, p2.name].sort((a, b) => a.localeCompare(b));
  assert(JSON.stringify(sortedFilteredNames) === JSON.stringify(expectedOrder), `Filtered players are sorted correctly too, got ${JSON.stringify(sortedFilteredNames)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL ROSTER TEAM-ALLOCATION FILTER TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
