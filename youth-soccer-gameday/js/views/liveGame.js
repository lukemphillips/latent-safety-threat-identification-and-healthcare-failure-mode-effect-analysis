import { getState, update, findGame } from '../store.js';
import { escapeHtml, formatClock, formatDate } from '../util.js';
import { formationFor } from '../formations.js';

export function renderLiveGame(app, gameId) {
  const game = findGame(gameId);
  if (!game || !game.live) {
    app.innerHTML = `<p class="empty">No live data for this game yet. <a href="#/game/${gameId}">Back to game</a></p>`;
    return undefined;
  }

  const { players, team } = getState();
  const active = players.filter((p) => p.active);
  const byId = Object.fromEntries(active.map((p) => [p.id, p]));
  const live = game.live;
  const isCompleted = game.status === 'completed';
  const formation = formationFor(team.squadFormat);
  const onField = live.onField.map((id) => byId[id]).filter(Boolean);
  const bench = active.filter((p) => !live.onField.includes(p.id));
  const targetMinutes = team.periodMinutes * team.numPeriods;

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)}</h1>
        <div class="sub">${formatDate(game.date)}${isCompleted ? ' · Final' : ' · Live'}</div>
      </div>
      <a class="icon-btn" href="#/game/${game.id}" aria-label="Back to game">✕</a>
    </div>

    <div class="card timer-card">
      <div class="timer-display">${formatClock(live.elapsedSeconds)}</div>
      <div class="muted small">Target: ${team.numPeriods} × ${team.periodMinutes} min (${targetMinutes} min total)</div>

      <div class="score-board">
        <div class="score-team">
          <div class="label">Us</div>
          <div class="value">${live.scoreUs}</div>
          ${isCompleted ? '' : `<div class="score-controls">
            <button class="btn sm ghost" data-action="score" data-team="us" data-delta="-1">-1</button>
            <button class="btn sm secondary" data-action="score" data-team="us" data-delta="1">+1</button>
          </div>`}
        </div>
        <div style="font-size:20px; font-weight:700; color:var(--ink-soft);">–</div>
        <div class="score-team">
          <div class="label">${escapeHtml(game.opponent)}</div>
          <div class="value">${live.scoreThem}</div>
          ${isCompleted ? '' : `<div class="score-controls">
            <button class="btn sm ghost" data-action="score" data-team="them" data-delta="-1">-1</button>
            <button class="btn sm secondary" data-action="score" data-team="them" data-delta="1">+1</button>
          </div>`}
        </div>
      </div>

      ${isCompleted ? '' : `
        <div class="timer-actions">
          <button class="btn big ${live.running ? 'secondary' : ''}" data-action="toggle-run">${live.running ? '⏸ Pause' : '▶ Start'} Clock</button>
        </div>
        <div class="timer-actions">
          <button class="btn danger" data-action="end-game">End Game</button>
        </div>
      `}
    </div>

    <div class="section-title">On Field (${onField.length}${isCompleted ? '' : ` / ${formation.slots.length} target`})</div>
    <div class="onfield-grid">
      ${onField.length ? onField.map((p) => fieldCardHtml(p, live, isCompleted, true)).join('') : '<span class="muted small">No one is on the field.</span>'}
    </div>

    ${isCompleted ? '' : `
      <div class="section-title">Bench (${bench.length})</div>
      <div class="onfield-grid">
        ${bench.length ? bench.map((p) => fieldCardHtml(p, live, isCompleted, false)).join('') : '<span class="muted small">Full squad is on the field.</span>'}
      </div>
    `}

    <div class="section-title">Playing Time</div>
    <div class="card">
      ${playingTimeRows(active, live)}
    </div>

    ${live.subLog.length ? `
      <div class="section-title">Substitution Log</div>
      <div class="card">
        ${live.subLog.slice().reverse().map((entry) => `
          <div class="sublog-item">
            <span>${entry.type === 'in' ? '🔵 On' : '⚪ Off'}: ${escapeHtml(entry.name)}</span>
            <span class="muted">${formatClock(entry.atSeconds)}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  if (!isCompleted) {
    app.querySelectorAll('[data-action="score"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const team = btn.dataset.team;
        const delta = Number(btn.dataset.delta);
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          const key = team === 'us' ? 'scoreUs' : 'scoreThem';
          g.live[key] = Math.max(0, g.live[key] + delta);
        });
      });
    });

    app.querySelector('[data-action="toggle-run"]').addEventListener('click', () => {
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.live.running = !g.live.running;
      });
    });

    app.querySelector('[data-action="end-game"]').addEventListener('click', () => {
      if (!confirm('End the game? Final score and playing time will be locked in.')) return;
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.status = 'completed';
        g.live.running = false;
      });
    });

    app.querySelectorAll('[data-action="toggle-field"]').forEach((el) => {
      el.addEventListener('click', () => {
        const playerId = el.dataset.playerId;
        const player = byId[playerId];
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          const onFieldNow = g.live.onField.includes(playerId);
          if (onFieldNow) {
            g.live.onField = g.live.onField.filter((id) => id !== playerId);
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'out', playerId, name: player?.name || '' });
          } else {
            g.live.onField.push(playerId);
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'in', playerId, name: player?.name || '' });
          }
        });
      });
    });
  }

  let handle = null;
  if (!isCompleted && live.running) {
    handle = setInterval(() => {
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        if (!g || !g.live || !g.live.running) return;
        g.live.elapsedSeconds += 1;
        g.live.onField.forEach((pid) => {
          g.live.playingTime[pid] = (g.live.playingTime[pid] || 0) + 1;
        });
      });
    }, 1000);
  }

  return () => { if (handle) clearInterval(handle); };
}

function fieldCardHtml(p, live, isCompleted, isOnField) {
  const seconds = live.playingTime[p.id] || 0;
  return `
    <button type="button" class="field-card" ${isCompleted ? 'disabled' : `data-action="toggle-field" data-player-id="${p.id}"`}>
      <div class="row spread">
        <span class="jersey" style="width:26px;height:26px;font-size:12px;">${p.jerseyNumber ?? '-'}</span>
        <span class="small muted">${isOnField ? 'On field' : 'Bench'}</span>
      </div>
      <div style="font-weight:700; font-size:13.5px; margin-top:4px;">${escapeHtml(p.name)}</div>
      <div class="pt">⏱ ${formatClock(seconds)}</div>
    </button>
  `;
}

function playingTimeRows(active, live) {
  const rows = active
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
