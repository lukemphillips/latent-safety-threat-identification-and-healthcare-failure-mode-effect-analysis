import { getState, update, findGame } from '../store.js';
import { escapeHtml, formatClock, formatDate, periodLabel, matchTypeBadgeHtml } from '../util.js';
import { outfieldTargetCount } from '../formations.js';
import { violatedRules } from '../rules.js';
import { openModal, closeModal, confirmDialog, alertDialog } from '../modal.js';

let selectingInboundId = null;
let lastGameId = null;

export function renderLiveGame(app, gameId) {
  if (lastGameId !== gameId) {
    selectingInboundId = null;
    lastGameId = gameId;
  }

  const game = findGame(gameId);
  if (!game || !game.live) {
    app.innerHTML = `<p class="empty">No live data for this game yet. <a href="#/game/${gameId}">Back to game</a></p>`;
    return undefined;
  }

  const { players, team, games } = getState();
  const active = players.filter((p) => p.active);
  const byId = Object.fromEntries(active.map((p) => [p.id, p]));
  const live = game.live;
  const isCompleted = game.status === 'completed';
  const targetOutfield = outfieldTargetCount(team.squadFormat);
  const nextMatch = games.find((g) => g.date === game.date && g.id !== game.id && g.status === 'scheduled');
  const hasCarryover = games.some((g) => g.id !== game.id && g.date === game.date && g.live);

  const presentIds = new Set(game.presentIds || []);
  const sentOffIds = new Set(live.sentOff || []);
  const currentGkId = live.gkByPeriod[live.currentPeriod] || null;
  const onFieldOutfield = live.onField.map((id) => byId[id]).filter(Boolean);
  const currentGk = currentGkId ? byId[currentGkId] : null;
  const bench = active.filter((p) => presentIds.has(p.id) && !sentOffIds.has(p.id)
    && !live.onField.includes(p.id) && p.id !== currentGkId);
  const sentOffPlayers = (live.sentOff || []).map((id) => byId[id]).filter(Boolean);

  const onPitchPool = [...onFieldOutfield, ...(currentGk ? [currentGk] : [])];

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)}</h1>
        <div class="sub">${formatDate(game.date)} · ${isCompleted ? 'Final' : periodLabel(team, live.currentPeriod)}</div>
        <div style="margin-top:6px;">${matchTypeBadgeHtml(game)}</div>
      </div>
      <a class="icon-btn" href="#/game/${game.id}" aria-label="Back to game">✕</a>
    </div>

    ${!isCompleted ? `<a class="btn ghost sm" href="#/game/${game.id}/lineup" style="margin-bottom:12px; display:inline-flex;">👤 Squad tab — add a late arrival</a>` : ''}

    <div class="card timer-card">
      <div class="timer-display">${formatClock(live.elapsedSeconds)}</div>
      <div class="muted small">${isCompleted ? 'Full time' : periodLabel(team, live.currentPeriod) + ` · ${team.periodMinutes} min`}</div>

      <div class="score-board">
        <div class="score-team">
          <div class="label">Us</div>
          <div class="value">${live.scoreUs}</div>
          ${isCompleted ? '' : `<div class="score-controls"><button class="btn sm secondary" data-action="log-goal-us">⚽ Log Goal</button></div>`}
        </div>
        <div style="font-size:20px; font-weight:700; color:var(--ink-soft);">–</div>
        <div class="score-team">
          <div class="label">${escapeHtml(game.opponent)}</div>
          <div class="value">${live.scoreThem}</div>
          ${isCompleted ? '' : `<div class="score-controls"><button class="btn sm ghost" data-action="log-goal-them">+1</button></div>`}
        </div>
      </div>

      ${isCompleted ? '' : `
        <div class="timer-actions">
          <button class="btn big ${live.running ? 'secondary' : ''}" data-action="toggle-run">${live.running ? '⏸ Pause' : '▶ Start'} Clock</button>
        </div>
        <div class="timer-actions">
          <button class="btn ghost sm" data-action="log-save">🧤 GK Save</button>
          ${live.currentPeriod < team.numPeriods
            ? `<button class="btn secondary sm" data-action="next-period">Next: ${periodLabel(team, live.currentPeriod + 1)}</button>`
            : ''}
        </div>
        <div class="timer-actions">
          <button class="btn danger" data-action="end-game">End Game</button>
          ${nextMatch ? `<button class="btn secondary" data-action="next-match">🏁 End &amp; Next: ${escapeHtml(nextMatch.opponent)}</button>` : ''}
        </div>
        ${!nextMatch ? `<div class="muted small" style="margin-top:4px;">Playing a second match today? <a href="#/game/${game.id}">Add a match day opponent</a> to get an "End &amp; Next" button here.</div>` : ''}
      `}
    </div>

    ${!isCompleted && live.elapsedSeconds >= team.periodMinutes * 60 * live.currentPeriod && live.currentPeriod < team.numPeriods
      ? `<div class="banner warn spread"><span>⏱ Time's up for ${periodLabel(team, live.currentPeriod)}.</span><button class="btn sm" data-action="next-period">Start ${periodLabel(team, live.currentPeriod + 1)}</button></div>`
      : ''}

    ${goalkeeperCardHtml(team, live, currentGk, isCompleted)}

    ${!isCompleted ? fairPlaySuggestionHtml(team, live, bench, onFieldOutfield, byId) : ''}

    ${!isCompleted && selectingInboundId ? `
      <div class="banner info spread">
        <span>🔵 Bringing on: <strong>${escapeHtml(byId[selectingInboundId]?.name || '')}</strong> — tap an on-field player to swap${onFieldOutfield.length < targetOutfield ? ', or add to an open spot' : ''}.</span>
        <button class="btn sm ghost" data-action="cancel-sub">Cancel</button>
      </div>
      ${onFieldOutfield.length < targetOutfield ? `<button class="btn secondary block" data-action="add-to-pitch" style="margin-bottom:10px;">⬆ Add to Pitch (no swap)</button>` : ''}
    ` : ''}

    <div class="section-title">On Field (${onFieldOutfield.length}${isCompleted ? '' : ` / ${targetOutfield} target`})</div>
    <div class="onfield-grid">
      ${onFieldOutfield.length ? onFieldOutfield.map((p) => fieldCardHtml(p, live, isCompleted, true, team)).join('') : '<span class="muted small">No one is on the field.</span>'}
    </div>

    ${!isCompleted ? `
      <div class="section-title">Bench (${bench.length})</div>
      <div class="onfield-grid">
        ${bench.length ? bench.map((p) => benchCardHtml(p, live)).join('') : '<span class="muted small">No one available on the bench.</span>'}
      </div>
    ` : ''}

    ${sentOffPlayers.length ? `
      <div class="section-title">Sent Off</div>
      <div class="card"><span class="small">${sentOffPlayers.map((p) => escapeHtml(p.name)).join(', ')}</span></div>
    ` : ''}

    <div class="section-title">Playing Time</div>
    ${hasCarryover ? '<div class="muted small" style="margin:-6px 0 8px;">Includes minutes from earlier match(es) today, so fair-play suggestions stay balanced across the whole match day.</div>' : ''}
    <div class="card">
      ${playingTimeRows(active, live, presentIds)}
    </div>

    ${live.subLog.length ? `
      <div class="section-title">Match Events</div>
      <div class="card">
        ${live.subLog.slice().reverse().map((entry) => eventRowHtml(entry, team)).join('')}
      </div>
    ` : ''}
  `;

  if (!isCompleted) {
    app.querySelector('[data-action="toggle-run"]').addEventListener('click', () => {
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.live.running = !g.live.running;
      });
    });

    app.querySelector('[data-action="log-goal-us"]').addEventListener('click', () => openGoalModal(gameId, onPitchPool));
    app.querySelector('[data-action="log-goal-them"]').addEventListener('click', () => {
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.live.scoreThem += 1;
        g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'goal-them' });
      });
    });
    app.querySelector('[data-action="log-save"]').addEventListener('click', () => openSaveModal(gameId, onPitchPool, currentGkId, live.elapsedSeconds));

    const gkChangeBtn = app.querySelector('[data-action="change-gk"]');
    if (gkChangeBtn) gkChangeBtn.addEventListener('click', () => openGkModal(gameId, active, presentIds, sentOffIds, live.currentPeriod, false));
    const gkAssignBtn = app.querySelector('[data-action="assign-gk"]');
    if (gkAssignBtn) gkAssignBtn.addEventListener('click', () => openGkModal(gameId, active, presentIds, sentOffIds, live.currentPeriod, false));

    const nextPeriodBtns = app.querySelectorAll('[data-action="next-period"]');
    nextPeriodBtns.forEach((btn) => btn.addEventListener('click', () => openGkModal(gameId, active, presentIds, sentOffIds, live.currentPeriod + 1, true)));

    app.querySelector('[data-action="end-game"]').addEventListener('click', async () => {
      const msg = live.currentPeriod < team.numPeriods
        ? `You're still in ${periodLabel(team, live.currentPeriod)}. End the game early?`
        : 'End the game? Final score and playing time will be locked in.';
      if (!(await confirmDialog(msg, { okLabel: 'End Game' }))) return;
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.status = 'completed';
        g.live.running = false;
      });
    });

    const nextMatchBtn = app.querySelector('[data-action="next-match"]');
    if (nextMatchBtn) {
      nextMatchBtn.addEventListener('click', async () => {
        if (!(await confirmDialog(`End this match and move on to ${nextMatch.opponent}? Final score and playing time will be locked in, and fair-play minutes will carry over into the next match.`, { okLabel: 'End & Next' }))) return;
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          g.status = 'completed';
          g.live.running = false;
          const next = state.games.find((x) => x.id === nextMatch.id);
          if (next && !(next.presentIds || []).length) {
            next.presentIds = [...(g.presentIds || [])];
            next.lineup = { slots: { ...g.lineup.slots } };
          }
        });
        location.hash = `#/game/${nextMatch.id}/lineup`;
      });
    }

    const suggestBtn = app.querySelector('[data-action="use-suggestion"]');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => {
        applySub(gameId, suggestBtn.dataset.inId, suggestBtn.dataset.outId, byId, team);
      });
    }

    app.querySelectorAll('[data-action="send-off"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.playerId;
        const player = byId[playerId];
        if (!(await confirmDialog(`Send off ${player?.name}? They'll be unavailable for the rest of the match.`, { okLabel: 'Send Off', danger: true }))) return;
        update((state) => {
          removePlayerFromPlay(state, gameId, playerId);
          const g = state.games.find((x) => x.id === gameId);
          g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'send-off', playerId, name: player?.name || '' });
        });
        if (selectingInboundId === playerId) selectingInboundId = null;
      });
    });

    app.querySelectorAll('[data-action="log-card"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.playerId;
        openCardModal(gameId, byId[playerId]);
        if (selectingInboundId === playerId) selectingInboundId = null;
      });
    });

    app.querySelectorAll('[data-bench-player]').forEach((el) => {
      el.addEventListener('click', () => {
        const playerId = el.dataset.benchPlayer;
        selectingInboundId = selectingInboundId === playerId ? null : playerId;
        renderLiveGame(app, gameId);
      });
    });

    const cancelBtn = app.querySelector('[data-action="cancel-sub"]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { selectingInboundId = null; renderLiveGame(app, gameId); });

    const addBtn = app.querySelector('[data-action="add-to-pitch"]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const inId = selectingInboundId;
        const inName = byId[inId]?.name || '';
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          g.live.onField.push(inId);
          g.live.stintStart = g.live.stintStart || {};
          g.live.stintStart[inId] = g.live.elapsedSeconds;
          g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'add', inId, inName });
        });
        selectingInboundId = null;
      });
    }

    app.querySelectorAll('[data-onfield-player]').forEach((el) => {
      el.addEventListener('click', () => {
        if (!selectingInboundId) return;
        applySub(gameId, selectingInboundId, el.dataset.onfieldPlayer, byId, team);
      });
    });
  }

  return undefined;
}

function removePlayerFromPlay(state, gameId, playerId) {
  const g = state.games.find((x) => x.id === gameId);
  g.live.onField = g.live.onField.filter((id) => id !== playerId);
  Object.keys(g.live.gkByPeriod).forEach((period) => {
    if (g.live.gkByPeriod[period] === playerId) g.live.gkByPeriod[period] = null;
  });
  g.live.sentOff = [...new Set([...(g.live.sentOff || []), playerId])];
}

function stintSeconds(live, playerId) {
  const startedAt = (live.stintStart || {})[playerId] ?? 0;
  return Math.max(0, live.elapsedSeconds - startedAt);
}

async function applySub(gameId, inId, outId, byId, team) {
  const game = findGame(gameId);
  const minStintSeconds = (team.minStintMinutes ?? 4) * 60;
  const outStint = stintSeconds(game.live, outId);
  if (minStintSeconds > 0 && outStint < minStintSeconds) {
    const msg = `${byId[outId]?.name} has only been on for ${formatClock(outStint)} this stint (minimum ${team.minStintMinutes ?? 4} min). Sub anyway?`;
    if (!(await confirmDialog(msg, { okLabel: 'Sub Anyway' }))) return;
  }

  const currentBench = new Set(
    getState().players.filter((p) => p.active && (game.presentIds || []).includes(p.id)
      && !(game.live.sentOff || []).includes(p.id) && !game.live.onField.includes(p.id)
      && p.id !== game.live.gkByPeriod[game.live.currentPeriod]).map((p) => p.id)
  );
  const wouldBeBenched = new Set(currentBench);
  wouldBeBenched.delete(inId);
  wouldBeBenched.add(outId);
  const violations = violatedRules(team, wouldBeBenched, byId);
  if (violations.length) {
    const msg = violations.map((v) => `${v.nameA} & ${v.nameB}`).join(', ');
    if (!(await confirmDialog(`This substitution leaves both players benched in a "keep one on" rule: ${msg}. Continue anyway?`, { okLabel: 'Continue Anyway' }))) return;
  }

  const inName = byId[inId]?.name || '';
  const outName = byId[outId]?.name || '';
  update((state) => {
    const g = state.games.find((x) => x.id === gameId);
    g.live.onField = g.live.onField.filter((id) => id !== outId);
    g.live.onField.push(inId);
    g.live.stintStart = g.live.stintStart || {};
    g.live.stintStart[inId] = g.live.elapsedSeconds;
    g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'sub', inId, inName, outId, outName });
  });
  selectingInboundId = null;
}

function goalkeeperCardHtml(team, live, currentGk, isCompleted) {
  const periods = Array.from({ length: team.numPeriods }, (_, i) => i + 1);
  const stint = currentGk ? stintSeconds(live, currentGk.id) : null;
  return `
    <div class="card">
      <div class="spread">
        <div>
          <div class="muted small">Goalkeeper — ${periodLabel(team, live.currentPeriod)}</div>
          <div style="font-weight:700; font-size:15px;">${currentGk ? escapeHtml(currentGk.name) : '⚠️ Not set'}</div>
          ${currentGk && !isCompleted ? `<div class="muted small">Stint: ${formatClock(stint)}</div>` : ''}
        </div>
        <div class="row">
          ${!isCompleted && currentGk && team.enableCards ? `<button class="btn danger sm" data-action="log-card" data-player-id="${currentGk.id}">Card</button>` : ''}
          ${!isCompleted ? `<button class="btn sm ${currentGk ? 'ghost' : ''}" data-action="${currentGk ? 'change-gk' : 'assign-gk'}">${currentGk ? 'Change' : 'Assign'}</button>` : ''}
        </div>
      </div>
      ${periods.length > 1 ? `<div class="muted small" style="margin-top:8px;">${periods.map((n) => `${periodLabel(team, n)}: ${live.gkByPeriod[n] ? escapeHtml((getState().players.find((p) => p.id === live.gkByPeriod[n]) || {}).name || '?') : '—'}`).join(' · ')}</div>` : ''}
    </div>
  `;
}

function fairPlaySuggestionHtml(team, live, bench, onFieldOutfield, byId) {
  if (!team.equalPlayingTimePolicy) return '';
  if (!bench.length || !onFieldOutfield.length) return '';

  const minStintSeconds = (team.minStintMinutes ?? 4) * 60;
  const restEligible = onFieldOutfield.filter((p) => stintSeconds(live, p.id) >= minStintSeconds);
  if (!restEligible.length) {
    return `<div class="banner info">⚖️ Everyone on the pitch is still within their minimum ${team.minStintMinutes ?? 4}-min stint.</div>`;
  }

  const time = (p) => live.playingTime[p.id] || 0;
  const leastOnBench = [...bench].sort((a, b) => time(a) - time(b))[0];
  const mostOnField = [...restEligible].sort((a, b) => time(b) - time(a))[0];
  const gap = time(mostOnField) - time(leastOnBench);

  if (gap <= 60) {
    return `<div class="banner info">⚖️ Playing time looks balanced right now.</div>`;
  }

  return `
    <div class="banner warn">
      <div class="spread">
        <span>⚖️ Fair-play suggestion: bring on <strong>${escapeHtml(leastOnBench.name)}</strong> (${formatClock(time(leastOnBench))}) for <strong>${escapeHtml(mostOnField.name)}</strong> (${formatClock(time(mostOnField))})</span>
      </div>
      <button class="btn sm secondary" style="margin-top:8px;" data-action="use-suggestion" data-in-id="${leastOnBench.id}" data-out-id="${mostOnField.id}">Use Suggestion</button>
    </div>
  `;
}

function fieldCardHtml(p, live, isCompleted, isOnField, team) {
  const seconds = live.playingTime[p.id] || 0;
  const clickable = !isCompleted && selectingInboundId;
  const stint = isOnField ? stintSeconds(live, p.id) : null;
  const minStintSeconds = (team?.minStintMinutes ?? 4) * 60;
  const stintLine = isOnField
    ? `<div class="pt">${stint < minStintSeconds ? '🔒' : ''} Stint: ${formatClock(stint)}</div>`
    : '';
  const cardAction = team?.enableCards
    ? `<button type="button" class="btn danger sm" style="margin-top:6px;" data-action="log-card" data-player-id="${p.id}">Card / Remove</button>`
    : `<button type="button" class="btn danger sm" style="margin-top:6px;" data-action="send-off" data-player-id="${p.id}">Send Off</button>`;
  return `
    <div class="field-card ${clickable ? 'subbing' : ''}" ${clickable ? `data-onfield-player="${p.id}" style="cursor:pointer;"` : ''}>
      <div class="row spread">
        <span class="jersey" style="width:26px;height:26px;font-size:12px;">${p.jerseyNumber ?? '-'}</span>
        <span class="small muted">${isOnField ? 'On field' : 'Bench'}</span>
      </div>
      <div style="font-weight:700; font-size:13.5px; margin-top:4px;">${escapeHtml(p.name)}</div>
      <div class="pt">⏱ ${formatClock(seconds)}</div>
      ${stintLine}
      ${!isCompleted ? cardAction : ''}
    </div>
  `;
}

function benchCardHtml(p, live) {
  const seconds = live.playingTime[p.id] || 0;
  const selected = selectingInboundId === p.id;
  return `
    <button type="button" class="field-card ${selected ? 'selected-in' : ''}" data-bench-player="${p.id}" style="text-align:left; cursor:pointer;">
      <div class="row spread">
        <span class="jersey" style="width:26px;height:26px;font-size:12px;">${p.jerseyNumber ?? '-'}</span>
        <span class="small muted">Bench</span>
      </div>
      <div style="font-weight:700; font-size:13.5px; margin-top:4px;">${escapeHtml(p.name)}</div>
      <div class="pt">⏱ ${formatClock(seconds)}</div>
    </button>
  `;
}

function playingTimeRows(active, live, presentIds) {
  const rows = active
    .filter((p) => presentIds.has(p.id))
    .map((p) => ({ p, seconds: live.playingTime[p.id] || 0 }))
    .sort((a, b) => b.seconds - a.seconds);
  const max = Math.max(1, ...rows.map((r) => r.seconds));

  if (!rows.length) return '<div class="empty">No players tracked.</div>';

  return rows.map(({ p, seconds }) => `
    <div style="margin-bottom:10px;">
      <div class="spread small" style="margin-bottom:3px;">
        <span>${escapeHtml(p.name)}</span>
        <span class="muted">${formatClock(seconds)}</span>
      </div>
      <div style="background:var(--line); border-radius:6px; height:7px; overflow:hidden;">
        <div style="background:var(--green-500); height:100%; width:${Math.round((seconds / max) * 100)}%;"></div>
      </div>
    </div>
  `).join('');
}

const EVENT_ICONS = {
  'goal-us': '⚽', 'goal-them': '🥅', save: '🧤', sub: '🔄', add: '⬆️',
  'send-off': '🟥', 'period-start': '⏱', 'gk-change': '🧤',
};

function eventRowHtml(entry, team) {
  const icon = entry.type === 'card' ? (entry.cardType === 'red' ? '🟥' : '🟨') : (EVENT_ICONS[entry.type] || '•');
  let label = '';
  switch (entry.type) {
    case 'goal-us':
      label = `Goal! ${escapeHtml(entry.scorerName || 'Unknown')}${entry.assistName ? ` (A: ${escapeHtml(entry.assistName)})` : ''}`;
      break;
    case 'goal-them':
      label = `Goal (opponent)`;
      break;
    case 'save':
      label = `GK save${entry.name ? ` — ${escapeHtml(entry.name)}` : ' (open play)'}`;
      break;
    case 'sub':
      label = `Sub: ${escapeHtml(entry.inName)} on, ${escapeHtml(entry.outName)} off`;
      break;
    case 'add':
      label = `${escapeHtml(entry.inName)} added to pitch`;
      break;
    case 'send-off':
      label = `Sent off: ${escapeHtml(entry.name)}`;
      break;
    case 'card':
      label = `${entry.cardType === 'red' ? 'Red' : 'Yellow'} card: ${escapeHtml(entry.name)}`;
      break;
    case 'period-start':
      label = `${periodLabel(team, entry.period)} started`;
      break;
    case 'gk-change':
      label = `Goalkeeper: ${escapeHtml(entry.inName)} on${entry.outName ? `, ${escapeHtml(entry.outName)} off` : ''} (${periodLabel(team, entry.period)})`;
      break;
    default:
      label = entry.type;
  }
  return `
    <div class="sublog-item">
      <span>${icon} ${label}</span>
      <span class="muted">${formatClock(entry.atSeconds)}</span>
    </div>
  `;
}

function openGoalModal(gameId, pool) {
  if (!pool.length) {
    alertDialog('No one is on the pitch yet to credit with a goal.');
    return;
  }
  const options = (excludeId) => `<option value="">— none —</option>` + pool
    .filter((p) => p.id !== excludeId)
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  openModal({
    title: 'Log Goal',
    bodyHtml: `
      <form id="goal-form" class="stack">
        <div class="field">
          <label>Who scored?</label>
          <select name="scorer" required>
            <option value="" disabled selected>Select player</option>
            ${pool.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Assist (optional)</label>
          <select name="assist">${options()}</select>
        </div>
        <button type="submit" class="btn block">Log Goal</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#goal-form');
      const scorerSelect = form.querySelector('[name="scorer"]');
      const assistSelect = form.querySelector('[name="assist"]');
      scorerSelect.addEventListener('change', () => {
        assistSelect.innerHTML = options(scorerSelect.value);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const scorerId = fd.get('scorer');
        const assistId = fd.get('assist') || null;
        if (!scorerId) return;
        const scorer = pool.find((p) => p.id === scorerId);
        const assist = assistId ? pool.find((p) => p.id === assistId) : null;
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          g.live.scoreUs += 1;
          g.live.subLog.push({
            atSeconds: g.live.elapsedSeconds, type: 'goal-us',
            scorerId, scorerName: scorer?.name || '',
            assistId: assist?.id || null, assistName: assist?.name || '',
          });
        });
        closeModal();
      });
    },
  });
}

function openSaveModal(gameId, pool, currentGkId, elapsedSeconds) {
  openModal({
    title: 'GK Save',
    bodyHtml: `
      <form id="save-form" class="stack">
        <div class="field">
          <label>Who made the save?</label>
          <select name="player">
            <option value="">Open play (no specific player)</option>
            ${pool.map((p) => `<option value="${p.id}" ${p.id === currentGkId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Minute (optional — blank uses the clock)</label>
          <input type="number" name="minute" min="0" placeholder="${Math.floor(elapsedSeconds / 60)}" />
        </div>
        <button type="submit" class="btn block">Log Save</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#save-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const playerId = fd.get('player') || null;
        const player = playerId ? pool.find((p) => p.id === playerId) : null;
        const minuteOverride = fd.get('minute') ? Number(fd.get('minute')) * 60 : null;
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          g.live.subLog.push({
            atSeconds: minuteOverride ?? g.live.elapsedSeconds, type: 'save',
            playerId, name: player?.name || '',
          });
        });
        closeModal();
      });
    },
  });
}

function openCardModal(gameId, player) {
  if (!player) return;
  openModal({
    title: `Card — ${escapeHtml(player.name)}`,
    bodyHtml: `
      <form id="card-form" class="stack">
        <div class="field">
          <label>What happened?</label>
          <select name="kind">
            <option value="yellow">🟨 Yellow card (logged, stays on)</option>
            <option value="red">🟥 Red card (logged, removed from the match)</option>
            <option value="other">Removed — other reason (injury, etc.), no card</option>
          </select>
        </div>
        <button type="submit" class="btn block">Log</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#card-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const kind = new FormData(e.target).get('kind');
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          if (kind === 'yellow') {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'card', cardType: 'yellow', playerId: player.id, name: player.name });
            return;
          }
          removePlayerFromPlay(state, gameId, player.id);
          if (kind === 'red') {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'card', cardType: 'red', playerId: player.id, name: player.name });
          } else {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'send-off', playerId: player.id, name: player.name });
          }
        });
        closeModal();
      });
    },
  });
}

function openGkModal(gameId, active, presentIds, sentOffIds, targetPeriod, advancePeriod) {
  const game = findGame(gameId);
  const eligible = active.filter((p) => presentIds.has(p.id) && !sentOffIds.has(p.id));
  const currentGkId = game.live.gkByPeriod[targetPeriod] || game.live.gkByPeriod[game.live.currentPeriod] || null;

  openModal({
    title: advancePeriod ? `Confirm Goalkeeper` : `Change Goalkeeper`,
    bodyHtml: `
      <form id="gk-form" class="stack">
        ${advancePeriod ? `<p class="muted small mt-0">Starting a new period pauses the clock. Confirm or change who's in goal.</p>` : ''}
        <div class="field">
          <label>Goalkeeper</label>
          <select name="gk" required>
            <option value="" disabled ${!currentGkId ? 'selected' : ''}>Select player</option>
            ${eligible.map((p) => `<option value="${p.id}" ${p.id === currentGkId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn block">${advancePeriod ? 'Confirm & Continue' : 'Save'}</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#gk-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newGkId = fd.get('gk');
        if (!newGkId) return;
        const newGk = active.find((p) => p.id === newGkId);

        if (!advancePeriod) {
          const prevGkId = game.live.gkByPeriod[game.live.currentPeriod] || null;
          if (prevGkId && prevGkId !== newGkId) {
            const minStintSeconds = (getState().team.minStintMinutes ?? 4) * 60;
            const prevStint = stintSeconds(game.live, prevGkId);
            if (minStintSeconds > 0 && prevStint < minStintSeconds) {
              const prevName = active.find((p) => p.id === prevGkId)?.name;
              if (!(await confirmDialog(`${prevName} has only kept goal for ${formatClock(prevStint)} this stint (minimum ${getState().team.minStintMinutes ?? 4} min). Change anyway?`, { okLabel: 'Change Anyway' }))) return;
            }
          }
        }

        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          const prevGkId = g.live.gkByPeriod[g.live.currentPeriod] || null;
          const prevGk = prevGkId ? active.find((p) => p.id === prevGkId) : null;

          if (advancePeriod) {
            g.live.currentPeriod = targetPeriod;
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'period-start', period: targetPeriod });
          }
          if (newGkId !== prevGkId) {
            g.live.onField = g.live.onField.filter((id) => id !== newGkId);
            g.live.gkByPeriod[targetPeriod] = newGkId;
            g.live.stintStart = g.live.stintStart || {};
            g.live.stintStart[newGkId] = g.live.elapsedSeconds;
            g.live.subLog.push({
              atSeconds: g.live.elapsedSeconds, type: 'gk-change', period: targetPeriod,
              inId: newGkId, inName: newGk?.name || '', outId: prevGkId, outName: prevGk?.name || '',
            });
          } else {
            g.live.gkByPeriod[targetPeriod] = newGkId;
          }
        });
        closeModal();
      });
    },
  });
}
