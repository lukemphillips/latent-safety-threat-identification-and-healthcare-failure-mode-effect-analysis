// Reported: filling in the Add Game form on iOS left a blank gap at the
// bottom of the screen (the on-screen keyboard's reserved space, stuck
// even though the keyboard itself was gone) that wouldn't clear until a
// second text field was focused and explicitly dismissed. modal.js now
// nudges window.scrollTo() whenever a text/number/textarea field inside
// any modal loses focus, which is the standard workaround for this class
// of iOS Safari bug. The actual rendering glitch can only be seen on a
// real iOS device, so this just proves the nudge itself is correctly
// wired to fire at the right moment (a text field losing focus within a
// modal) — not something that would be safe to claim fixes the bug
// outright without a device to confirm it against.
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
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    window.__scrollToCalls = 0;
    window.scrollTo = () => { window.__scrollToCalls += 1; };
  });

  // ============ Focusing out of a text field inside a modal nudges a scroll ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form [name="opponent"]');
  await page.focus('#game-form [name="opponent"]');
  await page.fill('#game-form [name="opponent"]', 'Nudge Test FC');
  // Moving to the native date input is exactly the real-world sequence
  // the bug report described (text field -> date picker).
  await page.focus('#game-form [name="date"]');
  await page.waitForTimeout(100);

  const callsAfterTextBlur = await page.evaluate(() => window.__scrollToCalls);
  assert(callsAfterTextBlur > 0, `A text field losing focus inside a modal triggers the keyboard-gap nudge, got ${callsAfterTextBlur} scrollTo call(s)`);

  // ============ Focusing out of a non-text control (the date field itself) does NOT also nudge ============
  // (only a genuine software-keyboard field should trigger this — nudging
  // on every focus change in the app would be needless extra work.)
  await page.evaluate(() => { window.__scrollToCalls = 0; });
  await page.focus('#game-form [name="location"]');
  await page.waitForTimeout(100);
  const callsAfterDateBlur = await page.evaluate(() => window.__scrollToCalls);
  assert(callsAfterDateBlur === 0, `A non-text field (date) losing focus does not itself trigger the nudge, got ${callsAfterDateBlur} scrollTo call(s)`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL MODAL IOS-KEYBOARD-GAP NUDGE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
