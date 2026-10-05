// Training sessions now sync the same way the roster does (see store.js's
// applyCloudSync and cloudSync.js's pushToCloud/markSynced) — this mirrors
// cloud-sync-roundtrip.test.js's player coverage, but for a training
// session: an edit survives its own Sync Now, a fresh device picks it up,
// an external cloud-side change still propagates when there's no local
// conflict, and a deletion survives its own Sync Now and reaches a fresh
// device too.
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
    if (role === 'editor') {
      stored = { data: { ...posted, trainings: posted.trainings || [] }, meta: { updatedAt: new Date().toISOString() } };
    } else {
      // Matchday never touches trainings server-side either.
      stored = { data: { ...stored.data, games: posted.games }, meta: { updatedAt: new Date().toISOString() } };
    }
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

  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.setUpAsFullEditor('https://fake-apps-script.example.com/exec', 'Coach A', { fullEditToken: 'fulledittoken', matchdayToken: 'matchdaytoken' });
  });
  assert(stored.data && stored.data.trainings.length > 0, 'Initial setup push carried this device\'s training session to the mock cloud');

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const targetTraining = state.trainings[0];

  // ============ A local edit must survive a Sync Now, not get clobbered by its own pull ============
  await page.goto(`${BASE}/index.html#/training/${targetTraining.id}/attendance`);
  await page.waitForSelector('[data-action="edit-training"]');
  await page.click('[data-action="edit-training"]');
  await page.waitForSelector('[name="location"]');
  await page.fill('[name="location"]', 'Updated Pitch 1');
  await page.click('#training-form button[type="submit"]');
  await page.waitForTimeout(150);

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);

  const cloudTraining = stored.data.trainings.find((t) => t.id === targetTraining.id);
  assert(cloudTraining && cloudTraining.location === 'Updated Pitch 1', `Edit made just before Sync Now reaches the cloud, got "${cloudTraining && cloudTraining.location}"`);

  const localAfterSync = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const localTraining = localAfterSync.trainings.find((t) => t.id === targetTraining.id);
  assert(localTraining.location === 'Updated Pitch 1', `Edit survives locally too after the sync's own pull step, got "${localTraining.location}"`);

  // ============ A fresh device joining as Full Edit picks up that edit ============
  // (Training sessions are editor-only, so a plain Matchday join wouldn't
  // see any UI for them even if it did sync — join as editor instead.)
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const joinResult = await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    return mod.joinWithLink('https://fake-apps-script.example.com/exec?token=fulledittoken', 'Coach B');
  });
  assert(joinResult.role === 'editor', 'Second device joined with Full Edit access');

  const deviceBState = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const deviceBTraining = deviceBState.trainings.find((t) => t.id === targetTraining.id);
  assert(deviceBTraining && deviceBTraining.location === 'Updated Pitch 1', `A newly-joined device sees the synced training edit, got "${deviceBTraining && deviceBTraining.location}"`);

  // ============ With no local edit, a genuine cloud-side change from elsewhere still propagates ============
  stored.data.trainings = stored.data.trainings.map((t) => (t.id === targetTraining.id ? { ...t, location: 'Updated Pitch 2' } : t));
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.syncNow();
  });
  const deviceBAfterExternalChange = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const propagated = deviceBAfterExternalChange.trainings.find((t) => t.id === targetTraining.id);
  assert(propagated.location === 'Updated Pitch 2', `A training change made elsewhere in the cloud still reaches a device with no conflicting local edit, got "${propagated.location}"`);

  // ============ Deleting a training session must survive its own Sync Now ============
  await page.goto(`${BASE}/index.html#/training/${targetTraining.id}/attendance`);
  await page.waitForSelector('[data-action="edit-training"]');
  await page.click('[data-action="edit-training"]');
  await page.waitForSelector('[data-action="delete-training"]');
  await page.click('[data-action="delete-training"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);

  const localAfterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!localAfterDelete.trainings.some((t) => t.id === targetTraining.id), 'Training session is gone locally right after deleting');

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);

  assert(!stored.data.trainings.some((t) => t.id === targetTraining.id), 'Deletion made just before Sync Now reaches the cloud (not resurrected by the pull)');

  const localAfterDeleteSync = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!localAfterDeleteSync.trainings.some((t) => t.id === targetTraining.id), 'Training session stays deleted locally too after the sync\'s own pull step');

  // ============ And a fresh device sees the deletion too ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=fulledittoken', 'Coach C');
  });
  const deviceCState = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!deviceCState.trainings.some((t) => t.id === targetTraining.id), 'A newly-joined device never sees the deleted training session');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC TRAINING ROUND-TRIP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
