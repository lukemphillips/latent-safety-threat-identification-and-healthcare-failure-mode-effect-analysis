const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Reported bug: "other coaches' matches don't seem to be syncing." Root
// cause was sendSquadToMatch (balanceTeams.js) never stamping updatedAt on
// the game it just filled in. For a still-scheduled game, presentIds/lineup
// are invisible to gameCompleteness (store.js) — it only looks at status
// and live event count — so updatedAt was the ONLY thing Cloud Sync's merge
// (gameIsNewer) had to tell a real squad assignment apart from another
// coach's stale, untouched copy of the same game. Without it, the merge
// tie always went to "keep what's already here," so the assignment never
// actually reached a second device.
//
// This needs two genuinely separate, persistent devices (real browser
// contexts, each with its own localStorage, neither ever cleared) rather
// than the disconnect/rejoin pattern used elsewhere in this suite — a
// fresh join wholesale-adopts everything and would never exercise the
// merge tie-break this bug lived in.
const FULL_EDIT_TOKEN = 'fulledittoken';
const MATCHDAY_TOKEN = 'matchdaytoken';
function roleForToken(token) {
  if (token === FULL_EDIT_TOKEN) return 'editor';
  if (token === MATCHDAY_TOKEN) return 'matchday';
  return null;
}

(async () => {
  const browser = await launch();

  let stored = { data: null, meta: null };
  async function mockRoute(route) {
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
  }

  const errors = [];
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  pageA.on('pageerror', (e) => errors.push('A: ' + e));
  await pageA.route('https://fake-apps-script.example.com/exec*', mockRoute);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  pageB.on('pageerror', (e) => errors.push('B: ' + e));
  await pageB.route('https://fake-apps-script.example.com/exec*', mockRoute);

  // ============ Device A (Full Edit): schedule a game, sync it up ============
  await pageA.goto(BASE + '/index.html');
  await pageA.goto(BASE + '/index.html#/settings');
  await pageA.click('text=Reload Sample Data');
  await pageA.waitForSelector('[data-confirm-ok]');
  await pageA.click('[data-confirm-ok]');
  await pageA.waitForTimeout(200);

  await pageA.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.setUpAsFullEditor('https://fake-apps-script.example.com/exec', 'Coach A', { fullEditToken: 'fulledittoken', matchdayToken: 'matchdaytoken' });
  });

  await pageA.goto(BASE + '/index.html#/schedule');
  await pageA.waitForTimeout(150);
  await pageA.click('[data-action="add-game"]');
  await pageA.waitForSelector('#game-form');
  await pageA.fill('[name="opponent"]', 'Riverside Rovers');
  await pageA.click('#game-form button[type="submit"]');
  await pageA.waitForTimeout(150);

  await pageA.goto(BASE + '/index.html#/settings');
  await pageA.waitForSelector('[data-action="cloud-sync-now"]');
  await pageA.click('[data-action="cloud-sync-now"]');
  await pageA.waitForTimeout(300);

  const gameId = stored.data.games.find((g) => g.opponent === 'Riverside Rovers').id;
  assert((stored.data.games.find((g) => g.id === gameId).presentIds || []).length === 0, 'Game reaches the cloud with no one marked present yet');

  // ============ Device B (Matchday): joins fresh, gets that same scheduled game ============
  await pageB.goto(BASE + '/index.html');
  await pageB.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=matchdaytoken', 'Coach B');
  });
  const deviceBBefore = await pageB.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id);
  }, gameId);
  assert((deviceBBefore.presentIds || []).length === 0, "Device B's own copy starts with an empty squad too");

  // ============ Back on Device A (same session, never reloaded): Balance Teams sets the squad ============
  await pageA.goto(BASE + '/index.html#/balance');
  await pageA.waitForTimeout(200);
  await pageA.selectOption('#target-game', gameId);
  await pageA.waitForTimeout(100);
  await pageA.click('[data-action="import-squad"]');
  await pageA.waitForTimeout(150);

  const deviceAAfterImport = await pageA.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id);
  }, gameId);
  assert((deviceAAfterImport.presentIds || []).length > 0, 'Device A actually set presentIds locally via Balance Teams');
  assert(!!deviceAAfterImport.updatedAt, 'sendSquadToMatch stamps updatedAt on the game it just filled in');

  await pageA.goto(BASE + '/index.html#/settings');
  await pageA.waitForSelector('[data-action="cloud-sync-now"]');
  await pageA.click('[data-action="cloud-sync-now"]');
  await pageA.waitForTimeout(300);
  assert((stored.data.games.find((g) => g.id === gameId).presentIds || []).length > 0, "Device A's squad assignment reaches the cloud");

  // ============ Device B (SAME session, never cleared) does a normal Sync Now ============
  await pageB.goto(BASE + '/index.html#/settings');
  await pageB.waitForSelector('[data-action="cloud-sync-now"]');
  await pageB.click('[data-action="cloud-sync-now"]');
  await pageB.waitForTimeout(300);
  const deviceBAfter = await pageB.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id);
  }, gameId);
  assert((deviceBAfter.presentIds || []).length === (deviceAAfterImport.presentIds || []).length, `Device B receives Device A's squad assignment via a normal incremental Sync Now, got ${(deviceBAfter.presentIds || []).length} of ${(deviceAAfterImport.presentIds || []).length}`);
  assert(JSON.stringify([...deviceBAfter.presentIds].sort()) === JSON.stringify([...deviceAAfterImport.presentIds].sort()), 'The exact same players are marked present on both devices');
  assert(!!deviceBAfter.lineup?.slots && Object.keys(deviceBAfter.lineup.slots).length > 0, "Device B also receives the auto-filled lineup, not just presentIds");

  assert(errors.length === 0, 'No page errors on either device: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC SQUAD-ASSIGNMENT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
