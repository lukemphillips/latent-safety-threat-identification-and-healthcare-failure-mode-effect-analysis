const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(BASE + '/index.html');

  // Load sample data so we have a roster with skill streams to work with.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.waitForSelector('text=Reload Sample Data', { timeout: 5000 }).catch(() => {});
  const reloadBtn = await page.$('text=Reload Sample Data');
  assert(reloadBtn, 'Reload Sample Data button exists in Settings');
  await reloadBtn.click();
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(300);

  // Nav to Training list.
  await page.goto(BASE + '/index.html#/training');
  await page.waitForSelector('h1:has-text("Training")');
  const navTrainingVisible = await page.$('#nav a:has-text("Training")');
  assert(navTrainingVisible, 'Training appears in bottom nav');

  const upcomingCards = await page.$$('a.card[href^="#/training/"]');
  assert(upcomingCards.length >= 1, 'Seeded training session shows in list, found ' + upcomingCards.length);

  // Add a new training session.
  await page.click('[data-action="add-training"]');
  await page.waitForSelector('#training-form');
  await page.fill('#training-form [name="location"]', 'Test Ground');
  await page.click('#training-form button[type="submit"]');
  await page.waitForFunction(() => location.hash.includes('/attendance'));
  const url = page.url();
  const trainingId = url.split('/training/')[1].split('/')[0];
  console.log('New training id:', trainingId);

  // Attendance tab: mark all present.
  await page.waitForSelector('[data-action="mark-all-present"]');
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(150);
  const presentCountText = await page.textContent('.muted.small');
  console.log('Attendance summary:', presentCountText);

  // Go to Groups tab, auto-build groups.
  await page.click(`a.tab:has-text("Groups")`);
  await page.waitForSelector('[data-action="auto-build-groups"]');
  await page.click('[data-action="auto-build-groups"]');
  await page.waitForTimeout(150);
  const groupCards = await page.$$('[data-group-player]');
  assert(groupCards.length > 0, 'Groups were built with players assigned, found ' + groupCards.length);

  const groupTitles = await page.$$eval('[data-group-card] > div[style*="margin-bottom:6px"] > div[style*="font-weight:700"]', (els) => els.map((e) => e.textContent));
  console.log('Groups built:', groupTitles);
  assert(groupTitles.length >= 2, 'At least 2 groups were auto-built, found ' + groupTitles.length);

  // Manually move a player from the first group to the second group.
  const firstGroupPlayerBtn = await page.$('[data-group-player]');
  const firstGroupPlayerId = await firstGroupPlayerBtn.getAttribute('data-group-player');
  const sourceGroupId = await firstGroupPlayerBtn.getAttribute('data-source-group');
  await firstGroupPlayerBtn.click();
  await page.waitForSelector('[data-move-to-group]');
  const moveButtons = await page.$$('[data-move-to-group]');
  assert(moveButtons.length >= 1, 'A "Move here" target group button appears after selecting a player');
  const targetGroupId = await moveButtons[0].getAttribute('data-move-to-group');
  await moveButtons[0].click();
  await page.waitForTimeout(150);

  // Verify persistence via localStorage.
  const stateAfterMove = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const trainingObj = stateAfterMove.trainings.find((t) => t.groups.some((g) => g.id === targetGroupId));
  const targetGroup = trainingObj.groups.find((g) => g.id === targetGroupId);
  const sourceGroup = trainingObj.groups.find((g) => g.id === sourceGroupId);
  assert(targetGroup.playerIds.includes(firstGroupPlayerId), 'Moved player now appears in target group in localStorage');
  assert(!sourceGroup.playerIds.includes(firstGroupPlayerId), 'Moved player no longer appears in source group in localStorage');

  // Go to Plan tab, add a whole-team block and a grouped block.
  await page.click(`a.tab:has-text("Plan")`);
  await page.waitForSelector('[data-action="add-block"]');
  await page.click('[data-action="add-block"]');
  await page.waitForSelector('#block-form');
  await page.fill('#block-form [name="minutes"]', '15');
  await page.fill('#block-form [name="activity"]', 'Warm-up jog');
  await page.click('#block-form button[type="submit"]');
  await page.waitForTimeout(150);

  await page.click('[data-action="add-block"]');
  await page.waitForSelector('#block-form');
  await page.fill('#block-form [name="minutes"]', '20');
  await page.selectOption('#block-form [name="mode"]', 'grouped');
  await page.waitForTimeout(100);
  const groupInputs = await page.$$('[data-per-group-fields] input[type="text"]');
  assert(groupInputs.length >= 2, 'Grouped block form shows one input per group, found ' + groupInputs.length);
  for (let i = 0; i < groupInputs.length; i++) {
    await groupInputs[i].fill('Drill ' + i);
  }
  await page.click('#block-form button[type="submit"]');
  await page.waitForTimeout(150);

  const blockCards = await page.$$('#tab-content > .stack > .card');
  assert(blockCards.length === 2, 'Two plan blocks are now listed, found ' + blockCards.length);

  const totalsText = await page.textContent('.spread .muted.small');
  console.log('Plan totals:', totalsText);
  assert(totalsText.includes('35 min'), 'Plan total shows 35 minutes combined, got: ' + totalsText);

  // Verify final persisted shape.
  const finalState = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const finalTraining = finalState.trainings.find((t) => t.id === trainingId);
  assert(finalTraining, 'New training persisted in localStorage under its id');
  assert(finalTraining.blocks.length === 2, 'Both blocks persisted, found ' + finalTraining.blocks.length);
  assert(finalTraining.blocks[0].mode === 'whole' && finalTraining.blocks[0].activity === 'Warm-up jog', 'Whole-team block persisted correctly');
  assert(finalTraining.blocks[1].mode === 'grouped', 'Grouped block persisted with mode=grouped');
  const groupActivityValues = Object.values(finalTraining.blocks[1].groupActivities);
  assert(groupActivityValues.every((v) => v.startsWith('Drill')), 'Grouped block activities persisted per group: ' + JSON.stringify(finalTraining.blocks[1].groupActivities));

  // Reload the page (full refresh, not hash nav) and confirm everything survives.
  await page.reload();
  await page.waitForSelector('h1:has-text("Training")');
  const blockCardsAfterReload = await page.$$('#tab-content > .stack > .card');
  assert(blockCardsAfterReload.length === 2, 'Plan blocks survive a full page reload');

  console.log('\nConsole/page errors captured:', consoleErrors.length ? consoleErrors : 'none');
  assert(consoleErrors.length === 0, 'No console/page errors during the full training flow');

  await browser.close();
  console.log('\nALL TRAINING FLOW TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
