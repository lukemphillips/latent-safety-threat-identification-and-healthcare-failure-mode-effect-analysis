// Reported (twice): filling in the Add Game form on iOS left a blank gap
// at the bottom of the screen (the on-screen keyboard's/native picker's
// reserved space, stuck even though it was gone) that wouldn't clear until
// another field was focused and explicitly dismissed. The first fix only
// nudged window.scrollTo() on a text/number/textarea field losing focus —
// too narrow, since it missed the Time field's own native wheel picker,
// which reserves the exact same kind of space and left the gap (and the
// form's submit button) hidden below a blank screen. modal.js now nudges
// on ANY field (input/select/textarea) inside a modal losing focus, per
// the comment there — a genuine no-op when there's no gap to begin with,
// so no need to enumerate which input types can trigger it. The actual
// rendering glitch can only be seen on a real iOS device, so this just
// proves the nudge itself is correctly wired to fire at the right moment
// for every field type the Add Game form actually uses — not something
// that would be safe to claim fixes the bug outright without a device to
// confirm it against.
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

  // ============ The Time field itself losing focus also nudges — this is the exact field from the bug report ============
  // (previously missed: the fix only matched text/number/textarea, so the
  // Time field's own native wheel picker left the gap — and everything
  // below it, including the submit button — stuck.)
  await page.focus('#game-form [name="time"]');
  await page.evaluate(() => { window.__scrollToCalls = 0; }); // reset AFTER landing on time, so only its own blur below counts
  await page.focus('#game-form [name="location"]');
  await page.waitForTimeout(100);
  const callsAfterTimeBlur = await page.evaluate(() => window.__scrollToCalls);
  assert(callsAfterTimeBlur > 0, `The Time field losing focus inside a modal triggers the keyboard-gap nudge, got ${callsAfterTimeBlur} scrollTo call(s)`);

  // ============ A select field losing focus also nudges — same broadened fix covers it ============
  await page.focus('#game-form [name="squadFormat"]');
  await page.evaluate(() => { window.__scrollToCalls = 0; }); // reset AFTER landing on the select, so only its own blur below counts
  await page.focus('#game-form [name="location"]');
  await page.waitForTimeout(100);
  const callsAfterSelectBlur = await page.evaluate(() => window.__scrollToCalls);
  assert(callsAfterSelectBlur > 0, `A select field losing focus inside a modal triggers the keyboard-gap nudge, got ${callsAfterSelectBlur} scrollTo call(s)`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL MODAL IOS-KEYBOARD-GAP NUDGE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
