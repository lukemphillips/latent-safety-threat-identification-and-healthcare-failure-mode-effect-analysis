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
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  const countAfterSeed = await countAutoBackups(page);
  assert(countAfterSeed === 0, `No auto-backups exist yet right after seeding sample data, got ${countAfterSeed}`);

  // ============ Creating a new drill triggers an auto-backup ============
  await page.goto(BASE + '/index.html#/drills');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-drill"]');
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="name"]', 'Cone Weave Test Drill');
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);

  let count = await countAutoBackups(page);
  assert(count === 1, `Saving a new drill created an auto-backup, got count=${count}`);

  // ============ Editing an existing drill triggers another auto-backup ============
  const state1 = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const newDrill = state1.drills.find((d) => d.name === 'Cone Weave Test Drill');
  await page.goto(BASE + '/index.html#/drills');
  await page.waitForTimeout(150);
  await page.click(`[data-action="edit-drill"][data-drill-id="${newDrill.id}"]`);
  await page.waitForSelector('#drill-form');
  await page.fill('#drill-form [name="description"]', 'Updated description for backup test.');
  await page.click('#drill-form button[type="submit"]');
  await page.waitForTimeout(200);

  count = await countAutoBackups(page);
  assert(count === 2, `Editing a drill created another auto-backup, got count=${count}`);

  // ============ Creating a new training session triggers an auto-backup ============
  await page.goto(BASE + '/index.html#/training');
  await page.waitForTimeout(150);
  await page.click('[data-action="add-training"]');
  await page.waitForSelector('#training-form');
  await page.click('#training-form button[type="submit"]');
  await page.waitForTimeout(300);

  count = await countAutoBackups(page);
  assert(count === 3, `Saving a new training session created another auto-backup, got count=${count}`);

  // ============ Ending a live training session triggers another auto-backup ============
  const state2 = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const newTraining = state2.trainings[state2.trainings.length - 1];

  // "Start Session" only renders once the plan has at least one block — add
  // one directly via the store (same shape openBlockForm would save) so the
  // test isn't also depending on that form's own selectors.
  await page.evaluate(async (trainingId) => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      const t = s.trainings.find((x) => x.id === trainingId);
      t.blocks.push({ id: 'test-block-1', minutes: 10, activity: 'Warm-up', isBreak: false });
    });
  }, newTraining.id);

  await page.goto(`${BASE}/index.html#/training/${newTraining.id}/plan`);
  await page.waitForTimeout(200);
  const startLiveBtn = await page.$('[data-action="start-live"]');
  assert(!!startLiveBtn, 'Found the Start Session button once the plan has a block');
  await startLiveBtn.click();
  await page.waitForTimeout(200);
  const endLiveBtn = await page.$('[data-action="end-live"]');
  assert(!!endLiveBtn, 'Found the End Session button after starting the live session');
  await endLiveBtn.click();
  // confirmDialog in this app is a custom in-page modal, not a native confirm — click its own OK button.
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(300);

  count = await countAutoBackups(page);
  assert(count === 4, `Ending a live training session created another auto-backup, got count=${count}`);

  // ============ The backup actually contains the drill and training data ============
  const backups = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-auto-backups-v1')));
  const latest = backups[backups.length - 1];
  assert(latest.data.drills.some((d) => d.name === 'Cone Weave Test Drill'), 'Latest auto-backup snapshot includes the new drill');
  assert(latest.data.trainings.some((t) => t.id === newTraining.id), 'Latest auto-backup snapshot includes the new training session');

  // ============ Settings page copy mentions training/drill saves ============
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForTimeout(150);
  const settingsText = await page.textContent('#app');
  assert(settingsText.includes('training session is saved or ended, or a drill is saved'), 'Settings > Data copy describes the new backup triggers');
  const rows = await page.$$('[data-action="restore-auto-backup"]');
  assert(rows.length === 4, `Settings > Data lists all 4 auto-backups with Restore buttons, got ${rows.length}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING/DRILL AUTO-BACKUP TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
