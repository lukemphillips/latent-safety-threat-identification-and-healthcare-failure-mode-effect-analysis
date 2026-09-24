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

  // A saved Cloud Sync config makes the app auto-sync on load — mock the
  // endpoint so that's a harmless no-op instead of a real (here, always
  // failing) network request each of the reloads below triggers.
  await page.route('https://fake-apps-script.example.com/exec*', (route) => {
    route.fulfill({ json: { role: 'editor', data: null, meta: null } });
  });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  // A device that connected as Editor via a shared link (not the device
  // that originally ran Set Up Cloud Sync) never learns both tokens, so
  // it structurally can't rebuild the Matchday share link — same shape
  // of config joinWithLink actually produces, without needing a live
  // Apps Script backend for this check.
  await page.evaluate(() => {
    localStorage.setItem('ysg-cloud-sync-v1', JSON.stringify({
      url: 'https://fake-apps-script.example.com/exec?token=fulledittoken',
      role: 'editor',
      coachName: 'Assistant Coach',
      lastSyncedAt: new Date().toISOString(),
    }));
  });
  await page.reload();
  await page.waitForSelector('[data-action="cloud-sync-now"]');

  assert(!(await page.$('[data-action="cloud-sync-show-links"]')), '"Show Share Links" is hidden on a device that cannot rebuild the links (not a dead button)');
  const bodyText = await page.textContent('#app');
  assert(bodyText.includes('Share links can only be shown again on the device that originally ran'), 'Explains why the button is missing here');

  // The device that DID run Set Up Cloud Sync (has baseUrl + both
  // tokens stored) still gets a working button.
  await page.evaluate(() => {
    localStorage.setItem('ysg-cloud-sync-v1', JSON.stringify({
      url: 'https://fake-apps-script.example.com/exec?token=fulledittoken',
      role: 'editor',
      coachName: 'Head Coach',
      baseUrl: 'https://fake-apps-script.example.com/exec',
      fullEditToken: 'fulledittoken',
      matchdayToken: 'matchdaytoken',
      lastSyncedAt: new Date().toISOString(),
    }));
  });
  await page.reload();
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  const showLinksBtn = await page.$('[data-action="cloud-sync-show-links"]');
  assert(!!showLinksBtn, '"Show Share Links" is shown on the device that actually set Cloud Sync up');

  await showLinksBtn.click();
  await page.waitForSelector('#matchday-link-text');
  const matchdayLinkValue = await page.inputValue('#matchday-link-text');
  const fullEditLinkValue = await page.inputValue('#full-edit-link-text');
  assert(matchdayLinkValue.includes('token=matchdaytoken'), `Matchday link is rebuilt correctly, got "${matchdayLinkValue}"`);
  assert(fullEditLinkValue.includes('token=fulledittoken'), `Full Edit link is rebuilt correctly, got "${fullEditLinkValue}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL CLOUD SYNC SHOW-LINKS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
