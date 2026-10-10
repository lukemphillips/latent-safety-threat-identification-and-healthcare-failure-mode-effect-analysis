// Reported: pinch-zooming on iOS Safari drags the bottom nav away from the
// edge of the screen, because `position: fixed` anchors to the LAYOUT
// viewport, not whatever's actually visible (the VISUAL viewport) once
// zoomed. main.js compensates with a transform computed from
// window.visualViewport, recalculated on its 'resize'/'scroll' events.
// window.visualViewport's own properties are read-only on a real browser,
// so this substitutes a controllable fake (installed before any page
// script runs, via addInitScript) to drive specific zoom/pan states and
// check the resulting transform — this is the only practical way to
// exercise that logic at all without an actual iOS device to pinch-zoom.
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

  await page.addInitScript(() => {
    class FakeVisualViewport extends EventTarget {
      constructor() {
        super();
        this.offsetLeft = 0;
        this.offsetTop = 0;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.scale = 1;
      }
    }
    Object.defineProperty(window, 'visualViewport', { value: new FakeVisualViewport(), configurable: true });
  });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(150);

  // ============ Baseline (no zoom): the compensation is a no-op ============
  const baseline = await page.$eval('#nav', (el) => el.style.transform);
  assert(baseline === 'translate(0px, 0px) scale(1)', `No zoom means no visible correction needed, got "${baseline}"`);

  // ============ Pinch-zoomed and panned: the nav gets pulled back to the visible area ============
  const innerHeight = await page.evaluate(() => window.innerHeight);
  await page.evaluate(() => {
    const vv = window.visualViewport;
    vv.offsetLeft = 12;
    vv.offsetTop = -150;
    vv.height = 400;
    vv.scale = 2;
    vv.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(50);
  const zoomedTransform = await page.$eval('#nav', (el) => el.style.transform);
  const expectedY = -150 + 400 - innerHeight;
  assert(zoomedTransform === `translate(12px, ${expectedY}px) scale(0.5)`, `Nav transform compensates for the zoomed/panned visual viewport, got "${zoomedTransform}", expected translate(12px, ${expectedY}px) scale(0.5)`);

  // ============ A 'scroll' event (panning while still zoomed) also re-pins it ============
  await page.evaluate(() => {
    const vv = window.visualViewport;
    vv.offsetTop = -50;
    vv.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(50);
  const pannedTransform = await page.$eval('#nav', (el) => el.style.transform);
  const expectedPannedY = -50 + 400 - innerHeight;
  assert(pannedTransform === `translate(12px, ${expectedPannedY}px) scale(0.5)`, `Nav re-pins on visualViewport's own 'scroll' event too (panning while zoomed), got "${pannedTransform}"`);

  // ============ Zooming back out returns to the no-op baseline ============
  await page.evaluate(() => {
    const vv = window.visualViewport;
    vv.offsetLeft = 0;
    vv.offsetTop = 0;
    vv.height = window.innerHeight;
    vv.scale = 1;
    vv.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(50);
  const backToBaseline = await page.$eval('#nav', (el) => el.style.transform);
  assert(backToBaseline === 'translate(0px, 0px) scale(1)', `Zooming back out returns the nav to its normal, uncorrected position, got "${backToBaseline}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL BOTTOM-NAV PINNED-ON-ZOOM TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
