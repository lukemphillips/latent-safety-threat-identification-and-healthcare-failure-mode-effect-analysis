// Reported bug: sorting Training groups by "Same stream" put a player into
// a group that didn't match their actual skill stream (e.g. landed in a
// "D" group). Root cause — the "Balance numbers across groups" checkbox
// defaulted to checked (and didn't persist its state across re-renders),
// silently moving players across stream lines to even up group sizes even
// when a coach never asked for that trade-off. This covers: balancing is
// off by default, every player lands in a group matching their real
// stream with it off, and the checkbox's state survives a re-render.
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
  await page.waitForTimeout(300);

  const trainingId = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return (mod.getState().trainings || [])[0]?.id;
  });

  await page.goto(`${BASE}/index.html#/training/${trainingId}/attendance`);
  await page.waitForTimeout(200);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);

  await page.goto(`${BASE}/index.html#/training/${trainingId}/groups`);
  await page.waitForTimeout(200);

  // ============ Balance numbers is off by default ============
  assert((await page.isChecked('#group-balance-numbers')) === false, '"Balance numbers across groups" is unchecked by default');

  // ============ With it off, every player lands in a group matching their real stream ============
  await page.click('[data-action="auto-build-groups"]');
  await page.waitForTimeout(200);
  const mismatches = await page.evaluate(async (tId) => {
    const mod = await import('/js/store.js');
    const state = mod.getState();
    const t = state.trainings.find((x) => x.id === tId);
    const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
    const bad = [];
    t.groups.forEach((g) => {
      g.playerIds.forEach((pid) => {
        const p = byId[pid];
        const stream = p.skillStream || null;
        const label = stream || 'Unclassified';
        if (!g.name.includes(label)) bad.push({ name: p.name, stream: label, group: g.name });
      });
    });
    return bad;
  }, trainingId);
  assert(mismatches.length === 0, `No player lands in a group outside their own stream with balancing off, got mismatches: ${JSON.stringify(mismatches)}`);

  // ============ Checking it on persists across a re-render (not reset to checked, not forgotten either) ============
  await page.check('#group-balance-numbers');
  await page.click('.tab:has-text("Mixed ability")');
  await page.waitForTimeout(100);
  await page.click('.tab:has-text("Same stream")');
  await page.waitForTimeout(100);
  assert((await page.isChecked('#group-balance-numbers')) === true, 'Checking the box survives switching modes and back (re-render), instead of resetting');

  // Uncheck it again and confirm that sticks too.
  await page.uncheck('#group-balance-numbers');
  await page.click('.tab:has-text("Mixed ability")');
  await page.waitForTimeout(100);
  await page.click('.tab:has-text("Same stream")');
  await page.waitForTimeout(100);
  assert((await page.isChecked('#group-balance-numbers')) === false, 'Unchecking it also survives a re-render');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING GROUPS STREAM-PURITY TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
