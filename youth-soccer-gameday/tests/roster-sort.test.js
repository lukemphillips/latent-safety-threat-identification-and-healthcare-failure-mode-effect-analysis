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

  // Give a couple of players team allocations to sort by later — going
  // through the app's own store.js update() (not a raw localStorage write)
  // so the in-memory state singleton stays in sync; a raw write is silently
  // clobbered on the next render since a same-document hash navigation
  // doesn't reload the module and re-read localStorage from scratch.
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const [p1, p2, p3] = state.players;
  await page.evaluate(async ({ id1, id2, id3 }) => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      s.players.find((p) => p.id === id1).teamAllocation = '9.5';
      s.players.find((p) => p.id === id2).teamAllocation = '9.4';
      s.players.find((p) => p.id === id3).teamAllocation = '10.1';
    });
  }, { id1: p1.id, id2: p2.id, id3: p3.id });

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);

  // ============ Sort-by buttons render ============
  const sortBtnLabels = await page.$$eval('[data-roster-sort]', (els) => els.map((e) => e.dataset.rosterSort));
  assert(JSON.stringify(sortBtnLabels) === JSON.stringify(['name', 'stream', 'teamAllocation']), `Sort buttons for name/stream/teamAllocation present, got ${JSON.stringify(sortBtnLabels)}`);

  // ============ Default order unaffected (active first, then jersey) ============
  const namesDefault = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  assert(namesDefault.length === state.players.length, `All players shown by default, got ${namesDefault.length} expected ${state.players.length}`);

  // ============ Click Name: sorts alphabetically ascending ============
  await page.click('[data-roster-sort="name"]');
  await page.waitForTimeout(100);
  const namesAsc = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  const sortedNames = [...namesAsc].sort((a, b) => a.localeCompare(b));
  assert(JSON.stringify(namesAsc) === JSON.stringify(sortedNames), `Roster sorts by Name ascending, got ${JSON.stringify(namesAsc)}`);
  const nameBtnText = await page.textContent('[data-roster-sort="name"]');
  assert(nameBtnText.includes('▲'), `Name button shows ▲ once active, got "${nameBtnText}"`);

  // ============ Click Name again: descending ============
  await page.click('[data-roster-sort="name"]');
  await page.waitForTimeout(100);
  const namesDesc = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  assert(JSON.stringify(namesDesc) === JSON.stringify([...sortedNames].reverse()), `Clicking Name again reverses to descending, got ${JSON.stringify(namesDesc)}`);

  // ============ Click Stream: groups A < B < C < D < unclassified ============
  await page.click('[data-roster-sort="stream"]');
  await page.waitForTimeout(100);
  const streamTexts = await page.$$eval('.player-row .badge', (els) => els.map((e) => e.textContent.trim()).filter((t) => t.startsWith('Stream') || t === 'Unclassified'));
  // One stream badge per player row, in row order — but query above collects all badges per row
  // in DOM order, so instead re-derive per row explicitly.
  const streamPerRow = await page.$$eval('.player-row', (rows) => rows.map((r) => {
    const badge = [...r.querySelectorAll('.badge')].find((b) => b.className.includes('stream-'));
    return badge ? badge.textContent.trim() : '';
  }));
  const streamRank = (s) => (s.startsWith('Stream A') ? 0 : s.startsWith('Stream B') ? 1 : s.startsWith('Stream C') ? 2 : s.startsWith('Stream D') ? 3 : 4);
  const ranks = streamPerRow.map(streamRank);
  const sortedRanks = [...ranks].sort((a, b) => a - b);
  assert(JSON.stringify(ranks) === JSON.stringify(sortedRanks), `Roster sorts by Stream, got ${JSON.stringify(ranks)}`);

  // ============ Click Team Allocation: numeric-aware sort ============
  await page.click('[data-roster-sort="teamAllocation"]');
  await page.waitForTimeout(100);
  const allocTexts = await page.$$eval('.player-row', (rows) => rows.map((r) => {
    const badge = [...r.querySelectorAll('.badge')].find((b) => b.className.includes('team-alloc'));
    return badge ? badge.textContent.trim() : '';
  }));
  const idx94 = allocTexts.indexOf('9.4');
  const idx95 = allocTexts.indexOf('9.5');
  const idx101 = allocTexts.indexOf('10.1');
  assert(idx94 !== -1 && idx95 !== -1 && idx101 !== -1, `All three team-allocation badges present, got ${JSON.stringify(allocTexts)}`);
  assert(idx94 < idx95 && idx95 < idx101, `Numeric-aware order: 9.4 < 9.5 < 10.1, got ${JSON.stringify(allocTexts)}`);

  // ============ Clicking a different sort key resets to ascending (doesn't carry over old direction) ============
  const allocBtnText = await page.textContent('[data-roster-sort="teamAllocation"]');
  assert(allocBtnText.includes('▲'), `Switching to a new sort key starts ascending, got "${allocBtnText}"`);
  const nameBtnTextAfter = await page.textContent('[data-roster-sort="name"]');
  assert(!nameBtnTextAfter.includes('▲') && !nameBtnTextAfter.includes('▼'), `Previously active Name button no longer shows an arrow, got "${nameBtnTextAfter}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL ROSTER-SORT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
