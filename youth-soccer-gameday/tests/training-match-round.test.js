const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

async function setRoundMinutes(page, minutes) {
  await page.evaluate((mins) => {
    const el = document.querySelector('#round-minutes');
    el.value = String(mins);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, minutes);
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

  const trainingId = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].id;
  });

  await page.goto(`${BASE}/index.html#/training/${trainingId}/attendance`);
  await page.waitForTimeout(150);
  await page.click('[data-action="mark-all-present"]');
  await page.waitForTimeout(100);

  await page.goto(`${BASE}/index.html#/training/${trainingId}/matches`);
  await page.waitForTimeout(150);

  // No round timer/scoreboard until teams actually exist.
  assert(!(await page.$('[data-match-round-clock]')), 'No round timer before any match teams are built');

  await page.click('[data-action="build-matches"]');
  await page.waitForTimeout(150);

  assert(!!(await page.$('[data-match-round-clock]')), 'Round timer/scoreboard appears once match teams exist');
  const clockTextDefault = await page.textContent('[data-match-round-clock]');
  assert(clockTextDefault.trim() === '10:00', `Default round length is 10:00, got "${clockTextDefault.trim()}"`);

  const teamIds = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchTeams.map((t) => t.id);
  });
  assert(teamIds.length === 2, `Two match teams were built, got ${teamIds.length}`);

  // ============ Score a few goals before the clock even starts ============
  await page.click(`[data-action="round-score-inc"][data-team-id="${teamIds[0]}"]`);
  await page.click(`[data-action="round-score-inc"][data-team-id="${teamIds[0]}"]`);
  await page.click(`[data-action="round-score-inc"][data-team-id="${teamIds[1]}"]`);
  await page.waitForTimeout(100);
  const scoresAfterTaps = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.scores;
  });
  assert(Object.values(scoresAfterTaps).sort().join(',') === '1,2', `Scores recorded correctly (2-1), got ${JSON.stringify(scoresAfterTaps)}`);

  const decSelector = `[data-action="round-score-dec"][data-team-id="${teamIds[1]}"]`;
  await page.click(decSelector);
  await page.waitForTimeout(100);
  const scoreAfterDec = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.scores[id] || 0;
  }, teamIds[1]);
  assert(scoreAfterDec === 0, `"−" undoes a mis-tap, got ${scoreAfterDec}`);
  const decBtnDisabled = await page.isDisabled(decSelector);
  assert(decBtnDisabled, 'The "−" button disables itself once a team is back at 0');

  // ============ Shorten the round so the countdown test stays fast ============
  await setRoundMinutes(page, 1);
  await page.waitForTimeout(100);
  const clockAfterMinutesChange = await page.textContent('[data-match-round-clock]');
  assert(clockAfterMinutesChange.trim() === '01:00', `Changing round length updates the clock display, got "${clockAfterMinutesChange.trim()}"`);

  await page.click('[data-action="round-toggle"]');
  await page.waitForTimeout(150);
  const minutesInputDisabledWhileRunning = await page.isDisabled('#round-minutes');
  assert(minutesInputDisabledWhileRunning, 'Round length can\'t be edited mid-round');
  const toggleLabelWhileRunning = (await page.textContent('[data-action="round-toggle"]')).trim();
  assert(toggleLabelWhileRunning.includes('Pause'), `Button reads Pause while running, got "${toggleLabelWhileRunning}"`);

  // Let two real ticks pass and confirm the clock actually counted down —
  // this exercises the real main.js 1-second ticker, not a mocked timer.
  await page.waitForTimeout(2200);
  const clockAfterTicks = await page.textContent('[data-match-round-clock]');
  assert(['00:57', '00:58'].includes(clockAfterTicks.trim()), `Clock counted down after ~2s, got "${clockAfterTicks.trim()}"`);

  // ============ Pause actually stops the clock, not just the label ============
  await page.click('[data-action="round-toggle"]');
  await page.waitForTimeout(100);
  const clockAtPause = await page.textContent('[data-match-round-clock]');
  await page.waitForTimeout(1500);
  const clockStillAtPause = await page.textContent('[data-match-round-clock]');
  assert(clockAtPause.trim() === clockStillAtPause.trim(), `Pausing actually freezes the clock, got "${clockAtPause.trim()}" then "${clockStillAtPause.trim()}"`);
  const minutesInputEnabledWhilePaused = !(await page.isDisabled('#round-minutes'));
  assert(minutesInputEnabledWhilePaused, 'Round length is editable again once paused');

  // ============ Fast-forward to the buzzer via state, confirm auto-stop ============
  await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    mod.update((s) => {
      const t = s.trainings[0];
      t.matchRound.elapsedSeconds = t.matchRound.durationSeconds - 1;
      t.matchRound.running = true;
    });
  });
  await page.waitForTimeout(1300);
  const finishedState = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const t = mod.getState().trainings[0];
    return { running: t.matchRound.running, elapsedSeconds: t.matchRound.elapsedSeconds, durationSeconds: t.matchRound.durationSeconds };
  });
  assert(finishedState.running === false, 'Round auto-stops once time runs out');
  assert(finishedState.elapsedSeconds === finishedState.durationSeconds, `Elapsed clamps to the round length, got ${finishedState.elapsedSeconds}/${finishedState.durationSeconds}`);
  await page.waitForSelector('text=⏰ Time!');

  // ============ Reset clears clock + scores but keeps the same teams ============
  await page.click('[data-action="round-reset"]');
  await page.waitForTimeout(100);
  const afterReset = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const t = mod.getState().trainings[0];
    return { scores: t.matchRound.scores, elapsedSeconds: t.matchRound.elapsedSeconds, durationSeconds: t.matchRound.durationSeconds, teamCount: t.matchTeams.length };
  });
  assert(Object.keys(afterReset.scores).length === 0, `Reset clears scores, got ${JSON.stringify(afterReset.scores)}`);
  assert(afterReset.elapsedSeconds === 0, 'Reset zeroes the clock');
  assert(afterReset.durationSeconds === 60, 'Reset keeps the round length the coach set (1 min), not the original default');
  assert(afterReset.teamCount === 2, 'Reset does not rebuild or remove the match teams');

  // ============ Randomize Again also clears the scoreboard (new team ids) ============
  await page.click(`[data-action="round-score-inc"][data-team-id="${teamIds[0]}"]`);
  await page.waitForTimeout(100);
  await page.click('[data-action="build-matches"]');
  await page.waitForTimeout(150);
  const afterRebuild = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const t = mod.getState().trainings[0];
    return { scores: t.matchRound.scores, teamIds: t.matchTeams.map((x) => x.id) };
  });
  assert(Object.keys(afterRebuild.scores).length === 0, `Randomize Again clears the scoreboard, got ${JSON.stringify(afterRebuild.scores)}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING MATCH-ROUND TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
