// Training sessions are now part of Cloud Sync's payload (see
// cloudSync.js's pushToCloud and buildAppsScript's doPost). Unlike games,
// there's no union-merge protection on the server for them — the Full
// Edit token's posted list is trusted wholesale, same as players and team
// settings, which is also what makes a plain delete (omitting a session
// from the posted list) actually stick server-side rather than being
// re-added by a "never let anything disappear" merge. This runs the
// ACTUAL generated Apps Script (not a hand-written reimplementation) via
// a real Node vm sandbox.
const path = require('path');
const { createAppsScriptSandbox } = require('./support/appsScriptSandbox');

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

async function main() {
  const cloudSyncPath = path.join(__dirname, '..', 'js', 'cloudSync.js');
  const mod = await import('file://' + cloudSyncPath);
  const script = mod.buildAppsScript({ fullEditToken: 'fulledittoken', matchdayToken: 'matchdaytoken' });
  const server = createAppsScriptSandbox(script);

  const team = { name: 'Test FC' };
  const players = [{ id: 'p1', name: 'Player One' }];
  const games = [{ id: 'g1', opponent: 'Someone', status: 'scheduled' }];

  // ============ Full Edit coach seeds the sheet with a training session ============
  const trainingId = 'training-1';
  const seedTrainings = [{ id: trainingId, date: '2026-01-10', time: '18:00', location: 'Pitch 1' }];
  const setupResult = server.doPost({ token: 'fulledittoken' }, { team, players, games, trainings: seedTrainings });
  assert(setupResult.ok, 'Initial editor seed push succeeds');

  let stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(stored.trainings.length === 1 && stored.trainings[0].location === 'Pitch 1', 'Training session reaches the server on the initial push');

  // ============ A Matchday push never touches training sessions ============
  const matchdayPush = server.doPost({ token: 'matchdaytoken' }, { team, players, games, trainings: [{ id: trainingId, date: '2026-01-10', time: '18:00', location: 'Tampered' }], syncedByName: 'Sideline device' });
  assert(matchdayPush.ok, 'Matchday push succeeds');
  stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(stored.trainings[0].location === 'Pitch 1', `A Matchday push can't alter a training session, got "${stored.trainings[0].location}"`);

  // ============ An editor push edits the session ============
  server.doPost({ token: 'fulledittoken' }, { team, players, games, trainings: [{ id: trainingId, date: '2026-01-10', time: '18:00', location: 'Pitch 2' }] });
  stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(stored.trainings[0].location === 'Pitch 2', `The Full Edit token's edit comes through, got "${stored.trainings[0].location}"`);

  // ============ An editor push that omits the session deletes it (no union-merge protection) ============
  server.doPost({ token: 'fulledittoken' }, { team, players, games, trainings: [] });
  stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(stored.trainings.length === 0, `Omitting a session from the Full Edit push actually deletes it server-side, got ${JSON.stringify(stored.trainings)}`);

  // ============ A push with no trainings field at all is treated as an empty list, not an error ============
  server.doPost({ token: 'fulledittoken' }, { team, players, games });
  stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(Array.isArray(stored.trainings) && stored.trainings.length === 0, 'A push from an older client with no trainings field at all is tolerated');

  console.log('\nALL SERVER-SIDE TRAININGS SYNC TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
