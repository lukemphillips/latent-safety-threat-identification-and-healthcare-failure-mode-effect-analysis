// Coverage for a few small Settings > Data safety improvements requested
// after a real data-loss incident this session:
//   1. "Reload Sample Data" — a first-run demo shortcut — disappears once
//      a coach has actually entered their own team, so it can't silently
//      replace real work.
//   2. "Clear All Data" now snapshots an auto-backup of whatever's about
//      to be destroyed first, so confirming it isn't irreversible.
//   3. Restore From Backup accepts a picked .json file, not just paste.
const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

function countAutoBackups(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ysg-auto-backups-v1');
    const list = raw ? JSON.parse(raw) : [];
    return list.length;
  });
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

  // ============ 1. Visible on a genuinely fresh app ============
  assert(await page.$('[data-action="reset-sample"]'), '"Reload Sample Data" is shown before any team is entered');

  // ============ Enter a real team by hand (not via the sample-data button) ============
  await page.fill('input[name="name"]', 'Real Team FC');
  await page.click('#team-form button[type="submit"]');
  await page.waitForTimeout(150);

  // ============ 1. Hidden once real team data exists ============
  await page.goto(BASE + '/index.html#/settings');
  assert(!(await page.$('[data-action="reset-sample"]')), '"Reload Sample Data" is hidden once a real team has been entered');
  assert(await page.$('[data-action="clear-data"]'), '"Clear All Data" stays available regardless');

  // ============ 2. Clear All Data snapshots a safety-net backup first ============
  const countBeforeClear = await countAutoBackups(page);
  assert(countBeforeClear === 0, `No auto-backups yet from just entering a team name, got ${countBeforeClear}`);
  await page.click('[data-action="clear-data"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);
  const countAfterClear = await countAutoBackups(page);
  assert(countAfterClear === 1, `Clear All Data created a safety-net auto-backup, got ${countAfterClear}`);
  const backupSnapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-auto-backups-v1'))[0].data);
  assert(backupSnapshot.team.name === 'Real Team FC', `The snapshot actually captured the team about to be wiped, got ${JSON.stringify(backupSnapshot.team)}`);

  // Team's gone from the app now, and Reload Sample Data is back.
  await page.goto(BASE + '/index.html#/settings');
  assert(await page.$('[data-action="reset-sample"]'), '"Reload Sample Data" reappears once the team is actually gone');

  // ============ 3. Restore From Backup accepts a picked JSON file ============
  const backupJson = JSON.stringify({ team: { name: 'Restored From File FC' }, players: [], games: [] });
  // "Backups & data management" is a collapsed <details> when there's
  // nothing yet to back up (true right after Clear All Data) — expand it
  // rather than relying on whatever state left it open.
  await page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
  await page.click('[data-action="restore-data"]');
  await page.waitForSelector('#restore-form');
  await page.setInputFiles('#restore-file-input', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backupJson) });
  await page.waitForFunction(() => document.querySelector('textarea[name="backup"]').value.includes('Restored From File FC'));
  await page.click('#restore-form button[type="submit"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(150);
  await page.goto(BASE + '/index.html#/settings');
  const restoredName = await page.inputValue('input[name="name"]');
  assert(restoredName === 'Restored From File FC', `Restoring via a picked file actually applied it, got "${restoredName}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SETTINGS DATA-SAFETY TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
