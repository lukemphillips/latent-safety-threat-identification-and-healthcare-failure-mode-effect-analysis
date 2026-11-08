// Reported bug: "I removed them but they reappeared" — a duplicate player
// (most often created by mistake via a Matchday coach's "+ Fill-In
// Player") kept coming back after being deleted. The real cross-device
// protection lives server-side (see
// cloud-sync-server-player-deletion.test.js), but the CLIENT side
// (applyCloudSync in store.js) has its own job: a deletion must actually
// get pushed as a tombstone (not just a shorter players list), and a pull
// that still hands back the deleted player (a stale/naive server, or just
// a race) must not resurrect it locally either. This mock server is
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
  const victim = state.players[0];

  // ============ Delete a player locally ============
  await page.goto(BASE + '/index.html#/roster');
  await page.click(`[data-id="${victim.id}"]`);
  await page.waitForSelector('[data-action="delete-player"]');
  await page.click('[data-action="delete-player"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!state.players.some((p) => p.id === victim.id), 'Player is gone locally right after deleting');
  const tombstone = (state.deletedPlayerIds || []).find((t) => t.id === victim.id);
  assert(tombstone, `A tombstone was actually recorded for the deleted player, got ${JSON.stringify(state.deletedPlayerIds)}`);

  // ============ Syncing pushes the tombstone, not just a shorter players list ============
  await page.goto(`${BASE}/index.html#/settings`);
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  assert(!stored.data.players.some((p) => p.id === victim.id), 'The deleted player was not pushed back up');
  assert(stored.data.deletedPlayerIds.some((t) => t.id === victim.id), `The push actually carried the tombstone, got ${JSON.stringify(stored.data.deletedPlayerIds)}`);

  // ============ THE REPORTED BUG, from the client side: a stale pull that still has the deleted player doesn't resurrect it ============
  // Simulates another device (e.g. the Matchday one that created a
  // duplicate) still carrying the old copy and it ending up back on the
  // wire — exactly what "I removed them but they reappeared" looked like.
  stored.data.players.push(victim);
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!state.players.some((p) => p.id === victim.id), 'A stale pull of the deleted player does NOT resurrect it on this device');
  assert((state.deletedPlayerIds || []).some((t) => t.id === victim.id), 'The local tombstone survives a stale pull too');

  // ============ A genuinely new fill-in player (never tombstoned) still comes through normally ============
  stored.data.players.push({ id: 'brand-new-fill-in', name: 'Jamie Borrowed', active: true, isGuest: false });
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(state.players.some((p) => p.id === 'brand-new-fill-in'), 'A genuinely new player is still adopted normally alongside the tombstone logic');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC PLAYER-DELETION-PROPAGATES TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
