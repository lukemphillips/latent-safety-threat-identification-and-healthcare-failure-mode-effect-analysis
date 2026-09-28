// Reported failure: "Could not reach Cloud Sync" on a manual Sync Now,
// even though the exact same link loaded fine as a plain GET pasted
// directly into a browser. That GET never exercises doPost's games
// merge at all — direct browser navigation also isn't subject to CORS,
// unlike the app's own cross-origin fetch(). If a POST's real data ever
// hits something mergeGames_ didn't anticipate and throws, Apps Script
// returns its own error page instead of JSON — and that page doesn't
// carry the CORS header a cross-origin fetch() needs, so the browser
// throws a plain network error indistinguishable from a real connection
// problem, for what was actually a bug in the script.
//
// This proves two things using the REAL generated script (not a
// reimplementation): doGet/doPost never let an exception escape
// uncaught (always valid JSON back, even from malformed input), and
// mergeGames_ specifically tolerates the kind of malformed game data
// that would previously have thrown (missing ids, non-array games,
// unexpected shapes).
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

  const team = { name: 'Test FC' };
  const players = [{ id: 'p1', name: 'Player One' }];

  // ============ Seed the sheet normally first ============
  const server = createAppsScriptSandbox(script);
  const seedResult = server.doPost({ token: 'fulledittoken' }, { team, players, games: [{ id: 'g1', status: 'scheduled', updatedAt: 1000 }] });
  assert(seedResult.ok, 'Normal seed push succeeds');

  // ============ A game missing an id doesn't throw ============
  const idlessResult = server.doPost({ token: 'fulledittoken' }, {
    team, players,
    games: [{ id: 'g1', status: 'completed', updatedAt: 2000, live: { subLog: [] } }, { status: 'scheduled' }],
  });
  assert(idlessResult.ok === true, `A game missing an id doesn't crash the push, got ${JSON.stringify(idlessResult)}`);
  const afterIdless = server.doGet({ token: 'fulledittoken' }).data;
  assert(afterIdless.games.some((g) => g.id === 'g1' && g.status === 'completed'), 'The valid game in that same push still merges correctly');
  assert(afterIdless.games.length === 2, `The id-less game is carried through rather than silently dropped, got ${afterIdless.games.length} games`);

  // ============ Completely garbage "games" values in the posted payload don't throw ============
  const garbageCases = [
    { label: 'games contains null', games: [null, { id: 'g1', status: 'completed', updatedAt: 3000 }] },
    { label: 'games contains a string', games: ['not a game object', { id: 'g1', status: 'completed', updatedAt: 3000 }] },
    { label: 'a game has no status at all', games: [{ id: 'g2' }] },
    { label: 'a game has live but no subLog', games: [{ id: 'g3', status: 'live', live: {} }] },
  ];
  for (const { label, games } of garbageCases) {
    const result = server.doPost({ token: 'fulledittoken' }, { team, players, games });
    assert(result.ok === true || typeof result.error === 'string', `${label}: server still returns valid JSON (ok or a real error message), got ${JSON.stringify(result)}`);
    assert(result.error === undefined, `${label}: doesn't actually error out, got ${JSON.stringify(result)}`);
  }

  // ============ A Matchday push with the same kind of malformed games also survives ============
  const matchdayResult = server.doPost({ token: 'matchdaytoken' }, { team, players, games: [{ status: 'live' }, { id: 'g4', status: 'completed', updatedAt: 4000 }] });
  assert(matchdayResult.ok === true, `Matchday push with a malformed entry still succeeds, got ${JSON.stringify(matchdayResult)}`);

  // ============ An invalid token still returns a clean JSON error, never throws ============
  const badTokenResult = server.doPost({ token: 'not-a-real-token' }, { team, players, games: [] });
  assert(badTokenResult.error === 'Invalid or missing Cloud Sync link.', `Bad token gets the expected clean error, got ${JSON.stringify(badTokenResult)}`);

  // ============ doGet is equally hardened ============
  const getResult = server.doGet({ token: 'fulledittoken' });
  assert(getResult.role === 'editor' && Array.isArray(getResult.data.games), 'A normal GET still works after all the above');

  console.log('\nALL SERVER-SIDE ERROR-HANDLING TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
