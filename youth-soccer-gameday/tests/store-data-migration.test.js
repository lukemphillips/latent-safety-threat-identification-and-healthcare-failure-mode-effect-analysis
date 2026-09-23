// Proves store.js's migratePlayers()/migrateTrainings() actually upgrade
// old-shaped data on every entry point (fresh load, restoreFromBackup,
// mergeBackup, applyCloudSync) — the safety net that made it safe to drop
// the old defensive read-side fallbacks in util.js's playerPositions() and
// training.js's resolveStations().
const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function oldFormatPlayer(id, name) {
  // Pre-multi-position shape: a single `position` string, no `positions`.
  return { id, name, jerseyNumber: 1, position: 'MID', skillStream: null, active: true, isGuest: false };
}

function oldFormatRotateTraining(id) {
  // Pre-stations shape: a rotate block deriving its stations from
  // groupActivities at render time, with no explicit `stations` array.
  return {
    id,
    date: '2024-01-01',
    time: '18:00',
    location: '',
    presentIds: [],
    groups: [{ id: 'g1', name: 'A', playerIds: [] }, { id: 'g2', name: 'B', playerIds: [] }],
    blocks: [{
      id: 'b1', minutes: 10, mode: 'grouped', rotate: true,
      groupActivities: { g1: 'Passing', g2: 'Shooting' },
      groupActivityDrillIds: {},
    }],
  };
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());

  // ============ Entry point 1: fresh load from old-format localStorage ============
  await page.evaluate(({ player, training }) => {
    const oldState = {
      team: { name: 'Old Format FC', squadFormat: 7, numPeriods: 2, periodMinutes: 25 },
      players: [player],
      games: [],
      trainings: [training],
      drills: [],
    };
    localStorage.setItem('ysg-data-v2', JSON.stringify(oldState));
  }, { player: oldFormatPlayer('p1', 'Old Format Player'), training: oldFormatRotateTraining('t1') });

  await page.reload();
  await page.waitForTimeout(150);

  // getState() (in-memory), not raw localStorage — load() migrates the
  // in-memory copy immediately, but only re-persists it on the next real
  // save (any update()/saveAutoBackup/etc.), same as the rest of the app.
  let state = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState();
  });
  let p = state.players.find((x) => x.id === 'p1');
  assert(Array.isArray(p.positions) && p.positions.length === 1 && p.positions[0] === 'MID', `Fresh load migrates position -> positions, got ${JSON.stringify(p.positions)}`);

  let t = state.trainings.find((x) => x.id === 't1');
  const block = t.blocks[0];
  assert(Array.isArray(block.stations) && block.stations.length === 2, `Fresh load migrates rotate block groupActivities -> stations, got ${JSON.stringify(block.stations)}`);
  assert(block.stations.some((s) => s.activity === 'Passing') && block.stations.some((s) => s.activity === 'Shooting'), `Migrated stations carry over the right activities, got ${JSON.stringify(block.stations)}`);

  // Roster UI actually renders the migrated position (proves
  // playerPositions() — no fallback anymore — reads the upgraded array).
  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  const rosterText = await page.textContent('#app');
  assert(rosterText.includes('MID'), 'Roster row shows the migrated position');

  // Training Plan tab actually renders the migrated stations (proves
  // resolveStations() — no fallback anymore — reads the upgraded array).
  await page.goto(`${BASE}/index.html#/training/t1/plan`);
  await page.waitForTimeout(150);
  const planText = await page.textContent('#app');
  assert(planText.includes('Passing') || planText.includes('Rotation'), `Training Plan renders the migrated rotation block correctly, got: ${planText.slice(0, 300)}`);

  // ============ Entry point 2: restoreFromBackup ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const restoreResult = await page.evaluate(async ({ player, training }) => {
    const mod = await import('/js/store.js');
    mod.restoreFromBackup({
      team: { name: 'Restored FC', squadFormat: 7, numPeriods: 2, periodMinutes: 25 },
      players: [player],
      games: [],
      trainings: [training],
      drills: [],
    });
    const s = mod.getState();
    return { player: s.players[0], block: s.trainings[0].blocks[0] };
  }, { player: oldFormatPlayer('p2', 'Restored Player'), training: oldFormatRotateTraining('t2') });
  assert(Array.isArray(restoreResult.player.positions) && restoreResult.player.positions[0] === 'MID', `restoreFromBackup migrates position, got ${JSON.stringify(restoreResult.player.positions)}`);
  assert(Array.isArray(restoreResult.block.stations) && restoreResult.block.stations.length === 2, `restoreFromBackup migrates rotate block stations, got ${JSON.stringify(restoreResult.block.stations)}`);

  // ============ Entry point 3: mergeBackup ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);
  const mergeResult = await page.evaluate(async ({ player, training }) => {
    const mod = await import('/js/store.js');
    mod.mergeBackup({
      team: { name: 'Merged FC' },
      players: [player],
      games: [],
      trainings: [training],
      drills: [],
    });
    const s = mod.getState();
    return { player: s.players.find((p) => p.id === 'p3'), block: s.trainings.find((t) => t.id === 't3').blocks[0] };
  }, { player: oldFormatPlayer('p3', 'Merged Player'), training: oldFormatRotateTraining('t3') });
  assert(!!mergeResult.player && Array.isArray(mergeResult.player.positions) && mergeResult.player.positions[0] === 'MID', `mergeBackup migrates position, got ${JSON.stringify(mergeResult.player?.positions)}`);
  assert(Array.isArray(mergeResult.block.stations) && mergeResult.block.stations.length === 2, `mergeBackup migrates rotate block stations, got ${JSON.stringify(mergeResult.block.stations)}`);

  // ============ Entry point 4: applyCloudSync ============
  const cloudResult = await page.evaluate(async ({ player }) => {
    const mod = await import('/js/store.js');
    mod.applyCloudSync({
      team: { name: 'Cloud FC' },
      players: [player],
      games: [],
    });
    const s = mod.getState();
    return { player: s.players.find((p) => p.id === 'p4') };
  }, { player: oldFormatPlayer('p4', 'Cloud Player') });
  assert(!!cloudResult.player && Array.isArray(cloudResult.player.positions) && cloudResult.player.positions[0] === 'MID', `applyCloudSync migrates position, got ${JSON.stringify(cloudResult.player?.positions)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL DATA-MIGRATION TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
