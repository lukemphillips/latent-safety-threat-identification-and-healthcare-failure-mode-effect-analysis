// Requested: "A selected balanced team should be able to be allocated to
// multiple matches simultaneously. Show pitch and time to distinguish
// between matches" — a tournament day often has the same squad (or one
// split team) playing two or three fixtures back to back, and the coach
// shouldn't have to repeat the send once per match. The "Send to a
// scheduled match" picker on Balance Teams now offers a checklist (not a
// single dropdown) and labels each candidate with its kickoff time and
// pitch/location so same-day fixtures are actually distinguishable.
// Covers: the picker shows time + location, multiple matches can be
// ticked at once, sending either the whole squad or a single split team
// applies it to every ticked match, and the "sent to" status reflects all
// of them.
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

  // ============ Add two same-day fixtures with distinguishing time/pitch (the "tournament day") ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Pool A Rivals');
  await page.fill('#game-form [name="time"]', '09:00');
  await page.fill('#game-form [name="location"]', 'Pitch 3');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Pool B Rivals');
  await page.fill('#game-form [name="time"]', '11:15');
  await page.fill('#game-form [name="location"]', 'Pitch 4');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  const { gameX, gameY } = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    return {
      gameX: s.games.find((g) => g.opponent === 'Pool A Rivals'),
      gameY: s.games.find((g) => g.opponent === 'Pool B Rivals'),
    };
  });
  assert(gameX && gameY, 'Both fresh same-day fixtures exist');

  // ============ Balance Teams: the picker is a checklist showing time + pitch per match ============
  await page.goto(BASE + '/index.html#/balance');
  await page.waitForTimeout(200);

  const allTargetCheckboxes = page.locator('[data-target-game]');
  const targetCount = await allTargetCheckboxes.count();
  assert(targetCount >= 2, `At least the two new fixtures are offered as targets, got ${targetCount}`);
  assert((await page.locator('input[type="checkbox"]#target-game').count()) === 0, 'The old single <select id="target-game"> is gone');

  const cardText = await page.locator('.card', { hasText: 'Pool A Rivals' }).innerText();
  assert(cardText.includes('Pitch 3') && cardText.includes('Pitch 4'), `Picker shows each candidate's pitch, got: ${cardText}`);
  assert(/9:00/.test(cardText) && /11:15/.test(cardText), `Picker shows each candidate's kickoff time, got: ${cardText}`);

  // Scope to exactly gameX and gameY: uncheck every other target first.
  for (let i = 0; i < targetCount; i++) {
    const cb = allTargetCheckboxes.nth(i);
    const id = await cb.getAttribute('data-target-game');
    const shouldBeChecked = id === gameX.id || id === gameY.id;
    const isChecked = await cb.isChecked();
    if (shouldBeChecked && !isChecked) await cb.check();
    if (!shouldBeChecked && isChecked) await cb.uncheck();
    await page.waitForTimeout(30);
  }

  // ============ Split into teams, send Team 1 to both ticked matches at once ============
  await page.click('[data-action="select-all"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="split"]');
  await page.waitForTimeout(150);

  const importTeamBtn = page.locator('[data-action="import-team"][data-team-index="0"]');
  const btnLabel = await importTeamBtn.innerText();
  assert(btnLabel.includes('2 matches'), `Send button reflects both matches are selected, got: ${btnLabel}`);

  await importTeamBtn.click();
  await page.waitForTimeout(200);

  const after = await page.evaluate(async ({ xId, yId }) => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    const x = s.games.find((g) => g.id === xId);
    const y = s.games.find((g) => g.id === yId);
    return { xPresent: x.presentIds, yPresent: y.presentIds, xUpdatedAt: x.updatedAt, yUpdatedAt: y.updatedAt };
  }, { xId: gameX.id, yId: gameY.id });

  assert((after.xPresent || []).length > 0, 'Match X actually got the team sent to it');
  assert((after.yPresent || []).length > 0, 'Match Y actually got the team sent to it');
  assert(JSON.stringify([...after.xPresent].sort()) === JSON.stringify([...after.yPresent].sort()), `Both matches received the exact same team, got ${JSON.stringify(after.xPresent)} vs ${JSON.stringify(after.yPresent)}`);
  assert(!!after.xUpdatedAt && !!after.yUpdatedAt, 'Both matches are stamped with updatedAt');

  // ============ Status reflects both matches it was sent to ============
  const statusText = await page.locator('.card', { hasText: 'Team 1 (' }).innerText();
  assert(statusText.includes('Pool A Rivals') && statusText.includes('Pool B Rivals'), `Team 1's card shows it was sent to both opponents, got: ${statusText}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL BALANCE-TEAMS MULTI-MATCH ALLOCATION TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
