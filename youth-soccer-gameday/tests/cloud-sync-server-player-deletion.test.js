// Reported bug: "I removed them but they reappeared." A Matchday coach's
// own quick-add ("+ Fill-In Player") sometimes creates a duplicate of
// someone already on the roster (a confused tap meant to just mark that
// person present). The Full Edit coach deletes the duplicate — but the
// Matchday device that created it still has its own local copy and never
// learns it was deleted, so every time THAT device syncs again, the
// Matchday branch below sees an id that isn't in the server's current
// player list and treats it as "brand new" all over again. Root cause is
// exactly the same shape as the already-fixed game-deletion bug (see
// cloud-sync-server-game-deletion.test.js) — deletedPlayerIds tombstones
// are the fix, mirroring deletedGameIds.
//
// This runs the ACTUAL generated Apps Script (not a reimplementation).
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
  const games = [{ id: 'g1', opponent: 'Someone FC', status: 'scheduled', updatedAt: 1000 }];

  // ============ Full Edit coach seeds the real roster ============
  const seedResult = server.doPost({ token: 'fulledittoken' }, {
    team, games,
    players: [{ id: 'real-ellie', name: 'Ellie Ford' }, { id: 'keep-me', name: 'Keep Me Player' }],
  });
  assert(seedResult.ok, 'Seed push succeeds');

  // ============ A Matchday coach, confused, creates a duplicate ("Ellie") via Add Fill-In Player and syncs ============
  const matchdayPushResult = server.doPost({ token: 'matchdaytoken' }, {
    team, games,
    players: [
      { id: 'real-ellie', name: 'Ellie Ford' },
      { id: 'keep-me', name: 'Keep Me Player' },
      { id: 'dupe-ellie', name: 'Ellie' },
    ],
  });
  assert(matchdayPushResult.ok, 'Matchday push with the accidental duplicate succeeds');

  let afterDupe = server.doGet({ token: 'fulledittoken' });
  let namesAfterDupe = afterDupe.data.players.map((p) => p.name);
  assert(namesAfterDupe.includes('Ellie'), `The duplicate reached the server, as expected, got ${JSON.stringify(namesAfterDupe)}`);

  // ============ The Full Edit coach deletes the duplicate and syncs ============
  const deleteResult = server.doPost({ token: 'fulledittoken' }, {
    team, games,
    players: [{ id: 'real-ellie', name: 'Ellie Ford' }, { id: 'keep-me', name: 'Keep Me Player' }],
    deletedPlayerIds: [{ id: 'dupe-ellie', deletedAt: 2000 }],
  });
  assert(deleteResult.ok, 'Delete push succeeds');

  let afterDelete = server.doGet({ token: 'fulledittoken' });
  let idsAfterDelete = afterDelete.data.players.map((p) => p.id);
  assert(!idsAfterDelete.includes('dupe-ellie'), `The duplicate is actually gone right after deletion, got ${JSON.stringify(idsAfterDelete)}`);
  assert(idsAfterDelete.includes('real-ellie') && idsAfterDelete.includes('keep-me'), 'The real players are untouched');

  // ============ THE REPORTED BUG: the Matchday device that created the duplicate syncs again, still holding its stale copy ============
  // Same shape as a normal Sync Now from that device — it still has
  // "dupe-ellie" locally (it was never told about the deletion) and
  // pushes its full player list right alongside real match data.
  const matchdayResyncResult = server.doPost({ token: 'matchdaytoken' }, {
    team, games,
    players: [
      { id: 'real-ellie', name: 'Ellie Ford' },
      { id: 'keep-me', name: 'Keep Me Player' },
      { id: 'dupe-ellie', name: 'Ellie' },
    ],
    deletedPlayerIds: [], // this device never deleted anything itself
  });
  assert(matchdayResyncResult.ok, 'Matchday resync push succeeds');

  const afterMatchdayResync = server.doGet({ token: 'matchdaytoken' });
  const idsAfterResync = afterMatchdayResync.data.players.map((p) => p.id);
  assert(!idsAfterResync.includes('dupe-ellie'), `The deleted duplicate does NOT come back just because the device that created it still had its stale copy, got ${JSON.stringify(idsAfterResync)}`);
  assert(idsAfterResync.includes('real-ellie') && idsAfterResync.includes('keep-me'), 'The real players are still there after the Matchday resync');

  // ============ A genuinely new player (never tombstoned) from Matchday still works normally ============
  const genuineNewResult = server.doPost({ token: 'matchdaytoken' }, {
    team, games,
    players: [
      { id: 'real-ellie', name: 'Ellie Ford' },
      { id: 'keep-me', name: 'Keep Me Player' },
      { id: 'genuine-new', name: 'Jamie Borrowed' },
    ],
    deletedPlayerIds: [],
  });
  assert(genuineNewResult.ok, 'A genuinely new fill-in player push succeeds');
  const afterGenuineNew = server.doGet({ token: 'fulledittoken' });
  const namesAfterGenuineNew = afterGenuineNew.data.players.map((p) => p.name);
  assert(namesAfterGenuineNew.includes('Jamie Borrowed'), `A genuinely new player is still accepted from Matchday, got ${JSON.stringify(namesAfterGenuineNew)}`);
  assert(!namesAfterGenuineNew.includes('Ellie'), 'The tombstoned duplicate is still correctly excluded even in this later, unrelated push');

  console.log('\nALL SERVER-SIDE PLAYER-DELETION TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
