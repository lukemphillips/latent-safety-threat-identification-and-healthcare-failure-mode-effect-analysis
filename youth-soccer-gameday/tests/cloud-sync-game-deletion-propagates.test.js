// Reported bug: a scheduled match that was deleted on this device kept
// reappearing after a Cloud Sync resync. The real merge protection lives
// server-side (see cloud-sync-server-game-deletion.test.js), but the
// CLIENT side (applyCloudSync in store.js) has its own job: a deletion
// must actually get pushed in the first place (as a tombstone, not just
// a shorter games list), and a pull that returns a stale, already-
// deleted game shouldn't resurrect it locally even if whatever's on the
// other end of the wire is naive about tombstones. This mock server is
// deliberately simple (closer to a dumb key-value store than the real
// Apps Script's own merge logic, which has its own dedicated test) so
// this specifically isolates and proves the CLIENT's behavior.
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
    if (route.request().method() === 'GET') {
      route.fulfill({ json: { role: 'editor', data: stored.data, meta: stored.meta } });
      return;
    }
    const posted = JSON.parse(route.request().postData());
    stored = { data: posted, meta: { updatedAt: new Date().toISOString(), updatedBy: posted.syncedByName || '' } };
    route.fulfill({ json: { ok: true, role: 'editor' } });
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
  await page.waitForTimeout(150);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const scheduledGame = state.games.find((g) => g.status === 'scheduled');
  assert(scheduledGame, 'Found a scheduled game to delete');

  // ============ Delete the scheduled game locally ============
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}`);
  await page.waitForSelector('[data-action="delete-game-quick"]');
  await page.click('[data-action="delete-game-quick"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!state.games.some((g) => g.id === scheduledGame.id), 'Game is gone from local games right after deleting');
  const tombstone = (state.deletedGameIds || []).find((t) => t.id === scheduledGame.id);
  assert(tombstone, `A tombstone was actually recorded for the deleted game, got ${JSON.stringify(state.deletedGameIds)}`);

  // ============ Syncing pushes the tombstone, not just a shorter games list ============
  await page.goto(`${BASE}/index.html#/settings`);
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  assert(!stored.data.games.some((g) => g.id === scheduledGame.id), 'The deleted game was not pushed back up');
  assert(stored.data.deletedGameIds.some((t) => t.id === scheduledGame.id), `The push actually carried the tombstone, got ${JSON.stringify(stored.data.deletedGameIds)}`);

  // ============ A stale pull that still has the "deleted" game doesn't resurrect it locally ============
  // Simulates the other end of the wire being naive about tombstones (or
  // just a race) and handing back the old game anyway, with an updatedAt
  // from before the deletion.
  stored.data.games.push({ ...scheduledGame, updatedAt: tombstone.deletedAt - 1000 });
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!state.games.some((g) => g.id === scheduledGame.id), 'A stale pull of the deleted game does NOT resurrect it on this device');
  assert((state.deletedGameIds || []).some((t) => t.id === scheduledGame.id), 'The local tombstone survives a stale pull too');

  // ============ A genuine resurrection (updated AFTER the deletion) is accepted ============
  stored.data.games = stored.data.games.filter((g) => g.id !== scheduledGame.id);
  stored.data.games.push({ ...scheduledGame, status: 'completed', updatedAt: tombstone.deletedAt + 1000 });
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const resurrected = state.games.find((g) => g.id === scheduledGame.id);
  assert(resurrected && resurrected.status === 'completed', `A genuine post-deletion update is accepted rather than blocked forever, got ${JSON.stringify(resurrected)}`);
  assert(!(state.deletedGameIds || []).some((t) => t.id === scheduledGame.id), 'The now-stale local tombstone was cleared once the game legitimately came back');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC GAME-DELETION-PROPAGATES TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
