// Guardian name/phone were removed from the roster entirely — the club
// already holds that elsewhere (its registration system), and keeping a
// copy here meant it flowed through Cloud Sync's Google Sheet (not
// disclosed there) and was readable by anyone holding a Matchday link,
// not just Full Edit. Covers: the fields are gone from the Add/Edit Player
// form, and any already-stored copy (local, or pulled from the cloud) gets
// stripped on load rather than lingering forever.
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

  // ============ 1. Add/Edit Player form no longer has guardian fields ============
  await page.goto(BASE + '/index.html#/roster');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-player"]');
  await page.waitForSelector('#player-form');
  assert(!(await page.$('[name="guardianName"]')), 'No "Guardian name" field on Add Player');
  assert(!(await page.$('[name="guardianPhone"]')), 'No "Guardian phone" field on Add Player');
  const formText = await page.textContent('#player-form');
  assert(!formText.includes('Guardian'), `No mention of "Guardian" anywhere in the form, got: ${formText}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ============ 2. A player with legacy guardian data gets it stripped on load ============
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ysg-data-v2'));
    raw.players[0].guardianName = 'Old Guardian Name';
    raw.players[0].guardianPhone = '555-0100';
    localStorage.setItem('ysg-data-v2', JSON.stringify(raw));
  });
  await page.reload();
  const afterLoad = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const p = mod.getState().players[0];
    return { hasName: 'guardianName' in p, hasPhone: 'guardianPhone' in p };
  });
  assert(!afterLoad.hasName && !afterLoad.hasPhone, `Legacy guardian fields are stripped on load, got ${JSON.stringify(afterLoad)}`);

  // Confirms it's actually gone from what gets persisted too, not just the
  // in-memory view — reload again and check the raw stored JSON itself.
  await page.reload();
  const rawAfterReload = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('ysg-data-v2'));
    return { hasName: 'guardianName' in raw.players[0], hasPhone: 'guardianPhone' in raw.players[0] };
  });
  assert(!rawAfterReload.hasName && !rawAfterReload.hasPhone, `Stripped fields don't come back via localStorage round-trip, got ${JSON.stringify(rawAfterReload)}`);

  // ============ 3. A player pulled FROM the cloud also gets it stripped ============
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  const localPlayerId = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().players[0].id;
  });

  await page.route('https://fake-apps-script.example.com/exec*', (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      route.fulfill({
        json: {
          role: 'editor',
          data: {
            team: { name: 'Cloud Team', squadFormat: 7 },
            players: [{ id: localPlayerId, name: 'Synced Player', jerseyNumber: 9, positions: [], guardianName: 'Cloud Guardian', guardianPhone: '555-0199', active: true }],
            games: [],
            trainings: [],
            deletedGameIds: [],
            deletedPlayerIds: [],
          },
          meta: { updatedAt: new Date().toISOString() },
        },
      });
    } else {
      route.fulfill({ json: { role: 'editor', data: null, meta: null } });
    }
  });

  await page.evaluate(() => {
    localStorage.setItem('ysg-cloud-sync-v1', JSON.stringify({
      url: 'https://fake-apps-script.example.com/exec?token=fulledittoken',
      role: 'editor',
      coachName: 'Head Coach',
      lastSyncedAt: new Date().toISOString(),
    }));
  });
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('[data-action="cloud-sync-now"]');
  await page.click('[data-action="cloud-sync-now"]');
  await page.waitForTimeout(300);

  const pulledPlayer = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().players.find((p) => p.id === id);
  }, localPlayerId);
  assert(pulledPlayer.name === 'Synced Player', 'The player pulled from the cloud was actually adopted');
  assert(!('guardianName' in pulledPlayer) && !('guardianPhone' in pulledPlayer), `Guardian fields on an incoming cloud player are stripped too, got ${JSON.stringify(pulledPlayer)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL ROSTER REMOVE-GUARDIAN-CONTACT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
