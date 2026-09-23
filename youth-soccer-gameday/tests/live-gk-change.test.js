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

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const scheduledGame = state.games.find((g) => g.status === 'scheduled');

  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}`);
  await page.waitForSelector('[data-action="start-game"]');
  await page.click('[data-action="start-game"]');
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/live`);
  await page.waitForTimeout(200);

  // Find an on-field OUTFIELD player (not the current GK) — this is who
  // we'll promote to goalkeeper. Before the fix, their old outfield pitch
  // slot kept pointing at them even after becoming keeper, so their name
  // rendered twice on the pitch at once.
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let freshGame = state.games.find((g) => g.id === scheduledGame.id);
  const outfieldPlayerId = freshGame.live.onField[0];
  const outfieldPlayer = state.players.find((p) => p.id === outfieldPlayerId);
  assert(outfieldPlayer, 'Picked an on-field outfield player to promote to GK');

  // Confirm they currently hold exactly one lineup slot (their outfield spot).
  const slotsBefore = Object.entries(freshGame.lineup.slots).filter(([, pid]) => pid === outfieldPlayerId);
  assert(slotsBefore.length === 1 && slotsBefore[0][0] !== 'gk', `Player starts in exactly one non-GK lineup slot, got ${JSON.stringify(slotsBefore)}`);

  // Change goalkeeper to this outfield player via the GK modal. This early
  // in the match the previous keeper's stint is under the minimum, so a
  // "Change anyway?" confirm may appear — handle it if it does.
  await page.click('[data-action="change-gk"]');
  await page.waitForSelector('#gk-form');
  await page.selectOption('#gk-form [name="gk"]', outfieldPlayerId);
  await page.click('#gk-form button[type="submit"]');
  await page.waitForTimeout(200);
  const confirmBtn = await page.$('[data-confirm-ok]');
  if (confirmBtn) {
    await confirmBtn.click();
    await page.waitForTimeout(200);
  }

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  freshGame = state.games.find((g) => g.id === scheduledGame.id);
  assert(freshGame.live.gkByPeriod[freshGame.live.currentPeriod] === outfieldPlayerId, 'New GK is recorded for the current period');
  assert(freshGame.lineup.slots.gk === outfieldPlayerId, 'New GK occupies the gk lineup slot');

  const slotsAfter = Object.entries(freshGame.lineup.slots).filter(([, pid]) => pid === outfieldPlayerId);
  assert(slotsAfter.length === 1, `New GK now occupies exactly ONE lineup slot (the gk slot), not their old outfield spot too — got ${JSON.stringify(slotsAfter)}`);
  assert(slotsAfter[0][0] === 'gk', 'That one slot is specifically the gk slot');

  // Visual check: their name should appear on the pitch exactly once.
  const pitchNameCount = await page.evaluate((name) => {
    const firstName = name.split(' ')[0];
    return Array.from(document.querySelectorAll('#live-pitch .slot-label')).filter((el) => el.textContent.trim() === firstName).length;
  }, outfieldPlayer.name);
  assert(pitchNameCount === 1, `New GK's name appears on the pitch exactly once (not duplicated in both goal and their old outfield spot), got ${pitchNameCount}`);

  assert(errors.length === 0, 'No console/page errors during GK-change duplicate testing: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL GK-CHANGE DUPLICATE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
