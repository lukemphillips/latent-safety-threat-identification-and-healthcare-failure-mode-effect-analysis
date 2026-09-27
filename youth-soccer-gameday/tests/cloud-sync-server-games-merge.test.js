// Reported bug: two coaches (Kate and Luke) each running their own
// separate matches on match day. Kate finishes her matches and syncs;
// Luke, syncing around the same time, still ends up seeing Kate's
// matches as "scheduled" — even after Kate resyncs again.
//
// Root cause: the Apps Script's doPost blindly overwrote the whole
// stored games array with whatever a device posted (`games:
// posted.games`), for both roles. The client-side merge (gameIsNewer)
// only ever protects what a device pulls INTO itself — it does nothing
// to protect the server's own copy from being overwritten by a later
// push that happens to be carrying an EARLIER, less-complete copy of
// someone else's match. Two coaches both syncing routinely throughout
// the day (exactly what the app's own auto-sync encourages) makes this
// close to inevitable: whichever push lands last wins, regardless of
// which one is actually more complete.
//
// This runs the ACTUAL generated Apps Script (not a hand-written
// reimplementation) via a real Node vm sandbox, so it exercises the
// real server-side merge logic rather than a test's own assumptions
// about what the server does.
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

  // ============ Full Edit coach seeds the sheet with two scheduled games ============
  const kateGameId = 'kate-game';
  const lukeGameId = 'luke-game';
  const seedGames = [
    { id: kateGameId, opponent: 'Kate\'s Opponent', status: 'scheduled', updatedAt: 1000 },
    { id: lukeGameId, opponent: 'Luke\'s Opponent', status: 'scheduled', updatedAt: 1000 },
  ];
  const setupResult = server.doPost({ token: 'fulledittoken' }, { team, players, games: seedGames });
  assert(setupResult.ok, 'Initial editor seed push succeeds');

  // ============ Kate finishes her match and pushes ============
  // Kate's own local device: her game completed, Luke's game still shows
  // as scheduled from her own last-known copy (she hasn't seen Luke's
  // completion — doesn't matter, she doesn't need to for this to work).
  const kateGames = [
    { id: kateGameId, opponent: 'Kate\'s Opponent', status: 'completed', updatedAt: 2000, live: { scoreUs: 3, scoreThem: 1, subLog: [{ type: 'goal' }, { type: 'goal' }, { type: 'goal' }] } },
    { id: lukeGameId, opponent: 'Luke\'s Opponent', status: 'scheduled', updatedAt: 1000 },
  ];
  const kateResult = server.doPost({ token: 'matchdaytoken' }, { team, players, games: kateGames, syncedByName: 'Kate' });
  assert(kateResult.ok, 'Kate\'s push succeeds');

  let stored = JSON.parse(server._cells.A1);
  assert(stored.games.find((g) => g.id === kateGameId).status === 'completed', 'Right after Kate\'s push, the server shows her match completed');

  // ============ Luke, syncing around the same time, pushes his own STALE copy ============
  // Luke's own local device at this moment: his match now completed,
  // but his copy of KATE's match is still the old scheduled one — his
  // own pull hadn't caught her completion yet when this push started
  // (or simply never has to, for the bug to bite: he's never touched
  // her match at all). Same shape as a normal "Sync Now".
  const lukeGames = [
    { id: kateGameId, opponent: 'Kate\'s Opponent', status: 'scheduled', updatedAt: 1000 },
    { id: lukeGameId, opponent: 'Luke\'s Opponent', status: 'completed', updatedAt: 2500, live: { scoreUs: 2, scoreThem: 0, subLog: [{ type: 'goal' }, { type: 'goal' }] } },
  ];
  const lukeResult = server.doPost({ token: 'matchdaytoken' }, { team, players, games: lukeGames, syncedByName: 'Luke' });
  assert(lukeResult.ok, 'Luke\'s push succeeds');

  stored = JSON.parse(server._cells.A1);
  const kateGameAfterLuke = stored.games.find((g) => g.id === kateGameId);
  const lukeGameAfterLuke = stored.games.find((g) => g.id === lukeGameId);
  assert(kateGameAfterLuke.status === 'completed', `Kate's completed match survives Luke's later, stale push — got status "${kateGameAfterLuke.status}"`);
  assert(kateGameAfterLuke.live.scoreUs === 3, `Kate's actual score is preserved, got ${kateGameAfterLuke.live && kateGameAfterLuke.live.scoreUs}`);
  assert(lukeGameAfterLuke.status === 'completed', 'Luke\'s own match is also correctly completed');
  assert(lukeGameAfterLuke.live.scoreUs === 2, `Luke's score is preserved too, got ${lukeGameAfterLuke.live && lukeGameAfterLuke.live.scoreUs}`);

  // ============ Now the other way around: Kate syncs again, still carrying her stale copy of Luke's match ============
  const kateSecondSync = [
    { id: kateGameId, opponent: 'Kate\'s Opponent', status: 'completed', updatedAt: 2000, live: { scoreUs: 3, scoreThem: 1, subLog: [{ type: 'goal' }, { type: 'goal' }, { type: 'goal' }] } },
    { id: lukeGameId, opponent: 'Luke\'s Opponent', status: 'scheduled', updatedAt: 1000 },
  ];
  server.doPost({ token: 'matchdaytoken' }, { team, players, games: kateSecondSync, syncedByName: 'Kate' });
  stored = JSON.parse(server._cells.A1);
  const lukeGameAfterKateAgain = stored.games.find((g) => g.id === lukeGameId);
  assert(lukeGameAfterKateAgain.status === 'completed', `Order doesn't matter: Luke's completed match also survives Kate's later, stale push — got status "${lukeGameAfterKateAgain.status}"`);

  // ============ A genuinely newer edit to an already-completed game still wins ============
  const editedKateGame = [
    { id: kateGameId, opponent: 'Kate\'s Opponent', status: 'completed', updatedAt: 3000, live: { scoreUs: 4, scoreThem: 1, subLog: [{ type: 'goal' }, { type: 'goal' }, { type: 'goal' }, { type: 'goal' }] } },
    { id: lukeGameId, opponent: 'Luke\'s Opponent', status: 'completed', updatedAt: 2500, live: { scoreUs: 2, scoreThem: 0, subLog: [{ type: 'goal' }, { type: 'goal' }] } },
  ];
  server.doPost({ token: 'matchdaytoken' }, { team, players, games: editedKateGame, syncedByName: 'Kate' });
  stored = JSON.parse(server._cells.A1);
  assert(stored.games.find((g) => g.id === kateGameId).live.scoreUs === 4, 'A genuine post-match correction to an already-completed game still comes through');

  // ============ Editor-role pushes are protected the same way, not just Matchday ============
  const editorStalePush = [
    { id: kateGameId, opponent: 'Kate\'s Opponent', status: 'scheduled', updatedAt: 1000 },
    { id: lukeGameId, opponent: 'Luke\'s Opponent', status: 'completed', updatedAt: 2500, live: { scoreUs: 2, scoreThem: 0, subLog: [{ type: 'goal' }, { type: 'goal' }] } },
  ];
  server.doPost({ token: 'fulledittoken' }, { team, players, games: editorStalePush });
  stored = JSON.parse(server._cells.A1);
  assert(stored.games.find((g) => g.id === kateGameId).status === 'completed', 'A stale push from the Full Edit token doesn\'t clobber a completed match either');

  console.log('\nALL SERVER-SIDE GAMES-MERGE TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
