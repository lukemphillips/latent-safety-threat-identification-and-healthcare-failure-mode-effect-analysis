// Reported: "Changing squad size in match doesn't allow a player to be
// removed." Shrinking to a size smaller than how many were already on the
// pitch used to just leave the extra player(s) on with no mapped pitch
// position, and the coach had to separately sub or bench someone
// afterward to actually make room. The Change Formation modal now asks
// right there who should come off — exactly enough to fit the new size —
// and actually takes them off the pitch (back to the bench, not sent off,
// so they can still come back on normally). Covers: the picker only
// appears when shrinking actually overflows the new size, requires
// picking exactly the right number before Apply is enabled, actually
// removes the chosen player(s) from the pitch/lineup, and leaves the rest
// correctly remapped into the smaller formation with no overflow left.
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

  // A live 9-a-side match, pitch exactly full (8 outfield + 1 GK).
  const gameId = await page.evaluate(() => {
    const players = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, name: `Player ${i}`, jerseyNumber: i + 1, positions: ['MID'], active: true,
    }));
    const onField = players.slice(0, 8).map((p) => p.id);
    const gk = players[8].id;
    const game = {
      id: 'g1',
      opponent: 'Shrink FC',
      date: '2026-09-01',
      time: '10:00',
      isHome: true,
      status: 'live',
      squadFormat: null,
      periodMinutes: 25,
      numPeriods: 2,
      presentIds: players.map((p) => p.id),
      formationId: null,
      lineup: { slots: { gk, d1: onField[0], d2: onField[1], d3: onField[2], m1: onField[3], m2: onField[4], m3: onField[5], f1: onField[6], f2: onField[7] } },
      rsvps: {},
      live: {
        running: false,
        elapsedSeconds: 600,
        currentPeriod: 1,
        periodStartElapsed: { 1: 0 },
        scoreUs: 0,
        scoreThem: 0,
        onField,
        gkByPeriod: { 1: gk },
        sentOff: [],
        stintStart: Object.fromEntries([...onField, gk].map((id) => [id, 0])),
        playingTime: Object.fromEntries([...onField, gk].map((id) => [id, 600])),
        subLog: [],
      },
    };
    const data = {
      team: { name: 'Shrink Test FC', squadFormat: 9, periodMinutes: 25, numPeriods: 2, rules: [], weeklyAwards: [] },
      players,
      games: [game],
      trainings: [],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(data));
    return 'g1';
  });
  await page.reload();
  await page.goto(`${BASE}/index.html#/game/${gameId}/live`);
  await page.waitForTimeout(200);

  // ============ Shrinking from 9 to 6-a-side: 9 on the pitch, only 6 fit — picker should offer removing 3 ============
  await page.click('[data-action="change-formation"]');
  await page.waitForSelector('#formation-form');
  assert(await page.locator('[data-remove-field]').isHidden(), 'No removal picker yet — still on the current (fitting) size');

  await page.selectOption('#formation-form [name="squadFormat"]', '6');
  await page.waitForTimeout(100);
  assert(await page.locator('[data-remove-field]').isVisible(), 'Shrinking below the current headcount reveals the removal picker');
  const removeHint = await page.locator('[data-remove-hint]').innerText();
  assert(removeHint.includes('pick exactly 3'), `Hint names exactly how many need to come off (9 on pitch - 6 slots = 3), got: ${removeHint}`);
  const removeCheckboxes = page.locator('[data-remove-list] input[type="checkbox"]');
  assert((await removeCheckboxes.count()) === 9, `Every player currently on the pitch (8 outfield + 1 GK) is offered as a removal candidate, got ${await removeCheckboxes.count()}`);

  const submitBtn = page.locator('#formation-form button[type="submit"]');
  assert(await submitBtn.isDisabled(), 'Apply is disabled until the right number are picked');

  // Pick just 1 — still not enough.
  await removeCheckboxes.nth(0).check();
  await page.waitForTimeout(50);
  assert(await submitBtn.isDisabled(), 'Still disabled after picking only 1 of the required 3');

  // Pick 2 more (3 total) — now exactly right. Pick the GK specifically as one of them, to prove GK removal also works.
  let gkLabel = page.locator('[data-remove-list] label', { hasText: '(GK)' });
  assert((await gkLabel.count()) === 1, 'The current goalkeeper is offered as a removal option, labeled (GK)');
  await gkLabel.locator('input[type="checkbox"]').check();
  await removeCheckboxes.nth(1).check();
  await page.waitForTimeout(50);
  assert(!(await submitBtn.isDisabled()), 'Apply enables once exactly 3 are picked');

  const checkedIds = await page.$$eval('[data-remove-list] input[type="checkbox"]:checked', (els) => els.map((el) => el.value));
  assert(checkedIds.length === 3, `Exactly 3 checkboxes ended up checked, got ${checkedIds.length}`);

  await submitBtn.click();
  await page.waitForTimeout(200);

  // ============ The 3 chosen players actually came off; everyone else is cleanly placed in the new 6-a-side formation ============
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const game = state.games.find((g) => g.id === gameId);
  assert(game.squadFormat === 6, `Squad size actually changed to 6, got ${game.squadFormat}`);

  checkedIds.forEach((id) => {
    assert(!game.live.onField.includes(id), `Removed player ${id} is no longer on the pitch`);
    assert(game.live.gkByPeriod[1] !== id, `Removed player ${id} is no longer the goalkeeper if they were`);
    assert(!Object.values(game.lineup.slots).includes(id), `Removed player ${id} no longer holds a lineup slot`);
  });

  const stillOnPitch = [...game.live.onField, ...(game.live.gkByPeriod[1] ? [game.live.gkByPeriod[1]] : [])];
  assert(stillOnPitch.length === 6, `Exactly 6 players remain on the pitch after removing 3 from the original 9, got ${stillOnPitch.length}`);
  const allStillPlaced = stillOnPitch.every((id) => Object.values(game.lineup.slots).includes(id));
  assert(allStillPlaced, 'Every remaining on-pitch player is placed somewhere in the new, smaller lineup — no leftover overflow');

  // Removed players are back on the bench (present, not sent off, not on the pitch) — not knocked out of the match entirely.
  checkedIds.forEach((id) => {
    assert((game.presentIds || []).includes(id), `Removed player ${id} is still marked present`);
    assert(!(game.live.sentOff || []).includes(id), `Removed player ${id} was NOT sent off — just benched, still eligible to come back on`);
  });

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL LIVE CHANGE-SQUAD-SIZE-REMOVES-PLAYER TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
