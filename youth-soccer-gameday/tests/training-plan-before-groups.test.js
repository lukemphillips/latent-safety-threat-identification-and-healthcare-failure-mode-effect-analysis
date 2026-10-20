// Requested: "Training plan should come first. Be able to select training
// rotations without sorting teams." A coach often wants to plan out a
// session's stations/activities days ahead, before knowing who's coming or
// how they'll be split into groups. Previously the Plan tab's "Each group
// does something different" + rotation/stations UI was entirely disabled
// (select disabled, no listeners wired, mode silently forced back to
// 'whole' on submit) until groups existed on the Groups tab — making this
// impossible. Covers: Plan is the first tab and the session's default
// landing tab, a brand-new training session with zero groups can still
// build a full rotation/stations plan block, and a non-rotating per-group
// block still correctly asks for groups to be built first (that one
// genuinely needs named groups to exist).
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

  // ============ A brand-new training session lands on Plan first, before Attendance/Groups/Matches ============
  await page.goto(BASE + '/index.html#/training');
  await page.click('[data-action="add-training"]');
  await page.waitForSelector('#training-form');
  await page.click('#training-form button[type="submit"]');
  await page.waitForFunction(() => location.hash.includes('/plan'));
  await page.waitForSelector('.tabs a.tab');
  const tabOrder = await page.$$eval('.tabs a.tab', (els) => els.map((e) => e.textContent.trim()));
  assert(JSON.stringify(tabOrder) === JSON.stringify(['Plan', 'Attendance', 'Groups', 'Matches']), `Tabs are ordered Plan first, got: ${JSON.stringify(tabOrder)}`);
  assert((await page.locator('a.tab.active').innerText()) === 'Plan', 'Plan is the active/landing tab on a fresh session');

  // ============ No attendance marked, no groups built — confirm that's really the state here ============
  const trainingId = page.url().split('/training/')[1].split('/')[0];
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  let training = state.trainings.find((t) => t.id === trainingId);
  assert((training.presentIds || []).length === 0, 'No one marked present yet');
  assert((training.groups || []).length === 0, 'No groups built yet');

  // ============ A rotation/stations block can still be fully built with zero groups ============
  await page.click('[data-action="add-block"]');
  await page.waitForSelector('#block-form');
  await page.fill('#block-form [name="minutes"]', '12');

  const modeSelect = page.locator('#block-form [name="mode"]');
  assert(!(await modeSelect.isDisabled()), 'Activity type select is not disabled just because no groups exist yet');
  await modeSelect.selectOption('grouped');
  await page.waitForTimeout(80);
  assert(await page.locator('[data-grouped-fields]').isVisible(), 'Grouped fields actually become visible after picking it, even with no groups');

  const rotateCheckbox = page.locator('#block-form [name="rotate"]');
  await rotateCheckbox.check();
  await page.waitForTimeout(80);
  assert(await page.locator('[data-stations-fields]').isVisible(), 'Stations UI shows once rotation is turned on');

  // One station exists by default (a convenient blank starting point even with 0 groups) — fill it, then add a second.
  const stationInputs = () => page.locator('[data-stations-list] input[type="text"]');
  assert((await stationInputs().count()) === 1, 'Starts with one blank station when there are no groups to seed from');
  await stationInputs().nth(0).fill('Dribbling gates');
  await page.click('[data-action="add-station"]');
  await page.waitForTimeout(80);
  assert((await stationInputs().count()) === 2, 'A second station can be added with no groups built');
  await stationInputs().nth(1).fill('Passing triangles');

  await page.click('#block-form button[type="submit"]');
  await page.waitForTimeout(150);

  state = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  training = state.trainings.find((t) => t.id === trainingId);
  assert(training.blocks.length === 1, `The rotation block actually saved, got ${training.blocks.length} blocks`);
  const block = training.blocks[0];
  assert(block.mode === 'grouped', `Block saved with mode='grouped' (not silently forced back to 'whole'), got "${block.mode}"`);
  assert(block.rotate === true, 'Block saved with rotate=true');
  assert(block.stations.length === 2, `Both stations persisted, got ${JSON.stringify(block.stations)}`);
  assert(block.stations.map((s) => s.activity).join(', ') === 'Dribbling gates, Passing triangles', `Station activities persisted correctly, got: ${JSON.stringify(block.stations)}`);

  // ============ The per-group (non-rotating) sub-mode still correctly asks for real groups ============
  await page.click('[data-action="add-block"]');
  await page.waitForSelector('#block-form');
  await page.selectOption('#block-form [name="mode"]', 'grouped');
  await page.waitForTimeout(80);
  const perGroupHint = await page.locator('[data-per-group-fields]').innerText();
  assert(perGroupHint.includes('Build groups on the Groups tab'), `Per-group (non-rotating) mode still explains it needs real groups, got: ${perGroupHint}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING-PLAN-BEFORE-GROUPS TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
