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

function clockToSeconds(text) {
  const [mm, ss] = text.trim().split(':').map(Number);
  return mm * 60 + ss;
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

  const roundCardIsSticky = await page.evaluate(() => !!document.querySelector('.match-round-card'));
  assert(roundCardIsSticky, 'The Match Timer & Score card carries the sticky class so it stays pinned while scrolling');

  const teamCountBuilt = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchTeams.length;
  });
  assert(teamCountBuilt === 2, `Two match teams were built, got ${teamCountBuilt}`);

  // The scoreboard lives in the timer card itself and isn't tied to either
  // built team's identity — just two generic counters (indices 0/1).
  assert(!!(await page.$('[data-action="round-score-inc"][data-score-index="0"]')), 'Score A +1 button exists in the round card');
  assert(!!(await page.$('[data-action="round-score-inc"][data-score-index="1"]')), 'Score B +1 button exists in the round card');
  assert(!(await page.$('[data-team-id]')), 'No score control is scoped to a specific team id anymore');

  // ============ Score a few goals before the clock even starts ============
  await page.click('[data-action="round-score-inc"][data-score-index="0"]');
  await page.click('[data-action="round-score-inc"][data-score-index="0"]');
  await page.click('[data-action="round-score-inc"][data-score-index="1"]');
  await page.waitForTimeout(100);
  const scoresAfterTaps = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.scores;
  });
  assert(scoresAfterTaps[0] === 2 && scoresAfterTaps[1] === 1, `Scores recorded correctly (2-1), got ${JSON.stringify(scoresAfterTaps)}`);

  const decSelector = '[data-action="round-score-dec"][data-score-index="1"]';
  await page.click(decSelector);
  await page.waitForTimeout(100);
  const scoreAfterDec = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.scores[1] || 0;
  });
  assert(scoreAfterDec === 0, `"−" undoes a mis-tap, got ${scoreAfterDec}`);
  const decBtnDisabled = await page.isDisabled(decSelector);
  assert(decBtnDisabled, 'The "−" button disables itself once a counter is back at 0');

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
  const elapsedBeforeNav = 60 - clockToSeconds(clockAfterTicks);

  // ============ The clock keeps running while navigating clean away from ============
  // ============ Training entirely, same as the Plan timer and a live match ============
  await page.goto(`${BASE}/index.html#/`);
  await page.waitForTimeout(2200);
  const stillRunningAway = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.running;
  });
  assert(stillRunningAway, 'The round keeps running (in state) while on a completely different screen');

  await page.goto(`${BASE}/index.html#/training/${trainingId}/matches`);
  await page.waitForTimeout(150);
  const clockAfterNav = await page.textContent('[data-match-round-clock]');
  const elapsedAfterNav = 60 - clockToSeconds(clockAfterNav);
  assert(elapsedAfterNav > elapsedBeforeNav + 1, `Elapsed time actually advanced while away (not just resumed on return), went from ~${elapsedBeforeNav}s to ~${elapsedAfterNav}s`);
  const toggleLabelAfterNav = (await page.textContent('[data-action="round-toggle"]')).trim();
  assert(toggleLabelAfterNav.includes('Pause'), `Still shows as running after coming back, got "${toggleLabelAfterNav}"`);

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
  assert((afterReset.scores[0] || 0) === 0 && (afterReset.scores[1] || 0) === 0, `Reset clears both scores, got ${JSON.stringify(afterReset.scores)}`);
  assert(afterReset.elapsedSeconds === 0, 'Reset zeroes the clock');
  assert(afterReset.durationSeconds === 60, 'Reset keeps the round length the coach set (1 min), not the original default');
  assert(afterReset.teamCount === 2, 'Reset does not rebuild or remove the match teams');

  // ============ Randomize Again also clears the scoreboard ============
  await page.click('[data-action="round-score-inc"][data-score-index="0"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="build-matches"]');
  await page.waitForTimeout(150);
  const afterRebuild = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.scores;
  });
  assert((afterRebuild[0] || 0) === 0 && (afterRebuild[1] || 0) === 0, `Randomize Again clears the scoreboard, got ${JSON.stringify(afterRebuild)}`);

  // ============ Score display works fine with 3 teams built (no per-team binding) ============
  await page.evaluate(() => {
    const el = document.querySelector('#match-team-count');
    el.value = '3';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('[data-action="build-matches"]');
  await page.waitForTimeout(150);
  const teamCountAfter3 = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchTeams.length;
  });
  assert(teamCountAfter3 === 3, `3 match teams built, got ${teamCountAfter3}`);
  await page.click('[data-action="round-score-inc"][data-score-index="0"]');
  await page.waitForTimeout(100);
  const scoreWith3Teams = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().trainings[0].matchRound.scores[0];
  });
  assert(scoreWith3Teams === 1, `The generic scoreboard still works fine with 3 teams built, got ${scoreWith3Teams}`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL TRAINING MATCH-ROUND TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
