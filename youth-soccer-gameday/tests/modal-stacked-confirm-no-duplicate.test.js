// Found while testing a different feature (the Fill-In Player dupe-name/
// dupe-jersey checks, which open a confirmDialog from INSIDE another
// modal's own submit handler — the same pattern roster.js's "Add Player"
// form already uses for its own dupe-jersey check): opening a new modal
// while a previous one is still mid-close could briefly leave TWO
// <dialog id="ysg-modal"> elements in the DOM at once, since the old one
// was only removed by its native 'close' event listener — which fires at
// SOME point after .close() is called, not necessarily before openModal's
// own synchronous code (closeModal(); create+append the new dialog...)
// finishes running. Flaky roughly 1 in 3 runs before the fix (openModal
// now also removes any existing #ysg-modal synchronously, not just
// relying on the event). Covers the exact repro: a modal whose own submit
// handler immediately opens a confirmDialog, repeated enough times that
// the old race would have shown up well before chance alone could explain
// a clean run.
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

  // Roster's own "Add Player" form opens a confirmDialog from inside its
  // own submit handler the moment a duplicate jersey number is detected —
  // the exact shape that exposed the race. Repeated several times in a
  // row (each one a fresh dupe against the player added the time before)
  // since the race was never on literally every single attempt.
  await page.goto(BASE + '/index.html#/roster');

  for (let i = 0; i < 5; i++) {
    await page.click('[data-action="add-player"]');
    await page.waitForSelector('#player-form');
    await page.fill('#player-form [name="name"]', `Dupe Test Player ${i}`);
    await page.fill('#player-form [name="jerseyNumber"]', '1'); // #1 is always taken on the seeded roster
    await page.click('#player-form button[type="submit"]');

    // The real bug: right after this click, there can be TWO #ysg-modal
    // dialogs in the DOM for a moment — one still the "Add Player" form,
    // one the new confirm. A plain getElementById/querySelector('#ysg-modal')
    // would then ambiguously see either, and Playwright's own locator
    // throws outright on more than one match ("strict mode violation").
    await page.waitForSelector('[data-confirm-ok]');
    const modalCount = await page.locator('dialog#ysg-modal').count();
    assert(modalCount === 1, `Exactly one modal dialog exists after opening a confirm from inside another modal (attempt ${i}), got ${modalCount}`);

    const bodyText = await page.locator('.modal-body').innerText();
    assert(bodyText.includes('already wears #1'), `The confirm shown is actually the dupe-jersey one, not a stale leftover, got: ${bodyText}`);

    await page.click('[data-confirm-cancel]');
    await page.waitForTimeout(50);
  }

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL MODAL STACKED-CONFIRM NO-DUPLICATE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
