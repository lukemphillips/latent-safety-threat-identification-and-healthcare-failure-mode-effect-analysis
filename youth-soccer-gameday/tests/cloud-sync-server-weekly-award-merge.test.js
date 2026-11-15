// Reported bug: a Player of the Week award set from one Full Edit device
// vanished after syncing again shortly after. Same shape as the games
// merge bug (cloud-sync-server-games-merge.test.js): the Apps Script's
// doPost blindly trusted `posted.team` wholesale for the editor role, so
// whichever device's push landed last silently overwrote the server's
// whole team object — including a weekly award a DIFFERENT device had
// just pushed, if this device's own copy of team.weeklyAwards hadn't
// caught up to it yet.
//
// This runs the ACTUAL generated Apps Script (not a hand-written
// reimplementation) via a real Node vm sandbox, same as the games-merge
// test, so it exercises the real server-side merge logic.
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

  const players = [{ id: 'p1', name: 'Player One' }, { id: 'p2', name: 'Player Two' }];
  const games = [{ id: 'g1', opponent: 'Opponent', status: 'completed', updatedAt: 1000 }];

  // ============ Seed the sheet with no awards yet ============
  const baseTeam = { name: 'Test FC', weeklyAwards: [] };
  const setupResult = server.doPost({ token: 'fulledittoken' }, { team: baseTeam, players, games });
  assert(setupResult.ok, 'Initial editor seed push succeeds');

  // ============ Coach A sets Week 1's award and pushes ============
  const coachATeam = { name: 'Test FC', weeklyAwards: [{ id: 'award-w1', weekStart: '2026-09-01', playerIds: ['p1'] }] };
  const coachAResult = server.doPost({ token: 'fulledittoken' }, { team: coachATeam, players, games });
  assert(coachAResult.ok, 'Coach A\'s push succeeds');

  let stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(stored.team.weeklyAwards.length === 1, 'Right after Coach A\'s push, the server shows her Week 1 award');

  // ============ Coach B, syncing around the same time, pushes their own STALE copy of team ============
  // Coach B's own local device at this moment: they've just set Week 2's
  // award, but their copy of team.weeklyAwards never saw Coach A's Week 1
  // award at all (they haven't pulled since before A pushed it) — same
  // shape as a normal "Sync Now" racing another device's.
  const coachBTeam = { name: 'Test FC', weeklyAwards: [{ id: 'award-w2', weekStart: '2026-09-08', playerIds: ['p2'] }] };
  const coachBResult = server.doPost({ token: 'fulledittoken' }, { team: coachBTeam, players, games });
  assert(coachBResult.ok, 'Coach B\'s push succeeds');

  stored = server.doGet({ token: 'fulledittoken' }).data;
  assert(stored.team.weeklyAwards.length === 2, `Coach A's Week 1 award survives Coach B's later, stale push — expected 2 awards, got ${stored.team.weeklyAwards.length}`);
  assert(stored.team.weeklyAwards.some((a) => a.id === 'award-w1' && a.playerIds.includes('p1')), 'Coach A\'s Week 1 award is intact');
  assert(stored.team.weeklyAwards.some((a) => a.id === 'award-w2' && a.playerIds.includes('p2')), 'Coach B\'s own Week 2 award also came through');

  // ============ A genuine edit to the SAME award (reopening it and changing the winner) still wins ============
  const coachAEdit = { name: 'Test FC', weeklyAwards: [{ id: 'award-w1', weekStart: '2026-09-01', playerIds: ['p1', 'p2'] }, { id: 'award-w2', weekStart: '2026-09-08', playerIds: ['p2'] }] };
  server.doPost({ token: 'fulledittoken' }, { team: coachAEdit, players, games });
  stored = server.doGet({ token: 'fulledittoken' }).data;
  const editedAward = stored.team.weeklyAwards.find((a) => a.id === 'award-w1');
  assert(JSON.stringify(editedAward.playerIds) === JSON.stringify(['p1', 'p2']), `A genuine edit to an existing award's winners still comes through, got ${JSON.stringify(editedAward && editedAward.playerIds)}`);
  assert(stored.team.weeklyAwards.length === 2, 'Editing one award never duplicates or drops the other');

  console.log('\nALL SERVER-SIDE WEEKLY-AWARD-MERGE TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
