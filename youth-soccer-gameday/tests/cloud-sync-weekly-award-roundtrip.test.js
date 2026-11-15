// Reported bug: setting a Player of the Week award, then syncing (even
// the app's own automatic sync, not just an explicit "Sync Now") made
// the award disappear — both locally and from the cloud.
//
// Root cause: store.js's applyCloudSync (which runs on every pull, and a
// Sync Now always pulls before it pushes — see cloudSync.js's syncNow)
// used to replace the local `team` object wholesale with whatever the
// cloud last had (`s.team = cloudData.team`). An award set locally but
// not yet pushed is exactly the case that hits this: the pull overwrites
// it with the cloud's still-stale, award-less copy before the push that
// follows even gets a chance to send it up — so the award is erased
// locally by the pull, and that already-erased state is then what gets
// pushed, erasing it from the cloud too.
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

  let stored = { data: null, meta: null };
  await page.route('https://fake-apps-script.example.com/exec*', async (route) => {
    const url = new URL(route.request().url());
    const role = url.searchParams.get('token') === 'fulledittoken' ? 'editor' : 'matchday';
    if (route.request().method() === 'GET') {
      route.fulfill({ json: { role, data: stored.data, meta: stored.meta } });
      return;
    }
    const posted = JSON.parse(route.request().postData());
    // A deliberately dumb mock — same "trust the editor wholesale" shape
    // the real server used to have before its own fix (see
    // cloud-sync-server-weekly-award-merge.test.js), so this test is
    // actually exercising the CLIENT-side protection in applyCloudSync,
    // not relying on the server to cover for it.
    stored = { data: { ...posted }, meta: { updatedAt: new Date().toISOString() } };
    route.fulfill({ json: { ok: true, role } });
  });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  // ============ Set up Cloud Sync — the mock "cloud" now holds this device's team, with no awards ============
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.setUpAsFullEditor('https://fake-apps-script.example.com/exec', 'Coach A', { fullEditToken: 'fulledittoken', matchdayToken: 'matchdaytoken' });
  });
  assert(stored.data && Array.isArray(stored.data.team.weeklyAwards) && stored.data.team.weeklyAwards.length === 0, 'Initial setup push carries this device\'s team, with no awards yet');

  // ============ Locally set a Player of the Week award — NOT pushed yet ============
  await page.goto(BASE + '/index.html#/stats/awards');
  await page.waitForSelector('[data-action="set-week-award"]');
  await page.click('[data-action="set-week-award"]');
  await page.waitForSelector('.checkbox-row input[type="checkbox"]');
  await page.click('.checkbox-row input[type="checkbox"]');
  await page.click('#week-award-form button[type="submit"]');
  await page.waitForTimeout(150);

  const afterSet = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(afterSet.team.weeklyAwards.length === 1, 'Award is set locally right away');
  assert(stored.data.team.weeklyAwards.length === 0, 'Sanity check: the mock cloud still has no award yet (this device hasn\'t synced since setting it)');

  // ============ Syncing now (pull-then-push) must not erase the just-set award ============
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);

  const afterSync = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(afterSync.team.weeklyAwards.length === 1, `Award survives locally after the sync's own pull step, got ${afterSync.team.weeklyAwards.length} awards`);
  assert(stored.data.team.weeklyAwards.length === 1, `Award reaches the cloud on the push right after, got ${stored.data.team.weeklyAwards.length} awards`);

  // ============ A fresh device joining afterward sees the award too ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=fulledittoken', 'Coach B');
  });
  const deviceBState = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(deviceBState.team.weeklyAwards.length === 1, 'A newly-joined device sees the synced award too');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC WEEKLY-AWARD ROUND-TRIP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
