const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

async function startFirstScheduledGame(page) {
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const scheduledGame = state.games.find((g) => g.status === 'scheduled');
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/lineup`);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="auto-fill-lineup"]');
  await page.waitForTimeout(150);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}`);
  await page.waitForSelector('[data-action="start-game"]');
  await page.click('[data-action="start-game"]');
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/index.html#/game/${scheduledGame.id}/live`);
  await page.waitForTimeout(200);
  return scheduledGame.id;
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

  // Enable cards so we can log BOTH a straight red and an injury in the
  // same match, and prove they render with different icons.
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[name="enableCards"]');
  await page.check('[name="enableCards"]');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(200);

  const gameId = await startFirstScheduledGame(page);

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let freshGame = state.games.find((g) => g.id === gameId);
  const [redPlayerId, injuryPlayerId] = freshGame.live.onField;

  // Straight red card.
  await page.click(`[data-action="log-card"][data-player-id="${redPlayerId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'red');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  // Injury removal (no card).
  await page.click(`[data-action="log-card"][data-player-id="${injuryPlayerId}"]`);
  await page.waitForSelector('#card-form');
  await page.selectOption('#card-form [name="kind"]', 'injury');
  await page.click('#card-form button[type="submit"]');
  await page.waitForTimeout(200);

  const rows = await page.$$eval('.sublog-item', (els) => els.map((e) => e.querySelector('span').textContent.trim()));
  const redRow = rows.find((t) => t.includes('Red card:'));
  const injuryRow = rows.find((t) => t.includes('Sent off:') && t.includes('(injury)'));

  assert(!!redRow, `Found the red card's own event row: ${JSON.stringify(rows)}`);
  assert(!!injuryRow, `Found the injury send-off's own event row: ${JSON.stringify(rows)}`);
  assert(redRow.startsWith('🟥'), `Red card row starts with the red-card emoji, got "${redRow}"`);
  assert(injuryRow.startsWith('🚑'), `Injury row starts with the ambulance emoji (NOT 🟥), got "${injuryRow}"`);
  assert(!injuryRow.startsWith('🟥'), `Injury row must NOT be rendered with the red-card icon, got "${injuryRow}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL INJURY-ICON TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
