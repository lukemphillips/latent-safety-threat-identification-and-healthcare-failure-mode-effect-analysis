// Two changes to the Team Selection page (formerly "Balance Teams"):
//   1. Number of teams / Balance by moved out of the always-visible page
//      flow into an on-demand "Randomise Teams" modal, opened by the
//      button that used to split immediately — picking who's involved
//      comes first now, settings only when you're actually about to split.
//   2. A multi-select Stream filter alongside the existing (single-select)
//      Team Allocation filter — several streams can be shown at once,
//      unlike team allocation where a player only ever belongs to one.
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

  const active = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().players.filter((p) => p.active && !p.isGuest);
  });
  const streamCounts = {};
  active.forEach((p) => { if (p.skillStream) streamCounts[p.skillStream] = (streamCounts[p.skillStream] || 0) + 1; });
  const streamsPresent = Object.keys(streamCounts).sort();
  assert(streamsPresent.length >= 2, `Sample data has at least 2 distinct streams to test with, got ${JSON.stringify(streamCounts)}`);
  const [streamOne, streamTwo] = streamsPresent;

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  assert((await page.textContent('body')).includes('Team Selection'), 'Roster\'s link to this page is now labeled "Team Selection", not "Balance"');

  await page.goto(BASE + '/index.html#/balance');
  await page.waitForTimeout(200);

  // ============ 1. Number of teams / Balance by are gone from the main page ============
  assert(!(await page.$('[data-team-count]')), 'Number-of-teams tabs are not on the main page');
  assert(!(await page.$('[data-split-mode]')), 'Balance-by tabs are not on the main page');
  assert(!!(await page.$('[data-action="open-randomise"]')), 'A single button opens the Randomise modal instead');

  // ============ 2. The squad list — filters included — comes before any split settings ============
  const h1Text = await page.textContent('h1');
  assert(h1Text === 'Team Selection', `Page title reads "Team Selection", got "${h1Text}"`);

  // ============ 3. Stream filter is multi-select ============
  const streamChipTexts = await page.$$eval('[data-stream-filter]', (els) => els.map((e) => e.textContent.trim()));
  assert(streamChipTexts.length === streamsPresent.length, `A chip exists for each stream actually in use, got ${JSON.stringify(streamChipTexts)}`);

  await page.click(`[data-stream-filter="${streamOne}"]`);
  await page.waitForTimeout(100);
  let rowCount = await page.$$eval('table tbody tr', (els) => els.length);
  assert(rowCount === streamCounts[streamOne], `Filtering to stream ${streamOne} alone shows just those players, got ${rowCount} expected ${streamCounts[streamOne]}`);

  await page.click(`[data-stream-filter="${streamTwo}"]`);
  await page.waitForTimeout(100);
  rowCount = await page.$$eval('table tbody tr', (els) => els.length);
  const combinedCount = streamCounts[streamOne] + streamCounts[streamTwo];
  assert(rowCount === combinedCount, `Picking a SECOND stream shows both together (multi-select), got ${rowCount} expected ${combinedCount}`);

  const chipOneClass = await page.getAttribute(`[data-stream-filter="${streamOne}"]`, 'class');
  const chipTwoClass = await page.getAttribute(`[data-stream-filter="${streamTwo}"]`, 'class');
  assert(chipOneClass.includes('picking') && chipTwoClass.includes('picking'), 'Both picked stream chips show as active at once');

  await page.click('[data-action="clear-stream-filter"]');
  await page.waitForTimeout(100);
  rowCount = await page.$$eval('table tbody tr', (els) => els.length);
  assert(rowCount === active.length, `Clearing the stream filter shows everyone again, got ${rowCount}`);

  // ============ 4. Randomise modal: change settings, they stick when reopened, then split ============
  await page.click('[data-action="open-randomise"]');
  await page.waitForSelector('[data-action="confirm-split"]');
  const teamCountTabs = await page.$$eval('[data-team-count]', (els) => els.map((e) => e.textContent.trim()));
  assert(JSON.stringify(teamCountTabs) === JSON.stringify(['2 teams', '3 teams', '4 teams']), `Modal offers 2-4 teams, got ${JSON.stringify(teamCountTabs)}`);

  await page.click('[data-team-count="3"]');
  await page.waitForTimeout(100);
  const activeTeamCountTab = await page.$eval('.tab.active[data-team-count]', (el) => el.textContent.trim());
  assert(activeTeamCountTab === '3 teams', `Picking 3 teams in the modal marks it active, got "${activeTeamCountTab}"`);

  await page.click('[data-split-mode="same"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="confirm-split"]');
  await page.waitForTimeout(200);

  const teamOptionCounts = await page.$$eval('select[data-team-assign]', (els) => els.map((e) => e.options.length));
  assert(teamOptionCounts.every((c) => c === 3), `Split actually used the modal's choice of 3 teams, got ${JSON.stringify(teamOptionCounts)}`);

  // Reopening the modal after a split shows the same choices still selected.
  await page.click('[data-action="open-randomise"]');
  await page.waitForSelector('[data-action="confirm-split"]');
  const reopenedTeamCountTab = await page.$eval('.tab.active[data-team-count]', (el) => el.textContent.trim());
  const reopenedSplitModeTab = await page.$eval('.tab.active[data-split-mode]', (el) => el.textContent.trim());
  assert(reopenedTeamCountTab === '3 teams', `Reopening remembers 3 teams was chosen, got "${reopenedTeamCountTab}"`);
  assert(reopenedSplitModeTab === 'Same stream', `Reopening remembers "Same stream" was chosen, got "${reopenedSplitModeTab}"`);
  await page.click('[data-close-modal]');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TEAM-SELECTION STREAM-FILTER AND RANDOMISE-MODAL TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
