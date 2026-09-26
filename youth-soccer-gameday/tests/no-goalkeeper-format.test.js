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

  // 3-a-side is commonly played with no dedicated goalkeeper at all.
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Micro FC');
  await page.selectOption('#game-form [name="squadFormat"]', '3');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  const gameId = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.opponent === 'Micro FC').id;
  });

  // ============ Squad tab: no GK slot, no GK mention ============
  await page.goto(`${BASE}/index.html#/game/${gameId}/lineup`);
  await page.waitForTimeout(150);
  const slotCount = await page.$$eval('.pitch-slot', (els) => els.length);
  assert(slotCount === 3, `3-a-side pitch shows exactly 3 slots, no GK, got ${slotCount}`);
  const bannerText = await page.textContent('.banner.info');
  assert(bannerText.includes('no dedicated goalkeeper'), `Squad tab banner explains there's no GK spot, got "${bannerText}"`);

  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);
  const lineup = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    return { hasGkKey: 'gk' in g.lineup.slots, filledCount: Object.values(g.lineup.slots).filter(Boolean).length };
  }, gameId);
  assert(!lineup.hasGkKey, 'Lineup slots object has no "gk" key at all for this format');
  assert(lineup.filledCount === 3, `Auto-Fill placed all 3 outfield players, got ${lineup.filledCount}`);

  // ============ Starting the game: no "no goalkeeper" warning ============
  await page.goto(`${BASE}/index.html#/game/${gameId}`);
  await page.waitForTimeout(150);
  await page.click('[data-action="start-game"]');
  await page.waitForTimeout(200);
  const confirmCount = await page.locator('[data-confirm-ok]').count();
  assert(confirmCount === 0, `No "no goalkeeper set" confirm dialog on starting, got ${confirmCount}`);
  const gameStatus = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((x) => x.id === id).status;
  }, gameId);
  assert(gameStatus === 'live', `Game started cleanly, got status "${gameStatus}"`);

  // ============ Live view: no Goalkeeper card, no GK Save buttons ============
  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(200);
  const gkCardCount = await page.locator('text=Goalkeeper —').count();
  assert(gkCardCount === 0, `No Goalkeeper card in the live view, got ${gkCardCount}`);
  const gkSaveButtons = await page.locator('[data-action="log-save"]').count();
  assert(gkSaveButtons === 0, `No "GK Save" buttons anywhere, got ${gkSaveButtons}`);
  const onFieldTarget = await page.textContent('.section-title:has-text("On Field")');
  assert(onFieldTarget.includes('/ 3 target'), `On Field target reflects 3 outfield players, got "${onFieldTarget}"`);

  // ============ Advancing periods must not require picking a keeper ============
  const nextPeriodBtn = await page.$('[data-action="next-period"]');
  assert(!!nextPeriodBtn, 'A "Next: 2nd Half" button is available');
  await nextPeriodBtn.click();
  await page.waitForTimeout(150);
  const confirmDialogVisible = await page.locator('[data-confirm-ok]').count();
  assert(confirmDialogVisible === 1, `A plain confirm (not a keeper-picker form) appears when advancing periods, got ${confirmDialogVisible}`);
  const gkFormVisible = await page.locator('#gk-form').count();
  assert(gkFormVisible === 0, 'No goalkeeper-picker form is shown for this keeperless game');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);

  const afterAdvance = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    return { currentPeriod: g.live.currentPeriod, running: g.live.running };
  }, gameId);
  assert(afterAdvance.currentPeriod === 2, `Successfully advanced to period 2, got period ${afterAdvance.currentPeriod}`);
  assert(afterAdvance.running === false, 'Clock is paused after advancing to the new period');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL NO-GOALKEEPER FORMAT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
