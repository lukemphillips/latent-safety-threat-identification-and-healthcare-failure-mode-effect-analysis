import { getState, update, findGame } from '../store.js';
import { escapeHtml, formatDate, formatTime, todayIso } from '../util.js';
import { formationFor } from '../formations.js';
import { openModal, closeModal } from '../modal.js';

let selectingSlotId = null;

const RSVP_OPTIONS = [
  { key: 'yes', label: 'In', icon: '✅' },
  { key: 'maybe', label: 'Maybe', icon: '❓' },
  { key: 'no', label: 'Out', icon: '❌' },
];

export function renderGameDetail(app, gameId, tab) {
  const game = findGame(gameId);
  if (!game) {
    app.innerHTML = '<p class="empty">Game not found. <a href="#/schedule">Back to schedule</a></p>';
    return;
  }
  selectingSlotId = null;

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)}</h1>
        <div class="sub">${formatDate(game.date)} · ${formatTime(game.time)}${game.location ? ' · ' + escapeHtml(game.location) : ''}</div>
      </div>
      <button class="icon-btn" data-action="edit-game" aria-label="Edit game">✏️</button>
    </div>

    ${statusBanner(game)}

    <div class="tabs">
      <a class="tab ${tab === 'rsvp' ? 'active' : ''}" href="#/game/${game.id}/rsvp">RSVP</a>
      <a class="tab ${tab === 'lineup' ? 'active' : ''}" href="#/game/${game.id}/lineup">Lineup</a>
    </div>

    <div id="tab-content"></div>
  `;

  app.querySelector('[data-action="edit-game"]').addEventListener('click', () => openEditGameForm(game));

  const startBtn = app.querySelector('[data-action="start-game"]');
  if (startBtn) startBtn.addEventListener('click', () => startGame(game));
  const resumeBtn = app.querySelector('[data-action="resume-game"]');
  if (resumeBtn) resumeBtn.addEventListener('click', () => { location.hash = `#/game/${game.id}/live`; });
  const summaryBtn = app.querySelector('[data-action="view-summary"]');
  if (summaryBtn) summaryBtn.addEventListener('click', () => { location.hash = `#/game/${game.id}/live`; });

  const content = app.querySelector('#tab-content');
  if (tab === 'lineup') renderLineupTab(content, game);
  else renderRsvpTab(content, game);
}

function statusBanner(game) {
  if (game.status === 'scheduled') {
    return `<div class="fab-row" style="margin-bottom:14px;"><button class="btn big block" data-action="start-game">▶ Start Game</button></div>`;
  }
  if (game.status === 'live') {
    return `<div class="banner warn" style="display:flex; align-items:center; justify-content:space-between;">
      <span>🔴 Game in progress</span>
      <button class="btn sm" data-action="resume-game">Continue</button>
    </div>`;
  }
  if (game.status === 'completed' && game.live) {
    const us = game.live.scoreUs, them = game.live.scoreThem;
    return `<div class="banner info" style="display:flex; align-items:center; justify-content:space-between;">
      <span>Final score: <strong>${us} - ${them}</strong></span>
      <button class="btn sm secondary" data-action="view-summary">View Summary</button>
    </div>`;
  }
  return '';
}

function renderRsvpTab(container, game) {
  const { players } = getState();
  const active = players.filter((p) => p.active);
  const counts = { yes: 0, no: 0, maybe: 0, pending: 0 };
  active.forEach((p) => { counts[game.rsvps[p.id] || 'pending']++; });

  container.innerHTML = `
    <div class="rsvp-summary card">
      <span>✅ ${counts.yes} in</span>
      <span>❓ ${counts.maybe} maybe</span>
      <span>❌ ${counts.no} out</span>
      <span>⏳ ${counts.pending} pending</span>
    </div>
    <div class="card">
      ${active.length ? active.map((p) => rsvpRow(game, p)).join('') : '<div class="empty">No active players on the roster.</div>'}
    </div>
  `;

  container.querySelectorAll('[data-rsvp-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { playerId, value } = btn.dataset;
      update((state) => {
        const g = state.games.find((x) => x.id === game.id);
        g.rsvps[playerId] = value;
      });
    });
  });
}

function rsvpRow(game, p) {
  const current = game.rsvps[p.id] || 'pending';
  return `
    <div class="player-row">
      <div class="jersey">${p.jerseyNumber ?? '-'}</div>
      <div class="player-meta">
        <div class="player-name">${escapeHtml(p.name)}</div>
        <div class="player-sub">${p.position || ''}</div>
      </div>
      <div class="rsvp-group">
        ${RSVP_OPTIONS.map((opt) => `
          <button type="button" class="rsvp-btn ${opt.key} ${current === opt.key ? 'active' : ''}"
            data-rsvp-btn data-player-id="${p.id}" data-value="${opt.key}" aria-label="${opt.label}">${opt.icon}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderLineupTab(container, game) {
  const { players, team } = getState();
  const active = players.filter((p) => p.active);
  const formation = formationFor(team.squadFormat);
  const slots = game.lineup.slots;
  const assignedIds = new Set(Object.values(slots).filter(Boolean));
  const bench = active.filter((p) => !assignedIds.has(p.id));
  const filledCount = Object.values(slots).filter(Boolean).length;

  const byId = Object.fromEntries(active.map((p) => [p.id, p]));

  container.innerHTML = `
    <div class="spread" style="margin-bottom:10px;">
      <span class="muted small">${formation.label} · ${filledCount}/${formation.slots.length} filled</span>
      <button class="btn ghost sm" data-action="clear-lineup">Clear Lineup</button>
    </div>
    <div class="banner info">Tap an open spot on the pitch, then tap a player to place them.</div>
    <div class="pitch-wrap">
      <div class="pitch">
        ${formation.slots.map((slot) => pitchSlotHtml(slot, slots[slot.id] ? byId[slots[slot.id]] : null)).join('')}
      </div>
    </div>
    <div class="section-title">Bench (${bench.length})</div>
    <div class="bench-list">
      ${bench.length ? bench.map((p) => benchChipHtml(p, game)).join('') : '<span class="muted small">Everyone is on the pitch.</span>'}
    </div>
  `;

  container.querySelector('[data-action="clear-lineup"]').addEventListener('click', () => {
    if (!confirm('Clear the whole lineup?')) return;
    selectingSlotId = null;
    update((state) => {
      const g = state.games.find((x) => x.id === game.id);
      Object.keys(g.lineup.slots).forEach((sid) => { g.lineup.slots[sid] = null; });
    });
  });

  container.querySelectorAll('[data-pitch-slot]').forEach((el) => {
    el.addEventListener('click', () => {
      const slotId = el.dataset.pitchSlot;
      const occupantId = slots[slotId];
      if (occupantId) {
        selectingSlotId = null;
        update((state) => {
          const g = state.games.find((x) => x.id === game.id);
          g.lineup.slots[slotId] = null;
        });
        return;
      }
      selectingSlotId = selectingSlotId === slotId ? null : slotId;
      renderLineupTab(container, findGame(game.id));
    });
  });

  container.querySelectorAll('[data-bench-player]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!selectingSlotId) return;
      const playerId = el.dataset.benchPlayer;
      const slotId = selectingSlotId;
      selectingSlotId = null;
      update((state) => {
        const g = state.games.find((x) => x.id === game.id);
        g.lineup.slots[slotId] = playerId;
      });
    });
  });

  function pitchSlotHtml(slot, player) {
    const isSelecting = selectingSlotId === slot.id;
    const initials = player ? (player.jerseyNumber ?? player.name.slice(0, 2).toUpperCase()) : '+';
    return `
      <div class="pitch-slot ${player ? '' : 'empty'} ${isSelecting ? 'selecting' : ''}" data-pitch-slot="${slot.id}"
        style="left:${slot.x}%; top:${slot.y}%;">
        <div class="chip">${initials}</div>
        <div class="slot-label">${player ? escapeHtml(player.name.split(' ')[0]) : slot.role}</div>
      </div>
    `;
  }

  function benchChipHtml(p, game) {
    const rsvp = game.rsvps[p.id] || 'pending';
    const rsvpIcon = { yes: '✅', no: '❌', maybe: '❓', pending: '⏳' }[rsvp];
    const disabledClass = selectingSlotId ? '' : 'disabled';
    return `
      <button type="button" class="bench-chip ${disabledClass}" data-bench-player="${p.id}">
        <span class="jersey">${p.jerseyNumber ?? '-'}</span>
        ${escapeHtml(p.name)} <span title="RSVP: ${rsvp}">${rsvpIcon}</span>
      </button>
    `;
  }
}

function startGame(game) {
  const { players } = getState();
  const active = players.filter((p) => p.active);
  const startingIds = Object.values(game.lineup.slots).filter(Boolean);
  const playingTime = {};
  active.forEach((p) => { playingTime[p.id] = 0; });

  update((state) => {
    const g = state.games.find((x) => x.id === game.id);
    g.status = 'live';
    g.live = {
      running: false,
      elapsedSeconds: 0,
      scoreUs: 0,
      scoreThem: 0,
      onField: startingIds,
      playingTime,
      subLog: [],
      startedAt: null,
    };
  });
  location.hash = `#/game/${game.id}/live`;
}

function openEditGameForm(game) {
  openModal({
    title: 'Edit Game',
    bodyHtml: `
      <form id="edit-game-form" class="stack">
        <div class="field">
          <label>Opponent</label>
          <input type="text" name="opponent" required value="${escapeHtml(game.opponent)}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Date</label>
            <input type="date" name="date" value="${game.date || todayIso()}" required />
          </div>
          <div class="field">
            <label>Time</label>
            <input type="time" name="time" value="${game.time || ''}" required />
          </div>
        </div>
        <div class="field">
          <label>Location</label>
          <input type="text" name="location" value="${escapeHtml(game.location)}" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" name="isHome" ${game.isHome ? 'checked' : ''} />
          Home game
        </label>
        <div class="field">
          <label>Notes</label>
          <textarea name="notes">${escapeHtml(game.notes)}</textarea>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn block">Save</button>
          <button type="button" class="btn danger" data-action="delete-game">Delete</button>
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#edit-game-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        update((state) => {
          const g = state.games.find((x) => x.id === game.id);
          g.opponent = (fd.get('opponent') || '').trim() || g.opponent;
          g.date = fd.get('date');
          g.time = fd.get('time');
          g.location = (fd.get('location') || '').trim();
          g.isHome = fd.get('isHome') === 'on';
          g.notes = (fd.get('notes') || '').trim();
        });
        closeModal();
      });
      modalEl.querySelector('[data-action="delete-game"]').addEventListener('click', () => {
        if (!confirm(`Delete the game vs ${game.opponent}?`)) return;
        update((state) => {
          state.games = state.games.filter((g) => g.id !== game.id);
        });
        closeModal();
        location.hash = '#/schedule';
      });
    },
  });
}
