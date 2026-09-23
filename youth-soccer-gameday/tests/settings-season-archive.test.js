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

  // Seed a mix of old-completed, recent-completed, and scheduled/live games
  // plus a couple of trainings, via the real store module (not a raw
  // localStorage write) so the in-memory singleton stays in sync.
  await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      s.games.push(
        { id: 'old-completed', date: '2024-01-01', time: '10:00', opponent: 'Old FC', isHome: true, status: 'completed', rsvps: {}, presentIds: [], live: { subLog: [] } },
        { id: 'recent-completed', date: '2026-08-01', time: '10:00', opponent: 'Recent FC', isHome: true, status: 'completed', rsvps: {}, presentIds: [], live: { subLog: [] } },
        { id: 'still-scheduled', date: '2024-01-02', time: '10:00', opponent: 'Old Scheduled FC', isHome: true, status: 'scheduled', rsvps: {}, presentIds: [] },
        { id: 'still-live', date: '2024-01-03', time: '10:00', opponent: 'Old Live FC', isHome: true, status: 'live', rsvps: {}, presentIds: [], live: { subLog: [], running: false, elapsedSeconds: 0 } },
      );
      s.trainings.push(
        { id: 'old-training', date: '2024-01-01', time: '18:00', location: '', presentIds: [], groups: [], blocks: [], completedAt: '2024-01-01T19:00:00.000Z' },
        { id: 'recent-training', date: '2026-08-01', time: '18:00', location: '', presentIds: [], groups: [], blocks: [], completedAt: '2026-08-01T19:00:00.000Z' },
      );
    });
  });

  await page.reload();
  await page.waitForTimeout(150);

  // ============ Nothing archived by default (no cutoff picked) ============
  let summaryText = await page.textContent('#archive-cutoff-date').catch(() => null);
  const copyBtnDisabledBefore = await page.getAttribute('[data-action="copy-archive"]', 'disabled');
  assert(copyBtnDisabledBefore !== null, 'Copy Archive button starts disabled with no cutoff date chosen');

  // ============ Picking a cutoff shows the correct, safe count ============
  await page.fill('#archive-cutoff-date', '2025-01-01');
  await page.dispatchEvent('#archive-cutoff-date', 'change');
  await page.waitForTimeout(150);

  const summary = await page.textContent('.card .muted.small');
  const cardsText = await page.textContent('#app');
  assert(cardsText.includes('1 match and 1 training session completed before 2025-01-01'), `Summary counts exactly the one old completed match and one old training, excludes the scheduled/live ones regardless of date, got context: ${cardsText.match(/Would archive[^.]*\./)}`);

  const copyBtnDisabledAfter = await page.getAttribute('[data-action="copy-archive"]', 'disabled');
  assert(copyBtnDisabledAfter === null, 'Copy Archive button enables once something is eligible');

  // ============ Copying reveals the Remove button, and the payload is correct ============
  await page.click('[data-action="copy-archive"]');
  await page.waitForTimeout(150);
  // The fallback textarea's content is always rendered fresh from the
  // current cutoff date (see settings.js), so it holds the right JSON
  // regardless of whether the clipboard write itself succeeded.
  const archiveJsonText = await page.inputValue('#archive-fallback');
  const archivePayload = JSON.parse(archiveJsonText);
  assert(archivePayload.games.length === 1 && archivePayload.games[0].id === 'old-completed', `Archive payload contains exactly the one old completed game, got ${JSON.stringify(archivePayload.games.map((g) => g.id))}`);
  assert(archivePayload.trainings.length === 1 && archivePayload.trainings[0].id === 'old-training', `Archive payload contains exactly the one old training, got ${JSON.stringify(archivePayload.trainings.map((t) => t.id))}`);

  const removeBtn = await page.$('[data-action="remove-archived"]');
  assert(!!removeBtn, 'Remove button appears once the archive has been copied');

  // ============ Changing the date invalidates the stale "copied" state ============
  await page.fill('#archive-cutoff-date', '2025-06-01');
  await page.dispatchEvent('#archive-cutoff-date', 'change');
  await page.waitForTimeout(150);
  const removeBtnAfterDateChange = await page.$('[data-action="remove-archived"]');
  assert(!removeBtnAfterDateChange, 'Remove button disappears again after changing the cutoff date (stale copy no longer matches)');

  // Re-copy for the new date before removing.
  await page.click('[data-action="copy-archive"]');
  await page.waitForTimeout(150);

  // ============ Removing actually deletes only the archived items ============
  await page.click('[data-action="remove-archived"]');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  const stateAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('ysg-data-v2')));
  const gameIdsAfter = stateAfter.games.map((g) => g.id);
  const trainingIdsAfter = stateAfter.trainings.map((t) => t.id);
  assert(!gameIdsAfter.includes('old-completed'), 'Old completed game was removed');
  assert(gameIdsAfter.includes('recent-completed'), 'Recent completed game (after cutoff) survives');
  assert(gameIdsAfter.includes('still-scheduled'), 'Old but still-scheduled game survives (never archived regardless of date)');
  assert(gameIdsAfter.includes('still-live'), 'Old but still-live game survives (never archived regardless of date)');
  assert(!trainingIdsAfter.includes('old-training'), 'Old training session was removed');
  assert(trainingIdsAfter.includes('recent-training'), 'Recent training session (after cutoff) survives');

  // Players/team/drills untouched.
  assert(stateAfter.players.length === 12, `Roster untouched by archiving, got ${stateAfter.players.length}`);
  assert(stateAfter.drills.length > 0, 'Drill library untouched by archiving');

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SEASON-ARCHIVE TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
