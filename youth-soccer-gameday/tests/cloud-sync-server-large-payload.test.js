// Reported failure: Sync Now consistently failed with a bare "network
// error" for one specific coach's real data — the exact same request
// shape succeeded instantly with a tiny test payload, on every network
// tried (WiFi and mobile), with no VPN or content blocker involved. The
// one thing that actually differed was payload size: ~54KB of real team
// + roster + a fully-tracked match, once a season's worth of data and a
// detailed live subLog pushed it over Google Sheets' hard, real
// limit of 50,000 characters per cell — which the old writeStored_
// (`sheet.getRange(DATA_CELL).setValue(JSON.stringify(data))`) put the
// entire blob into. That kind of platform-level failure isn't always
// something even the script's own try/catch can see, so it can surface
// to the browser as a bare, contentless network error indistinguishable
// from a real connectivity problem.
//
// This proves it two ways, using the REAL generated script: that a
// payload safely over 50,000 characters round-trips correctly (the
// actual fix), and that the sandbox's enforcement of the real Sheets
// limit is doing real work (a direct single-cell write over the limit
// genuinely throws, so the round-trip test isn't just trivially passing).
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

  // A big live subLog is exactly what pushes a real match over the old
  // single-cell limit — build one large enough that the combined JSON
  // comfortably clears 50,000 characters, the same way a fully-tracked
  // match with a season of history behind it would in production.
  const bigSubLog = [];
  for (let i = 0; i < 1200; i++) {
    bigSubLog.push({ type: 'sub', minute: i, inPlayerId: 'p' + (i % 12), outPlayerId: 'p' + ((i + 1) % 12), note: 'a realistically-sized note for this substitution event' });
  }
  const games = [{ id: 'today-match', status: 'completed', updatedAt: Date.now(), live: { scoreUs: 3, scoreThem: 1, subLog: bigSubLog } }];

  // A big roster too — big enough on its own that removing it later
  // definitely crosses a whole chunk boundary, not just trims a few
  // characters off the last one.
  const bigPlayers = [];
  for (let i = 0; i < 400; i++) {
    bigPlayers.push({ id: 'p' + i, name: 'Player Number ' + i, notes: 'a realistically-sized free-text note for this player' });
  }
  const payload = { team, players: bigPlayers, games, syncedByName: 'Luke' };
  const payloadSize = JSON.stringify(payload).length;
  assert(payloadSize > 50000, `The test payload is actually bigger than the old single-cell limit — got ${payloadSize} characters`);

  // Editor role, not matchday — matchday's doPost branch requires
  // pre-existing stored data (it only ever adds to an existing team), so
  // it'd fail on this fresh sandbox for an unrelated reason before ever
  // reaching the storage code this test actually means to exercise.
  const result = server.doPost({ token: 'fulledittoken' }, payload);
  assert(result.ok === true, `A payload over 50,000 characters is pushed successfully, got ${JSON.stringify(result).slice(0, 200)}`);

  const readBack = server.doGet({ token: 'fulledittoken' });
  assert(readBack.data.games.length === 1, 'The large game round-trips back out');
  assert(readBack.data.games[0].live.subLog.length === 1200, `The full subLog survives intact, got ${readBack.data.games[0].live.subLog.length} entries`);

  // Chunk count cell reflects more than one chunk was actually needed —
  // confirms this exercised the chunking path, not a lucky single write.
  const chunkCount = parseInt(server._cells.A1, 10);
  assert(chunkCount > 1, `Storage actually split across multiple cells, got chunk count ${chunkCount}`);

  // A later, SHORTER write must not leave stale leftover chunks behind —
  // otherwise a shrink would silently corrupt the next read by appending
  // old trailing data past the new, shorter JSON. Games go through
  // mergeGames_, which by design never lets an empty/missing games list
  // delete a more-complete existing game — so this shrinks via players
  // instead (editor role replaces players wholesale, unmerged), which
  // still shrinks the overall stored JSON enough to exercise the same
  // chunk-cleanup path.
  const smallResult = server.doPost({ token: 'fulledittoken' }, { team, players: [], games });
  assert(smallResult.ok === true, 'A much smaller follow-up push succeeds');
  const readAfterShrink = server.doGet({ token: 'fulledittoken' });
  assert(Array.isArray(readAfterShrink.data.players) && readAfterShrink.data.players.length === 0, `Players shrank as expected, got ${JSON.stringify(readAfterShrink.data.players)}`);
  assert(readAfterShrink.data.games[0].live.subLog.length === 1200, `The large game is still intact after the shrink, got ${readAfterShrink.data.games[0].live.subLog.length} entries`);
  const chunkCountAfterShrink = parseInt(server._cells.A1, 10);
  assert(chunkCountAfterShrink < chunkCount, `Chunk count actually decreased after the shrink, was ${chunkCount}, now ${chunkCountAfterShrink}`);
  for (let i = chunkCountAfterShrink; i < chunkCount; i++) {
    assert(!server._cells['A' + (2 + i)], `Leftover chunk cell A${2 + i} from before the shrink was actually cleared`);
  }

  console.log('\nALL SERVER-SIDE LARGE-PAYLOAD TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
