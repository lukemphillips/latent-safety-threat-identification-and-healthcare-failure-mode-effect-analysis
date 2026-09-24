const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
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

  // Simulate a device connected to Cloud Sync as Matchday-role — the role
  // a Full Edit coach hands to assistant coaches, which the Apps Script
  // silently refuses to let edit any field on an existing player.
  await page.evaluate(() => {
    localStorage.setItem('ysg-cloud-sync-v1', JSON.stringify({
      url: 'https://example.com/exec?token=matchdaytoken',
      role: 'matchday',
      coachName: 'Assistant Coach',
      lastSyncedAt: new Date().toISOString(),
    }));
  });

  await page.goto(BASE + '/index.html#/balance');
  await page.waitForSelector('table');

  const firstAllocInput = await page.$('input[data-team-alloc]');
  assert(!!firstAllocInput, 'Team Allocation input is present on the Squad table');
  const isDisabled = await firstAllocInput.evaluate((el) => el.disabled);
  assert(isDisabled, 'Team Allocation input is disabled on a Matchday-role device (would silently fail to sync otherwise)');

  const bodyText = await page.textContent('#app');
  assert(bodyText.includes('Team allocation can only be changed from a Full Edit device'), 'Explains why the field is locked on this device');

  // A Full Edit (unconnected / no Cloud Sync) device still gets a live,
  // editable field — this guard must not lock it down for everyone.
  await page.evaluate(() => localStorage.removeItem('ysg-cloud-sync-v1'));
  await page.reload();
  await page.waitForSelector('table');
  const editableInput = await page.$('input[data-team-alloc]');
  const stillEnabled = await editableInput.evaluate((el) => !el.disabled);
  assert(stillEnabled, 'Team Allocation input stays editable on a device with no Cloud Sync / Full Edit role');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL BALANCE-TEAMS MATCHDAY TEAM-ALLOCATION GUARD TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
