const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Every sync pulls the exact same "?token=..." link — precisely the shape
// a browser's HTTP cache (or a proxy in between, common on mobile data)
// heuristically caches a plain GET for, since the Apps Script response
// carries no explicit Cache-Control header. A device stuck reading a
// cached pull would show every sync as "successful" while never actually
// seeing anyone else's changes — indistinguishable from Cloud Sync being
// broken. This checks pullFromCloud (cloudSync.js) never issues the exact
// same request twice: the fetch's own cache mode is bypassed, and each
// call carries a distinct cache-busting query param.
const FULL_EDIT_TOKEN = 'fulledittoken';

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const seenUrls = [];
  await page.route('https://fake-apps-script.example.com/exec*', async (route) => {
    const req = route.request();
    seenUrls.push(req.url());
    if (req.method() === 'GET') {
      route.fulfill({ json: { role: 'editor', data: { team: { name: 'Test FC' }, players: [], games: [] }, meta: null } });
      return;
    }
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
    return mod.pullFromCloud('https://fake-apps-script.example.com/exec?token=fulledittoken');
  });
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    return mod.pullFromCloud('https://fake-apps-script.example.com/exec?token=fulledittoken');
  });

  const getUrls = seenUrls.filter((u) => u.includes('token=' + FULL_EDIT_TOKEN));
  assert(getUrls.length === 2, `Two pulls actually reached the mock, got ${getUrls.length}`);
  assert(getUrls[0] !== getUrls[1], `Two pulls to the same link are never the literally identical URL (cache-busting param differs), got ${JSON.stringify(getUrls)}`);
  assert(/[?&]_ts=\d+/.test(getUrls[0]) && /[?&]_ts=\d+/.test(getUrls[1]), 'Each pull carries a cache-busting timestamp param');
  assert(getUrls[0].startsWith('https://fake-apps-script.example.com/exec?token=fulledittoken'), 'The original token/URL is preserved, just with the extra param appended');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC PULL CACHE-BUSTING TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
