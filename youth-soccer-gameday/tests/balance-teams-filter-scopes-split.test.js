const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Reported bug: a coach opens Balance Teams (everyone checked by default),
// filters the squad list down to one Team Allocation, and taps Random
// Split straight away — no "Select None" first. The split still pulled in
// the whole roster, because only the visible ROWS were scoped by the
// filter; the underlying included-players set still had everyone checked
// from the default "select everyone" state. Filtering now scopes who's
// actually included, not just which rows are shown.
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
  const allocatedIds = active.slice(0, 4).map((p) => p.id);
  const allocatedNames = active.filter((p) => allocatedIds.includes(p.id)).map((p) => p.name);
  await page.evaluate(async (ids) => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      s.players.forEach((p) => { if (ids.includes(p.id)) p.teamAllocation = '9.5'; });
    });
  }, allocatedIds);

  await page.goto(BASE + '/index.html#/balance');
  await page.waitForTimeout(200);

  const squadHeadingBefore = await page.textContent('.section-title:has-text("Squad")');
  assert(squadHeadingBefore.includes(`(${active.length}/${active.length})`), `Everyone is included by default on a fresh visit, got "${squadHeadingBefore}"`);

  // Filter only — deliberately skip "Select None".
  await page.click('[data-team-alloc-filter="9.5"]');
  await page.waitForTimeout(150);

  const squadHeadingAfterFilter = await page.textContent('.section-title:has-text("Squad")');
  assert(squadHeadingAfterFilter.includes(`(4/${active.length})`), `Filtering alone scopes the included count to the 4 filtered players, got "${squadHeadingAfterFilter}"`);

  await page.click('[data-action="split"]');
  await page.waitForTimeout(150);
  const splitPlayerNames = await page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
  assert(splitPlayerNames.length === 4, `Random Split with just the filter applied includes only those 4 players, got ${splitPlayerNames.length}: ${JSON.stringify(splitPlayerNames)}`);
  const allMatch = splitPlayerNames.every((n) => allocatedNames.includes(n));
  assert(allMatch, `Every split player is one of the 4 allocated to "9.5", got ${JSON.stringify(splitPlayerNames)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL BALANCE TEAMS FILTER-SCOPES-SPLIT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
