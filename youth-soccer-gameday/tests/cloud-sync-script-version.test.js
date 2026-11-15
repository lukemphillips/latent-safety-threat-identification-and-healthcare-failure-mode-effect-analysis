// Cloud Sync's Apps Script has no way to auto-update itself — any
// merge-logic fix only takes effect once a coach re-pastes it and
// redeploys (see cloud-sync-server-weekly-award-merge.test.js and
// cloud-sync-weekly-award-roundtrip.test.js for the bug this most
// recently mattered for). Before this, the only way to find out a fix
// existed was to notice the "Update Script" button buried in Settings'
// "More options" — easy to never see. This covers the banner that's
// supposed to surface it instead: every sync response now echoes
// scriptVersion (whatever code the Apps Script is actually running,
// not anything about the stored data), and Settings shows a "your
// script needs updating" banner whenever this device's most recently
// known value is behind what the app expects (see cloudSync.js's
// CLOUD_SYNC_SCRIPT_VERSION / isScriptOutdated).
const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

// Navigating straight to the URL the page is already sitting on is a
// no-op (no hashchange fires, so Settings never re-renders) — hopping
// through a different route first forces a real re-render, same as a
// coach actually navigating there would.
async function gotoSettings(page, base) {
  await page.goto(base + '/index.html#/');
  await page.goto(base + '/index.html#/settings');
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Starts as if a pre-existing deployment that predates scriptVersion
  // entirely — real old scripts simply never had this field in their
  // response at all, which is exactly what omitting it here simulates.
  let stored = { data: null, meta: null };
  let serverScriptVersion = null;
  await page.route('https://fake-apps-script.example.com/exec*', async (route) => {
    const url = new URL(route.request().url());
    const role = url.searchParams.get('token') === 'fulledittoken' ? 'editor' : 'matchday';
    if (route.request().method() === 'GET') {
      const body = { role, data: stored.data, meta: stored.meta };
      if (serverScriptVersion != null) body.scriptVersion = serverScriptVersion;
      route.fulfill({ json: body });
      return;
    }
    const posted = JSON.parse(route.request().postData());
    stored = { data: { ...posted }, meta: { updatedAt: new Date().toISOString() } };
    const body = { ok: true, role };
    if (serverScriptVersion != null) body.scriptVersion = serverScriptVersion;
    route.fulfill({ json: body });
  });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  // ============ Setting up against an old script (no scriptVersion at all) ============
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.setUpAsFullEditor('https://fake-apps-script.example.com/exec', 'Coach A', { fullEditToken: 'fulledittoken', matchdayToken: 'matchdaytoken' });
  });

  await gotoSettings(page, BASE);
  await page.waitForTimeout(150);
  assert((await page.locator('text=A Cloud Sync bug fix is available').count()) === 1, 'Banner shows right after setting up against a script old enough to never report its own version');

  // ============ The server script gets updated (now reports the current version) and this device syncs ============
  const currentVersion = await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    return mod.CLOUD_SYNC_SCRIPT_VERSION;
  });
  serverScriptVersion = currentVersion;

  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);
  await gotoSettings(page, BASE);
  await page.waitForTimeout(150);
  assert((await page.locator('text=A Cloud Sync bug fix is available').count()) === 0, 'Banner clears once a sync confirms the script has actually been updated');

  // ============ A genuinely older server version (someone redeployed an in-between build) still flags it ============
  serverScriptVersion = Math.max(0, currentVersion - 1);
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(500);
  await gotoSettings(page, BASE);
  await page.waitForTimeout(150);
  assert((await page.locator('text=A Cloud Sync bug fix is available').count()) === 1, 'Banner comes back if a later sync reports an older script version than before');

  // ============ A Matchday device never sees this banner — it has no access to Update Script anyway ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  serverScriptVersion = null;
  await page.evaluate(async () => {
    const mod = await import('/js/cloudSync.js');
    await mod.joinWithLink('https://fake-apps-script.example.com/exec?token=matchdaytoken', 'Coach B');
  });
  await gotoSettings(page, BASE);
  await page.waitForTimeout(150);
  assert((await page.locator('text=A Cloud Sync bug fix is available').count()) === 0, 'A Matchday device never shows the banner, outdated script or not — it can\'t act on it anyway');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC SCRIPT-VERSION TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
