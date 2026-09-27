const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Confirms End Game's automatic sync (runPostMatchBackup's syncSilently()
// call in liveGame.js) actually reaches the cloud on its own — no manual
// "Sync Now" tap — for a Matchday-role device. Uses two genuinely separate,
// persistent browser contexts (not the disconnect/rejoin pattern used
// elsewhere in this suite, which wholesale-adopts everything and wouldn't
// distinguish an automatic push from a manual one).
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
  let postCount = 0;
  async function mockRoute(route) {
    const url = new URL(route.request().url());
    const role = roleForToken(url.searchParams.get('token'));
    if (route.request().method() === 'GET') {
      route.fulfill({ json: { role, data: stored.data, meta: stored.meta } });
      return;
    }
    postCount += 1;
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

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.route('https://fake-apps-script.example.com/exec*', mockRoute);

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const errorsB = [];
  pageB.on('pageerror', (e) => errorsB.push(String(e)));
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

  // ============ Device B (Matchday): joins, sets squad, starts, plays ============
  await pageB.goto(BASE + '/index.html');
  await pageB.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=matchdaytoken', 'Coach B');
  });

  await pageB.goto(BASE + '/index.html#/balance');
  await pageB.waitForTimeout(200);
  await pageB.selectOption('#target-game', gameId);
  await pageB.waitForTimeout(100);
  await pageB.click('[data-action="import-squad"]');
  await pageB.waitForTimeout(150);

  await pageB.goto(BASE + `/index.html#/game/${gameId}/lineup`);
  await pageB.waitForTimeout(200);
  await pageB.click('[data-action="start-game"]');
  await pageB.waitForTimeout(300);

  await pageB.click('[data-action="log-goal-us"]');
  await pageB.waitForSelector('#goal-form');
  const scorerOptions = await pageB.$$eval('#goal-form [name="scorer"] option', (els) => els.map((e) => e.value).filter(Boolean));
  await pageB.selectOption('#goal-form [name="scorer"]', scorerOptions[0]);
  await pageB.click('#goal-form button[type="submit"]');
  await pageB.waitForTimeout(200);

  const postCountBeforeEnd = postCount;

  // ============ End the match — deliberately no manual Sync Now ============
  await pageB.click('[data-action="end-game"]');
  await pageB.waitForSelector('[data-confirm-ok]');
  await pageB.click('[data-confirm-ok]');
  // Only the automatic syncSilently() inside runPostMatchBackup
  // (liveGame.js) should fire from here — give that fire-and-forget async
  // call a moment to actually land before checking.
  await pageB.waitForTimeout(800);

  assert(postCount > postCountBeforeEnd, 'Ending the match automatically pushed to the cloud with no manual Sync Now tap');

  const cloudCopyAfterAuto = stored.data?.games?.find((g) => g.id === gameId);
  assert(cloudCopyAfterAuto?.status === 'completed', 'The cloud has the completed match purely from the automatic sync');
  assert(cloudCopyAfterAuto?.live?.scoreUs === 1, `The cloud copy carries the real score, got ${cloudCopyAfterAuto?.live?.scoreUs}`);

  const deviceBSyncConfig = await pageB.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    return mod.getSyncConfig();
  });
  const secondsSinceAutoSync = (Date.now() - new Date(deviceBSyncConfig.lastSyncedAt).getTime()) / 1000;
  assert(secondsSinceAutoSync < 10, `Device B's own "Last synced" display reflects the automatic sync as just having happened, got ${secondsSinceAutoSync.toFixed(1)}s ago`);

  // ============ Device A (Full Edit) picks it up on its own next Sync Now ============
  await pageA.goto(BASE + '/index.html#/settings');
  await pageA.waitForSelector('[data-action="cloud-sync-now"]');
  await pageA.click('[data-action="cloud-sync-now"]');
  await pageA.waitForTimeout(300);
  const deviceAFinal = await pageA.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.id === id);
  }, gameId);
  assert(deviceAFinal.status === 'completed', "Device A (Full Edit) sees the match as completed after Device B's fully automatic sync");
  assert(deviceAFinal.live?.scoreUs === 1, `Device A sees the correct score too, got ${deviceAFinal.live?.scoreUs}`);

  assert(errorsB.length === 0, 'No console/page errors on the Matchday device: ' + errorsB.join(', '));

  await browser.close();
  console.log('\nALL AUTO-SYNC-ON-END-GAME TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
