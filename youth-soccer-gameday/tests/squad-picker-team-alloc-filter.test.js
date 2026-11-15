// Team allocation filter chips (same pattern as Roster and Balance Teams'
// "Team Selection" table) added to the Squad tab's "Who's Playing?" picker
// modal — lets a club running one big squad across several named teams
// (e.g. 9.4, 9.5) find just their players in a long shared roster.
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

  const { gameId, taggedIds, untaggedId } = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    const [p1, p2, p3] = s.players.filter((p) => p.active && !p.isGuest);
    mod.update((state) => {
      state.players.find((p) => p.id === p1.id).teamAllocation = '9.4';
      state.players.find((p) => p.id === p2.id).teamAllocation = '9.4';
    });
    return { gameId: s.games.find((g) => g.status === 'scheduled').id, taggedIds: [p1.id, p2.id], untaggedId: p3.id };
  });

  await page.goto(`${BASE}/index.html#/game/${gameId}`);
  await page.waitForTimeout(150);
  await page.click('[data-action="open-squad-picker"]');
  await page.waitForSelector('#squad-picker-list');

  // ============ Filter chips offered, matching the team allocations actually in use ============
  const chipTexts = await page.$$eval('#squad-picker-filters [data-team-alloc-filter]', (els) => els.map((e) => e.textContent.trim()));
  assert(JSON.stringify(chipTexts) === JSON.stringify(['9.4']), `Only the one team allocation actually in use is offered, got ${JSON.stringify(chipTexts)}`);

  // ============ Picking a chip narrows the list to just that team ============
  await page.click('[data-team-alloc-filter="9.4"]');
  await page.waitForTimeout(100);
  for (const id of taggedIds) {
    assert(!!(await page.$(`[data-squad-status-btn][data-player-id="${id}"]`)), `Tagged player ${id} is shown while filtered to 9.4`);
  }
  assert(!(await page.$(`[data-squad-status-btn][data-player-id="${untaggedId}"]`)), 'An unrelated player is hidden while filtered to 9.4');
  const activeChipClass = await page.getAttribute('[data-team-alloc-filter="9.4"]', 'class');
  assert(activeChipClass.includes('picking'), 'The active filter chip is visually marked active');

  // ============ Toggling a player while filtered works, and the filter stays applied afterward (not reset by the re-render) ============
  await page.click(`[data-squad-status-btn][data-value="yes"][data-player-id="${taggedIds[0]}"]`);
  await page.waitForTimeout(150);
  assert(!(await page.$(`[data-squad-status-btn][data-player-id="${untaggedId}"]`)), 'Filter is still applied right after toggling a player In/Out');
  const statusAfterToggle = await page.evaluate(async ({ id, gid }) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === gid);
    return g.rsvps[id];
  }, { id: taggedIds[0], gid: gameId });
  assert(statusAfterToggle === 'yes', 'The toggle itself actually took effect while filtered');

  // ============ Clear removes the filter, everyone shows again ============
  await page.click('[data-action="clear-team-alloc-filter"]');
  await page.waitForTimeout(100);
  assert(!!(await page.$(`[data-squad-status-btn][data-player-id="${untaggedId}"]`)), 'Clearing the filter brings everyone back');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SQUAD PICKER TEAM-ALLOC FILTER TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
