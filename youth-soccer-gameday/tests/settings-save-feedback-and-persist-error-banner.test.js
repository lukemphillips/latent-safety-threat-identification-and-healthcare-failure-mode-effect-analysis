// Coverage for two small trust/feedback fixes:
//   1. "Save Team Settings" (both the top shortcut button and the real
//      submit button) now flashes a visible "✓ Saved" confirmation —
//      previously it saved silently, leaving a coach to wonder if a typed
//      change actually stuck.
//   2. A localStorage write failure (full storage, a blocked/private
//      browser) now surfaces a dismissible banner outside #app instead of
//      failing silently behind a console.warn — see store.js's
//      onPersistFailure.
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

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ============ 1. Save Team Settings gives visible confirmation ============
  await page.goto(BASE + '/index.html#/settings');
  assert(!!(await page.$('#save-error-banner-wrap[hidden]')), 'Save-error banner starts hidden when saves are working');

  await page.fill('input[name="name"]', 'Feedback FC');
  await page.click('#team-form button[type="submit"]');
  await page.waitForFunction(() => {
    const btn = document.querySelector('#team-form button[type="submit"]');
    return !!btn && btn.textContent.includes('Saved');
  });
  assert(true, 'Submit button flashes "✓ Saved" right after saving');
  await page.waitForFunction(() => {
    const btn = document.querySelector('#team-form button[type="submit"]');
    return !!btn && btn.textContent.trim() === 'Save Team Settings';
  }, { timeout: 3000 });
  assert(true, 'Submit button reverts to its normal label shortly after');

  // The top shortcut button (added so a coach doesn't have to scroll past
  // the rest of the form) triggers the same submit handler and gets the
  // same confirmation.
  await page.click('[data-action="save-team-top"]');
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-action="save-team-top"]');
    return !!btn && btn.textContent.includes('Saved');
  });
  assert(true, 'Top "Save Team Settings" shortcut also flashes "✓ Saved"');

  // ============ 2. A save failure shows a visible, dismissible banner ============
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.__origSetItem = orig;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ysg-data-v2') throw new Error('simulated storage failure');
      return orig.call(this, key, value);
    };
  });

  await page.fill('input[name="name"]', 'Will Not Save FC');
  await page.click('#team-form button[type="submit"]');
  await page.waitForSelector('#save-error-banner-wrap:not([hidden])');
  const bannerText = await page.textContent('#save-error-banner-wrap');
  assert(bannerText.includes("aren't saving"), `Banner explains the problem, got "${bannerText}"`);

  // Dismissing hides it even while saves are still failing.
  await page.click('#save-error-dismiss-btn');
  assert(!!(await page.$('#save-error-banner-wrap[hidden]')), 'Dismiss hides the banner');
  await page.fill('input[name="name"]', 'Still Not Saving FC');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(150);
  assert(!!(await page.$('#save-error-banner-wrap[hidden]')), 'Banner stays hidden on a repeat failure right after being dismissed (no nagging on every single save)');

  // Restore normal saving — banner should clear, and dismissal resets so a
  // FUTURE failure (not just the one just dismissed) shows it again.
  await page.evaluate(() => { Storage.prototype.setItem = window.__origSetItem; });
  await page.fill('input[name="name"]', 'Saving Again FC');
  await page.click('#team-form button[type="submit"]');
  // [hidden] means display:none, so waitForSelector's default "visible"
  // wait state can never match it — poll the property directly instead.
  await page.waitForFunction(() => document.getElementById('save-error-banner-wrap').hidden === true);
  assert(true, 'Banner clears once saving works again');

  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ysg-data-v2') throw new Error('simulated storage failure');
      return orig.call(this, key, value);
    };
  });
  await page.fill('input[name="name"]', 'Failing Again FC');
  await page.click('#team-form button[type="submit"]');
  await page.waitForSelector('#save-error-banner-wrap:not([hidden])');
  assert(true, 'Banner reappears on a fresh failure after a prior dismiss + recovery');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SETTINGS SAVE-FEEDBACK TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
