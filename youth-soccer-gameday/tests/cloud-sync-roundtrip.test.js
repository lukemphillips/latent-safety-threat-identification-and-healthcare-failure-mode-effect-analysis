const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Mimics the actual Apps Script's doGet/doPost (buildAppsScript in
// cloudSync.js) — a JSON blob stored server-side, gated by token role.
const FULL_EDIT_TOKEN = 'fulledittoken';
const MATCHDAY_TOKEN = 'matchdaytoken';
function roleForToken(token) {
  if (token === FULL_EDIT_TOKEN) return 'editor';
  if (token === MATCHDAY_TOKEN) return 'matchday';
  return null;
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
    const role = roleForToken(url.searchParams.get('token'));
    if (route.request().method() === 'GET') {
      route.fulfill({ json: { role, data: stored.data, meta: stored.meta } });
      return;
    }
    const posted = JSON.parse(route.request().postData());
    if (role === 'editor') {
      stored = { data: posted, meta: { updatedAt: new Date().toISOString() } };
    } else {
      const existingIds = new Set((stored.data?.players || []).map((p) => p.id));
      const newPlayers = (posted.players || []).filter((p) => !existingIds.has(p.id));
      stored = {
        data: { team: stored.data?.team, players: [...(stored.data?.players || []), ...newPlayers], games: posted.games },
        meta: { updatedAt: new Date().toISOString() },
      };
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
  assert(stored.data && stored.data.players.length > 0, 'Initial setup push reached the mock cloud');

  // ============ A local edit must survive a Sync Now, not get clobbered by its own pull ============
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const targetPlayer = state.players[0];

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click(`[data-action="edit-player"][data-id="${targetPlayer.id}"]`);
  await page.waitForSelector('[name="teamAllocation"]');
  await page.fill('[name="teamAllocation"]', '9.4');
  await page.click('#player-form button[type="submit"]');
  await page.waitForTimeout(150);

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);

  const cloudPlayer = stored.data.players.find((p) => p.id === targetPlayer.id);
  assert(cloudPlayer && cloudPlayer.teamAllocation === '9.4', `Edit made just before Sync Now reaches the cloud, got "${cloudPlayer && cloudPlayer.teamAllocation}"`);

  const localAfterSync = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const localPlayer = localAfterSync.players.find((p) => p.id === targetPlayer.id);
  assert(localPlayer.teamAllocation === '9.4', `Edit survives locally too after the sync's own pull step, got "${localPlayer.teamAllocation}"`);

  // ============ A fresh device joining picks up that edit ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const joinResult = await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    return mod.joinWithLink('https://fake-apps-script.example.com/exec?token=matchdaytoken', 'Coach B');
  });
  assert(joinResult.role === 'matchday', 'Second device joined with the Matchday role');

  const deviceBState = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const deviceBPlayer = deviceBState.players.find((p) => p.id === targetPlayer.id);
  assert(deviceBPlayer.teamAllocation === '9.4', `A newly-joined device sees the synced edit, got "${deviceBPlayer.teamAllocation}"`);

  // ============ With no local edit, a genuine cloud-side change from elsewhere still propagates ============
  stored.data.players = stored.data.players.map((p) => (p.id === targetPlayer.id ? { ...p, teamAllocation: '7.2' } : p));
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.syncNow();
  });
  const deviceBAfterExternalChange = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const propagated = deviceBAfterExternalChange.players.find((p) => p.id === targetPlayer.id);
  assert(propagated.teamAllocation === '7.2', `A change made elsewhere in the cloud still reaches a device with no conflicting local edit, got "${propagated.teamAllocation}"`);

  // ============ Deleting a player must survive its own Sync Now, same as an edit ============
  // Deletion is Full Edit-only in the UI, so reconnect this device as
  // editor (via the Full Edit link, not the original setup flow) before
  // trying it.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const editorJoin = await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    return mod.joinWithLink('https://fake-apps-script.example.com/exec?token=fulledittoken', 'Coach A');
  });
  assert(editorJoin.role === 'editor', 'Device reconnected with Full Edit access');

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click(`[data-action="edit-player"][data-id="${targetPlayer.id}"]`);
  await page.waitForSelector('[data-action="delete-player"]');
  await page.click('[data-action="delete-player"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);

  const localAfterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!localAfterDelete.players.some((p) => p.id === targetPlayer.id), 'Player is gone locally right after deleting');

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);

  assert(!stored.data.players.some((p) => p.id === targetPlayer.id), 'Deletion made just before Sync Now reaches the cloud (not resurrected by the pull)');

  const localAfterDeleteSync = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!localAfterDeleteSync.players.some((p) => p.id === targetPlayer.id), 'Player stays deleted locally too after the sync\'s own pull step');

  // ============ And a fresh device sees the deletion too ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=matchdaytoken', 'Coach B');
  });
  const deviceEState = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  assert(!deviceEState.players.some((p) => p.id === targetPlayer.id), 'A newly-joined device never sees the deleted player');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC ROUND-TRIP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
