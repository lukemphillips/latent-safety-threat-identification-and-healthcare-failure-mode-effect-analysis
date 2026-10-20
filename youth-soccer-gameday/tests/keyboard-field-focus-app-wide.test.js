// Two related on-screen-keyboard fixes, generalized from "inside a modal
// only" to the whole app:
//
// 1. The iOS keyboard-gap nudge (modal-ios-keyboard-gap-nudge.test.js)
// used to be wired per <dialog> in modal.js. The exact same iOS Safari
// quirk — a blank gap left at the bottom of the screen after a field's
// keyboard/native picker closes — can happen on ANY field anywhere, not
// just inside a modal: e.g. Settings' Team form (a plain inline <form>,
// not a modal) or its Archive date picker. Both are now handled once, in
// main.js, via a document-level focusout listener instead of modal.js's
// own per-dialog one.
//
// 2. New: "snap to box" — focusing a field now scrolls it into view after
// a short delay (letting the keyboard's own resize/animation finish
// first), so a field doesn't end up hidden behind the keyboard once it's
// open. Checkboxes/radios are excluded since they don't bring up a
// keyboard.
//
// Covers: the gap nudge firing for a field OUTSIDE any modal, and the new
// scroll-into-view firing on focus for a text field, both inside and
// outside a modal, but NOT for a checkbox.
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
    window.__scrollIntoViewCalls = [];
    Element.prototype.scrollIntoView = function (opts) { window.__scrollIntoViewCalls.push({ tag: this.tagName, name: this.name, opts }); };
  });

  // ============ The keyboard-gap nudge now also fires OUTSIDE any modal (Settings' inline Team form) ============
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('#team-form');
  assert((await page.locator('dialog#ysg-modal').count()) === 0, 'Sanity check: the Team form really is not inside a modal');
  await page.focus('#team-form [name="name"]');
  await page.evaluate(() => { window.__scrollToCalls = 0; });
  await page.focus('#team-form [name="ageGroup"]');
  await page.waitForTimeout(100);
  const callsOutsideModal = await page.evaluate(() => window.__scrollToCalls);
  assert(callsOutsideModal > 0, `A field losing focus OUTSIDE any modal still triggers the keyboard-gap nudge, got ${callsOutsideModal} scrollTo call(s)`);

  // ============ "Snap to box": focusing a text field scrolls it into view, outside a modal ============
  await page.evaluate(() => { window.__scrollIntoViewCalls = []; });
  await page.focus('#team-form [name="ageGroup"]');
  await page.waitForTimeout(400);
  let calls = await page.evaluate(() => window.__scrollIntoViewCalls);
  assert(calls.some((c) => c.name === 'ageGroup'), `Focusing a text field outside a modal scrolls it into view, got: ${JSON.stringify(calls)}`);
  assert(calls.every((c) => c.opts && c.opts.block === 'center'), `scrollIntoView is called with block:"center", got: ${JSON.stringify(calls)}`);

  // ============ Checkboxes are excluded — a plain tap shouldn't cause a scroll jump ============
  await page.evaluate(() => { window.__scrollIntoViewCalls = []; });
  await page.focus('#team-form [name="enableCards"]');
  await page.waitForTimeout(400);
  calls = await page.evaluate(() => window.__scrollIntoViewCalls);
  assert(!calls.some((c) => c.name === 'enableCards'), `Focusing a checkbox does NOT trigger the scroll-into-view, got: ${JSON.stringify(calls)}`);

  // ============ "Snap to box" also works for a field INSIDE a modal ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form [name="opponent"]');
  await page.evaluate(() => { window.__scrollIntoViewCalls = []; });
  await page.focus('#game-form [name="opponent"]');
  await page.waitForTimeout(400);
  calls = await page.evaluate(() => window.__scrollIntoViewCalls);
  assert(calls.some((c) => c.name === 'opponent'), `Focusing a text field inside a modal also scrolls it into view, got: ${JSON.stringify(calls)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL KEYBOARD-FIELD-FOCUS APP-WIDE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
