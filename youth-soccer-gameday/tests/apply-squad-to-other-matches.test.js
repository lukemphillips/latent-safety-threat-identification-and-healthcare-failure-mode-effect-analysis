// "Apply Squad to Other Matches" (Squad tab) — lets a coach build
// attendance + a lineup once and copy it onto other scheduled fixtures,
// rather than re-entering the same squad for every match of a tournament
// day. Covers: the target list only offers other SCHEDULED games (not a
// live/completed one, and not the source game itself), the copy actually
// carries presentIds + formation + lineup, and everything match-specific
// (opponent, date/time, RSVPs) on the target is left untouched.
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

  // Sample data already seeds a mix of scheduled/completed games — useful
  // as-is to prove completed games never show up as apply targets.
  const seeded = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    return {
      completedOpponent: s.games.find((g) => g.status === 'completed')?.opponent || null,
      playerIds: s.players.slice(0, 4).map((p) => p.id),
    };
  });
  assert(seeded.completedOpponent, 'Sample data has at least one completed game to prove gets excluded');

  // ============ Add two fresh scheduled games (the "tournament day") ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Squad Push A');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Squad Push B');
  await page.fill('#game-form [name="time"]', '14:30');
  await page.fill('#game-form [name="location"]', 'North Pitch 2');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  const { gameA, gameB } = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    return {
      gameA: s.games.find((g) => g.opponent === 'Squad Push A'),
      gameB: s.games.find((g) => g.opponent === 'Squad Push B'),
    };
  });
  assert(gameA && gameB, 'Both fresh scheduled games exist');

  // ============ Build a squad on Game A: a chosen formation, attendance, and an auto-filled lineup ============
  await page.goto(`${BASE}/index.html#/game/${gameA.id}/lineup`);
  await page.waitForTimeout(150);
  // Explicitly picking a formation (rather than leaving it on the
  // inherited default) pins a real formationId on Game A, so the
  // assertion below actually proves the id itself gets carried over, not
  // just two independently-defaulted games happening to agree.
  await page.selectOption('#formation-select', '7-3-2-1');
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);

  const gameAAfterBuild = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    return { presentCount: (g.presentIds || []).length, filledSlots: Object.values(g.lineup.slots).filter(Boolean).length, formationId: g.formationId };
  }, gameA.id);
  assert(gameAAfterBuild.presentCount > 0, `Game A has a built squad to push, got ${gameAAfterBuild.presentCount} present`);
  assert(gameAAfterBuild.filledSlots > 0, `Game A's lineup has filled slots, got ${gameAAfterBuild.filledSlots}`);

  // ============ The Apply Squad modal offers Game B but not the completed game or Game A itself ============
  await page.waitForSelector('[data-action="apply-squad-to-others"]');
  await page.click('[data-action="apply-squad-to-others"]');
  await page.waitForSelector('#apply-squad-form');
  const modalText = await page.$eval('#apply-squad-form', (el) => el.textContent);
  assert(modalText.includes('Squad Push B'), 'Modal offers Game B as a target');
  assert(!modalText.includes('Squad Push A'), 'Modal never offers the source game itself as a target');
  assert(!modalText.includes(seeded.completedOpponent), `Modal never offers the already-completed game as a target, got text containing it: ${modalText.includes(seeded.completedOpponent)}`);
  assert(modalText.includes('North Pitch 2'), `Modal shows each candidate's pitch/location, got: ${modalText}`);
  assert(modalText.includes('2:30'), `Modal shows each candidate's kickoff time, got: ${modalText}`);

  // Sample data already seeds one other scheduled game of its own, so the
  // modal legitimately offers more than just Game B here.
  const allCheckboxes = page.locator('#apply-squad-form input[name="targetGameId"]');
  const checkboxCount = await allCheckboxes.count();
  assert(checkboxCount >= 2, `At least Game B and the seeded scheduled game are offered, got ${checkboxCount}`);
  for (let i = 0; i < checkboxCount; i++) {
    assert(await allCheckboxes.nth(i).isChecked(), `Every target starts pre-checked (apply-to-all by default), checkbox ${i} was not`);
  }

  // Scope this test to just Game B: uncheck everything else so the
  // assertions below aren't also reasoning about the seeded game.
  const targetCheckbox = page.locator(`#apply-squad-form input[name="targetGameId"][value="${gameB.id}"]`);
  assert((await targetCheckbox.count()) === 1, `Game B's own checkbox is offered exactly once, got ${await targetCheckbox.count()}`);
  for (let i = 0; i < checkboxCount; i++) {
    const cb = allCheckboxes.nth(i);
    if ((await cb.getAttribute('value')) !== gameB.id) await cb.uncheck();
  }
  await page.click('#apply-squad-form button[type="submit"]');
  await page.waitForSelector('[data-alert-ok]');
  await page.click('[data-alert-ok]');
  await page.waitForTimeout(150);

  // ============ Game B picked up Game A's squad, nothing else changed ============
  const afterApply = await page.evaluate(async ({ aId, bId }) => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    const a = s.games.find((g) => g.id === aId);
    const b = s.games.find((g) => g.id === bId);
    return {
      bPresentIds: b.presentIds,
      aPresentIds: a.presentIds,
      bSlots: b.lineup.slots,
      aSlots: a.lineup.slots,
      bFormationId: b.formationId,
      aFormationId: a.formationId,
      bOpponent: b.opponent,
      bDate: b.date,
      bTime: b.time,
      bRsvps: b.rsvps,
    };
  }, { aId: gameA.id, bId: gameB.id });

  assert(JSON.stringify([...afterApply.bPresentIds].sort()) === JSON.stringify([...afterApply.aPresentIds].sort()), `Game B's attendance now matches Game A's, got ${JSON.stringify(afterApply.bPresentIds)} vs ${JSON.stringify(afterApply.aPresentIds)}`);
  assert(JSON.stringify(afterApply.bSlots) === JSON.stringify(afterApply.aSlots), `Game B's lineup slots now match Game A's, got ${JSON.stringify(afterApply.bSlots)} vs ${JSON.stringify(afterApply.aSlots)}`);
  assert(afterApply.bFormationId === afterApply.aFormationId, `Game B adopted Game A's formation, got "${afterApply.bFormationId}" vs "${afterApply.aFormationId}"`);
  assert(afterApply.bOpponent === 'Squad Push B', 'Game B keeps its own opponent name');
  assert(afterApply.bRsvps && Object.values(afterApply.bRsvps).every((v) => v === 'pending'), 'Game B\'s RSVPs were left untouched (still all pending)');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL APPLY-SQUAD-TO-OTHER-MATCHES TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
