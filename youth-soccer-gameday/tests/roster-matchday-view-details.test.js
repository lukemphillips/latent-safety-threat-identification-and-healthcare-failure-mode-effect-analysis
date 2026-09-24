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

  // Give a player a note and a position to confirm they actually show up.
  const targetPlayer = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const s = mod.getState();
    const p = s.players[0];
    mod.update((state) => {
      const pl = state.players.find((x) => x.id === p.id);
      pl.notes = 'Allergic to peanuts';
      pl.positions = ['MID'];
    });
    return p;
  });

  // Simulate a Matchday-role device.
  await page.evaluate(() => {
    localStorage.setItem('ysg-cloud-sync-v1', JSON.stringify({
      url: 'https://fake-apps-script.example.com/exec?token=matchdaytoken',
      role: 'matchday',
      coachName: 'Assistant Coach',
      lastSyncedAt: new Date().toISOString(),
    }));
  });
  await page.route('https://fake-apps-script.example.com/exec*', (route) => {
    route.fulfill({ json: { role: 'matchday', data: null, meta: null } });
  });
  await page.reload();

  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click(`[data-action="edit-player"][data-id="${targetPlayer.id}"]`);
  await page.waitForTimeout(150);

  const editForm = await page.$('#player-form');
  assert(!editForm, 'Clicking a player on a Matchday device does not open the editable form');

  const modalText = await page.textContent('.modal-body');
  assert(modalText.includes('Allergic to peanuts'), `Notes are visible read-only, got: ${modalText}`);
  assert(modalText.includes('MID'), `Position is visible read-only, got: ${modalText}`);
  assert(modalText.includes('View only on this device'), 'Explains this view is read-only here');
  assert(!(await page.$('#player-form input[name="notes"], textarea[name="notes"]')), 'No editable notes field is present');

  // A Full Edit device (no Cloud Sync config) still gets the real editable form.
  await page.evaluate(() => localStorage.removeItem('ysg-cloud-sync-v1'));
  await page.reload();
  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click(`[data-action="edit-player"][data-id="${targetPlayer.id}"]`);
  await page.waitForSelector('#player-form');
  assert(await page.$('textarea[name="notes"]'), 'A Full Edit device still gets the editable Notes field');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL ROSTER MATCHDAY VIEW-DETAILS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
