const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Reported gap: a Full Edit coach had no way to tell another coach's
// device had actually synced with them — Settings only ever showed THIS
// device's own last-synced timestamp. The Apps Script already records who
// last pushed (writeStored_'s updatedBy, from buildAppsScript in
// cloudSync.js) and sends it back on every pull; the app just never read
// it. This mocks that same doGet/doPost shape and checks Settings now
// surfaces it.
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
      stored = { data: posted, meta: { updatedAt: new Date().toISOString(), updatedBy: posted.syncedByName || '' } };
    } else {
      const existingIds = new Set((stored.data?.players || []).map((p) => p.id));
      const newPlayers = (posted.players || []).filter((p) => !existingIds.has(p.id));
      stored = {
        data: { team: stored.data?.team, players: [...(stored.data?.players || []), ...newPlayers], games: posted.games },
        meta: { updatedAt: new Date().toISOString(), updatedBy: posted.syncedByName || '' },
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

  // ============ Coach A sets up Cloud Sync ============
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.setUpAsFullEditor('https://fake-apps-script.example.com/exec', 'Coach A', { fullEditToken: 'fulledittoken', matchdayToken: 'matchdaytoken' });
  });
  assert(stored.meta.updatedBy === 'Coach A', 'Mock cloud recorded Coach A as the pusher after setup');

  // ============ Coach B joins with the Matchday link ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=matchdaytoken', 'Coach B');
  });

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForTimeout(200);
  let sectionText = await page.textContent('.section-title:has-text("Cloud Sync") + .card, .card:has-text("Cloud Sync")');
  // Fall back to the whole page body if the card selector above doesn't
  // match this page's exact structure.
  if (!sectionText || !sectionText.includes('last updated')) {
    sectionText = await page.textContent('body');
  }
  assert(sectionText.includes('Shared data last updated by Coach A'), `Coach B's device shows the last pusher (Coach A) on join, got a page containing: ${sectionText.includes('Shared data last updated') ? sectionText.match(/Shared data last updated[^<]*/)[0] : '(no such text found)'}`);

  // ============ Coach B syncs (pushing their own name) ============
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);
  assert(stored.meta.updatedBy === 'Coach B', 'Mock cloud now shows Coach B as the last pusher');

  // ============ Coach A syncs again and sees Coach B's push ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=fulledittoken', 'Coach A');
  });
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForTimeout(200);
  const bodyText = await page.textContent('body');
  assert(bodyText.includes('Shared data last updated by Coach B'), `Coach A's device now sees Coach B synced, got: ${bodyText.match(/Shared data last updated[^<]*/) || '(no such text found)'}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC LAST-UPDATED-BY TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
