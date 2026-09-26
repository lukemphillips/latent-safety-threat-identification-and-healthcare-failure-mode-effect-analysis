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

  const teamSquadFormat = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().team.squadFormat;
  });

  // ============ Add Game form offers the full 3-to-11 range ============
  await page.goto(BASE + '/index.html#/schedule');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  const formatOptions = await page.$$eval('#game-form [name="squadFormat"] option', (els) => els.map((e) => e.value));
  assert(JSON.stringify(formatOptions) === JSON.stringify(['3', '4', '5', '6', '7', '8', '9', '10', '11']), `Format select offers 3-a-side through 11-a-side, got ${JSON.stringify(formatOptions)}`);
  const defaultSelected = await page.$eval('#game-form [name="squadFormat"]', (el) => el.value);
  assert(Number(defaultSelected) === teamSquadFormat, `Format defaults to the team's own format (${teamSquadFormat}), got ${defaultSelected}`);

  // Create a game explicitly at a different format than the team default.
  await page.fill('#game-form [name="opponent"]', 'Format Test FC');
  await page.selectOption('#game-form [name="squadFormat"]', '5');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  const newGame = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.opponent === 'Format Test FC');
    return { id: g.id, squadFormat: g.squadFormat, slotCount: Object.keys(g.lineup.slots).length };
  });
  assert(newGame.squadFormat === 5, `Game stores its own 5-a-side override, got ${newGame.squadFormat}`);
  assert(newGame.slotCount === 5, `5-a-side game's lineup has 5 slots (GK + 4 outfield), got ${newGame.slotCount}`);

  await page.goto(`${BASE}/index.html#/game/${newGame.id}/lineup`);
  await page.waitForTimeout(150);
  const formationLabel = await page.$eval('#formation-select option:checked', (el) => el.textContent);
  assert(formationLabel.includes('5-a-side'), `Squad tab offers a 5-a-side formation for this game, got "${formationLabel}"`);

  const teamStillDefault = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().team.squadFormat;
  });
  assert(teamStillDefault === teamSquadFormat, `Team default format is unaffected by the per-game override, got ${teamStillDefault}`);

  // ============ Editing a scheduled game's format ============
  await page.goto(`${BASE}/index.html#/game/${newGame.id}`);
  await page.waitForTimeout(150);
  await page.click('[data-action="edit-game"]');
  await page.waitForSelector('#edit-game-form');
  const editSelected = await page.$eval('#edit-game-form [name="squadFormat"]', (el) => el.value);
  assert(editSelected === '5', `Edit Game form shows the game's current 5-a-side format, got ${editSelected}`);
  await page.selectOption('#edit-game-form [name="squadFormat"]', '11');
  await page.click('#edit-game-form button[type="submit"]');
  await page.waitForTimeout(200);

  const afterEdit = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    return { squadFormat: g.squadFormat, formationId: g.formationId, slotCount: Object.keys(g.lineup.slots).length };
  }, newGame.id);
  assert(afterEdit.squadFormat === 11, `Editing bumps the game to 11-a-side, got ${afterEdit.squadFormat}`);
  assert(afterEdit.formationId === null, `Formation id resets after a format change, got ${afterEdit.formationId}`);
  assert(afterEdit.slotCount === 11, `Lineup now has 11 slots, got ${afterEdit.slotCount}`);

  // Editing it back to the team's own current default should store null
  // (inherit), not an explicit value equal to the default.
  await page.goto(`${BASE}/index.html#/game/${newGame.id}`);
  await page.waitForTimeout(150);
  await page.click('[data-action="edit-game"]');
  await page.waitForSelector('#edit-game-form');
  await page.selectOption('#edit-game-form [name="squadFormat"]', String(teamSquadFormat));
  await page.click('#edit-game-form button[type="submit"]');
  await page.waitForTimeout(200);
  const afterRevert = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((x) => x.id === id).squadFormat;
  }, newGame.id);
  assert(afterRevert === null, `Reverting to the team default stores null (inherit), not an explicit ${teamSquadFormat}, got ${afterRevert}`);

  // ============ Team default change cascades only to inheriting games ============
  await page.goto(`${BASE}/index.html#/schedule`);
  await page.waitForTimeout(150);
  await page.click('[data-action="add-game"]');
  await page.waitForSelector('#game-form');
  await page.fill('#game-form [name="opponent"]', 'Overridden FC');
  await page.selectOption('#game-form [name="squadFormat"]', '9');
  await page.click('#game-form button[type="submit"]');
  await page.waitForTimeout(200);

  await page.goto(BASE + '/index.html#/settings');
  await page.waitForTimeout(150);
  await page.selectOption('#team-form [name="squadFormat"]', '11');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(200);

  const afterTeamChange = await page.evaluate(async (revertedGameId) => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    const inheriting = s.games.find((g) => g.id === revertedGameId);
    const overridden = s.games.find((g) => g.opponent === 'Overridden FC');
    return {
      teamFormat: s.team.squadFormat,
      inheritingSlots: Object.keys(inheriting.lineup.slots).length,
      overriddenSquadFormat: overridden.squadFormat,
      overriddenSlots: Object.keys(overridden.lineup.slots).length,
    };
  }, newGame.id);
  assert(afterTeamChange.teamFormat === 11, `Team default is now 11, got ${afterTeamChange.teamFormat}`);
  assert(afterTeamChange.inheritingSlots === 11, `The inheriting (non-overridden) game reshapes to the new 11-a-side team default, got ${afterTeamChange.inheritingSlots} slots`);
  assert(afterTeamChange.overriddenSquadFormat === 9, `An explicitly-overridden game keeps its own 9-a-side format, got ${afterTeamChange.overriddenSquadFormat}`);
  assert(afterTeamChange.overriddenSlots === 9, `The overridden game's lineup stays at 9 slots, untouched by the team default change, got ${afterTeamChange.overriddenSlots}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL GAME SQUAD-FORMAT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
