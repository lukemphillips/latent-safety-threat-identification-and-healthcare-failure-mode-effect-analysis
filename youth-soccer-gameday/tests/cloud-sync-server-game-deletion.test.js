// Reported bug: a coach deletes a scheduled match that never actually got
// played, but it keeps coming back on the next Cloud Sync. Root cause:
// mergeGames_ deliberately never lets a game disappear just because one
// device's push didn't mention it (that's what stops a device with
// stale/incomplete data from wiping out everyone else's newer matches —
// see cloud-sync-server-games-merge.test.js). Without an explicit record
// of "this id was deleted," the server can't tell a real deletion apart
// from a device that simply never knew about the game, so the very next
// sync from ANY device still carrying the old copy (e.g. a Matchday
// device that never pulled the deletion) silently brings it straight
// back. deletedGameIds tombstones are the fix.
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
  const players = [{ id: 'p1', name: 'Player One' }];

  // ============ Seed two scheduled (never-run) matches ============
  const seedResult = server.doPost({ token: 'fulledittoken' }, {
    team, players,
    games: [
      { id: 'never-run-1', opponent: 'Never Run FC', status: 'scheduled', updatedAt: 1000 },
      { id: 'never-run-2', opponent: 'Also Never Run FC', status: 'scheduled', updatedAt: 1000 },
      { id: 'keep-me', opponent: 'Keep Me FC', status: 'scheduled', updatedAt: 1000 },
    ],
  });
  assert(seedResult.ok, 'Seed push succeeds');

  // ============ The coach deletes both never-run matches on their device and syncs ============
  const deleteResult = server.doPost({ token: 'fulledittoken' }, {
    team, players,
    games: [{ id: 'keep-me', opponent: 'Keep Me FC', status: 'scheduled', updatedAt: 1000 }],
    deletedGameIds: [{ id: 'never-run-1', deletedAt: 2000 }, { id: 'never-run-2', deletedAt: 2000 }],
  });
  assert(deleteResult.ok, 'Delete push succeeds');

  let afterDelete = server.doGet({ token: 'fulledittoken' });
  let idsAfterDelete = afterDelete.data.games.map((g) => g.id);
  assert(!idsAfterDelete.includes('never-run-1') && !idsAfterDelete.includes('never-run-2'), `Both deleted matches are actually gone, got ${JSON.stringify(idsAfterDelete)}`);
  assert(idsAfterDelete.includes('keep-me'), 'The match that was NOT deleted is still there');

  // ============ The exact reported bug: a Matchday device that never knew about the deletion resyncs ============
  // This device still has its own old, stale copy of never-run-1 (never
  // pulled the deletion) and pushes it right alongside its own real
  // data — same shape as the app's normal Sync Now.
  const matchdayResyncResult = server.doPost({ token: 'matchdaytoken' }, {
    team, players,
    games: [
      { id: 'never-run-1', opponent: 'Never Run FC', status: 'scheduled', updatedAt: 1000 },
      { id: 'keep-me', opponent: 'Keep Me FC', status: 'scheduled', updatedAt: 1000 },
    ],
    // This device never deleted anything itself.
    deletedGameIds: [],
  });
  assert(matchdayResyncResult.ok, 'Matchday resync push succeeds');

  const afterMatchdayResync = server.doGet({ token: 'matchdaytoken' });
  const idsAfterResync = afterMatchdayResync.data.games.map((g) => g.id);
  assert(!idsAfterResync.includes('never-run-1'), `The deleted match does NOT come back just because another device still had its stale copy, got ${JSON.stringify(idsAfterResync)}`);
  assert(idsAfterResync.includes('keep-me'), 'The kept match is still there after the Matchday resync');

  // ============ A genuine resurrection still works: the "deleted" match gets a real update AFTER the deletion ============
  const resurrectResult = server.doPost({ token: 'fulledittoken' }, {
    team, players,
    games: [
      { id: 'never-run-2', opponent: 'Also Never Run FC', status: 'completed', updatedAt: 5000, live: { scoreUs: 2, scoreThem: 1, subLog: [] } },
      { id: 'keep-me', opponent: 'Keep Me FC', status: 'scheduled', updatedAt: 1000 },
    ],
  });
  assert(resurrectResult.ok, 'Resurrection push succeeds');
  const afterResurrect = server.doGet({ token: 'fulledittoken' });
  const resurrected = afterResurrect.data.games.find((g) => g.id === 'never-run-2');
  assert(resurrected && resurrected.status === 'completed', `A match genuinely updated AFTER its own deletion correctly survives (it wasn't really a stale resync), got ${JSON.stringify(resurrected)}`);

  // Still-correctly-deleted match from the resurrection push stays gone,
  // since the push didn't touch it and its tombstone is still active.
  const stillGoneId = afterResurrect.data.games.map((g) => g.id);
  assert(!stillGoneId.includes('never-run-1'), 'The still-genuinely-deleted match remains gone after an unrelated push');

  console.log('\nALL SERVER-SIDE GAME-DELETION TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
