import { getState, update, findGame } from '../store.js';
import { escapeHtml, formatDate, formatTime, todayIso, matchTypeBadgeHtml, periodLabel } from '../util.js';
import { formationFor } from '../formations.js';
import { openModal, closeModal } from '../modal.js';
import { openGameForm } from './schedule.js';

let selectingSlotId = null;

const RSVP_OPTIONS = [
  { key: 'yes', label: 'In', icon: '✅' },
  { key: 'maybe', label: 'Maybe', icon: '❓' },
  { key: 'no', label: 'Out', icon: '❌' },
];

function captainName(game) {
  const { players } = getState();
  return game.captainId ? players.find((p) => p.id === game.captainId)?.name : null;
}

function potmName(game) {
  const { players } = getState();
  return game.playerOfMatchId ? players.find((p) => p.id === game.playerOfMatchId)?.name : null;
}

function honoreePool(game) {
  const { players } = getState();
  const active = players.filter((p) => p.active);
  const present = active.filter((p) => (game.presentIds || []).includes(p.id));
  return present.length ? present : active;
}

function openHonoreeModal(game, { field, title, label }) {
  const pool = honoreePool(game);
  if (!pool.length) {
    alert('No active players to choose from yet.');
    return;
  }
  openModal({
    title,
    bodyHtml: `
      <form id="honoree-form" class="stack">
        <div class="field">
          <label>${label}</label>
          <select name="player">
            <option value="">— none —</option>
            ${pool.map((p) => `<option value="${p.id}" ${game[field] === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn block">Save</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#honoree-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const playerId = new FormData(e.target).get('player') || null;
        update((state) => {
          const g = state.games.find((x) => x.id === game.id);
          g[field] = playerId;
        });
        closeModal();
      });
    },
  });
}

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
        ${game.matchType === 'tournament' && game.tournamentName ? `<div class="sub">${escapeHtml(game.tournamentName)}${game.stage ? ' · ' + escapeHtml(game.stage) : ''}</div>` : ''}
        <div style="margin-top:6px;">${matchTypeBadgeHtml(game)}</div>
      </div>
      <button class="icon-btn" data-action="edit-game" aria-label="Edit game">✏️</button>
    </div>

    <div class="card">
      <div class="card-row">
        <span class="small">🅲 Captain: <strong>${captainName(game) || 'Not set'}</strong></span>
        <button class="btn ghost sm" data-action="set-captain">${game.captainId ? 'Change' : 'Set'}</button>
      </div>
      <div class="card-row" style="margin-top:8px;">
        <span class="small">⭐ Player of the Match: <strong>${potmName(game) || 'Not set'}</strong></span>
        <button class="btn ghost sm" data-action="set-potm">${game.playerOfMatchId ? 'Change' : 'Set'}</button>
      </div>
    </div>

    <button class="btn ghost sm" data-action="add-matchday-opponent" style="margin-bottom:12px;">+ Add Match Day Opponent</button>

    ${statusBanner(game)}

    <div class="tabs">
      <a class="tab ${tab === 'rsvp' ? 'active' : ''}" href="#/game/${game.id}/rsvp">RSVP</a>
      <a class="tab ${tab === 'lineup' ? 'active' : ''}" href="#/game/${game.id}/lineup">Squad</a>
    </div>

    <div id="tab-content"></div>
  `;

  app.querySelector('[data-action="edit-game"]').addEventListener('click', () => openEditGameForm(game));
  app.querySelector('[data-action="add-matchday-opponent"]').addEventListener('click', () => openGameForm({
    date: game.date, location: game.location, isHome: game.isHome, matchType: game.matchType,
  }));
  app.querySelector('[data-action="set-captain"]').addEventListener('click', () => openHonoreeModal(game, {
    field: 'captainId', title: 'Set Captain', label: 'Captain',
  }));
  app.querySelector('[data-action="set-potm"]').addEventListener('click', () => openHonoreeModal(game, {
    field: 'playerOfMatchId', title: 'Player of the Match', label: 'Player of the Match',
  }));

  const startBtn = app.querySelector('[data-action="start-game"]');
  if (startBtn) startBtn.addEventListener('click', () => startGame(game));
  const resumeBtn = app.querySelector('[data-action="resume-game"]');
  if (resumeBtn) resumeBtn.addEventListener('click', () => { location.hash = `#/game/${game.id}/live`; });
  const summaryBtn = app.querySelector('[data-action="view-summary"]');
  if (summaryBtn) summaryBtn.addEventListener('click', () => { location.hash = `#/game/${game.id}/live`; });

  const content = app.querySelector('#tab-content');
  if (tab === 'lineup') renderSquadTab(content, game);
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
    <div class="banner info">Optional — use this if you're collecting availability ahead of time. Match-day squad selection (Squad tab) works independently.</div>
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

function renderSquadTab(container, game) {
  const { players, team } = getState();
  const active = players.filter((p) => p.active);
  const presentIds = new Set(game.presentIds || []);
  const present = active.filter((p) => presentIds.has(p.id));
  const absent = active.filter((p) => !presentIds.has(p.id));

  if (game.status === 'live') return renderLiveSquadTab(container, game, active, present, absent);
  if (game.status === 'completed') return renderCompletedSquadTab(container, present, absent);

  const formation = formationFor(team.squadFormat);
  const slots = game.lineup.slots;
  const assignedIds = new Set(Object.values(slots).filter(Boolean));
  const bench = present.filter((p) => !assignedIds.has(p.id));
  const filledCount = Object.values(slots).filter(Boolean).length;

  const byId = Object.fromEntries(active.map((p) => [p.id, p]));

  container.innerHTML = `
    <div class="section-title" style="margin-top:0;">Who's here today?</div>
    <div class="card">
      <div class="spread" style="margin-bottom:10px;">
        <span class="muted small">${present.length}/${active.length} present</span>
        <button class="btn ghost sm" data-action="mark-all-present">Mark All Present</button>
      </div>
      <div class="chip-list">
        ${active.length ? active.map((p) => attendanceChipHtml(p, presentIds.has(p.id))).join('') : '<span class="muted small">No active players on the roster.</span>'}
      </div>
    </div>

    <div class="spread" style="margin:16px 0 10px;">
      <span class="muted small">${formation.label} · ${filledCount}/${formation.slots.length} filled</span>
      <button class="btn ghost sm" data-action="clear-lineup">Clear Lineup</button>
    </div>
    <div class="banner info">Tap an open spot on the pitch, then tap a player to place them. The GK spot sets your ${periodLabel(team, 1)} keeper.</div>
    <div class="pitch-wrap">
      <div class="pitch">
        ${formation.slots.map((slot) => pitchSlotHtml(slot, slots[slot.id] ? byId[slots[slot.id]] : null)).join('')}
      </div>
    </div>
    <div class="section-title">Bench (${bench.length})</div>
    <div class="bench-list">
      ${bench.length ? bench.map((p) => benchChipHtml(p)).join('') : `<span class="muted small">${present.length ? 'Everyone present is on the pitch.' : 'Mark players present above to build your squad.'}</span>`}
    </div>

    ${absent.length ? `
      <div class="section-title">Not here (${absent.length})</div>
      <div class="muted small">${absent.map((p) => escapeHtml(p.name)).join(', ')}</div>
    ` : ''}
  `;

  container.querySelector('[data-action="mark-all-present"]').addEventListener('click', () => {
    update((state) => {
      const g = state.games.find((x) => x.id === game.id);
      g.presentIds = state.players.filter((p) => p.active).map((p) => p.id);
    });
  });

  container.querySelectorAll('[data-attendance-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const playerId = el.dataset.attendanceToggle;
      update((state) => {
        const g = state.games.find((x) => x.id === game.id);
        const set = new Set(g.presentIds || []);
        if (set.has(playerId)) {
          set.delete(playerId);
          Object.keys(g.lineup.slots).forEach((sid) => {
            if (g.lineup.slots[sid] === playerId) g.lineup.slots[sid] = null;
          });
        } else {
          set.add(playerId);
        }
        g.presentIds = [...set];
      });
    });
  });

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
      renderSquadTab(container, findGame(game.id));
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

  function attendanceChipHtml(p, isPresent) {
    return `
      <button type="button" class="bench-chip ${isPresent ? 'picking' : ''}" data-attendance-toggle="${p.id}">
        <span class="jersey">${p.jerseyNumber ?? '-'}</span>
        ${escapeHtml(p.name)} ${isPresent ? '✅' : '⚪'}
      </button>
    `;
  }

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

  function benchChipHtml(p) {
    const disabledClass = selectingSlotId ? '' : 'disabled';
    return `
      <button type="button" class="bench-chip ${disabledClass}" data-bench-player="${p.id}">
        <span class="jersey">${p.jerseyNumber ?? '-'}</span>
        ${escapeHtml(p.name)}
      </button>
    `;
  }
}

function renderLiveSquadTab(container, game, active, present, absent) {
  container.innerHTML = `
    <div class="banner info">Game is live. Mark a late arrival present and they'll show up on the bench in the live view right away — <a href="#/game/${game.id}/live">go to Live Game</a>.</div>
    <div class="section-title" style="margin-top:0;">On the squad (${present.length})</div>
    <div class="card">
      <div class="chip-list">
        ${present.length ? present.map((p) => `
          <span class="bench-chip picking">
            <span class="jersey">${p.jerseyNumber ?? '-'}</span>
            ${escapeHtml(p.name)} ✅
          </span>
        `).join('') : '<span class="muted small">No one marked present yet.</span>'}
      </div>
    </div>

    ${absent.length ? `
      <div class="section-title">Not here yet (${absent.length})</div>
      <div class="card">
        <div class="chip-list">
          ${absent.map((p) => `
            <button type="button" class="bench-chip" data-attendance-add="${p.id}">
              <span class="jersey">${p.jerseyNumber ?? '-'}</span>
              ${escapeHtml(p.name)} — Add
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  container.querySelectorAll('[data-attendance-add]').forEach((el) => {
    el.addEventListener('click', () => {
      const playerId = el.dataset.attendanceAdd;
      update((state) => {
        const g = state.games.find((x) => x.id === game.id);
        g.presentIds = [...new Set([...(g.presentIds || []), playerId])];
      });
    });
  });
}

function renderCompletedSquadTab(container, present, absent) {
  container.innerHTML = `
    <div class="section-title" style="margin-top:0;">Squad (${present.length})</div>
    <div class="card">
      <div class="chip-list">
        ${present.length ? present.map((p) => `
          <span class="bench-chip picking">
            <span class="jersey">${p.jerseyNumber ?? '-'}</span>
            ${escapeHtml(p.name)}
          </span>
        `).join('') : '<span class="muted small">No attendance was recorded for this game.</span>'}
      </div>
    </div>
    ${absent.length ? `
      <div class="section-title">Not there</div>
      <div class="muted small">${absent.map((p) => escapeHtml(p.name)).join(', ')}</div>
    ` : ''}
  `;
}

function startGame(game) {
  const { players, team } = getState();
  const active = players.filter((p) => p.active);
  const presentIds = game.presentIds || [];
  const gkId = game.lineup.slots.gk || null;
  const outfieldIds = Object.entries(game.lineup.slots)
    .filter(([slotId, pid]) => slotId !== 'gk' && pid)
    .map(([, pid]) => pid);

  if (!presentIds.length && !confirm('No players marked present yet. Start the game anyway?')) return;
  if (!gkId && !confirm(`No goalkeeper set for the ${periodLabel(team, 1)}. Start anyway?`)) return;

  const playingTime = {};
  active.forEach((p) => { playingTime[p.id] = 0; });
  const stintStart = {};
  outfieldIds.forEach((id) => { stintStart[id] = 0; });
  if (gkId) stintStart[gkId] = 0;

  update((state) => {
    const g = state.games.find((x) => x.id === game.id);
    g.status = 'live';
    g.live = {
      running: false,
      currentPeriod: 1,
      elapsedSeconds: 0,
      scoreUs: 0,
      scoreThem: 0,
      onField: outfieldIds,
      gkByPeriod: { 1: gkId },
      sentOff: [],
      playingTime,
      stintStart,
      subLog: [],
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
          <label>Match type</label>
          <select name="matchType">
            <option value="league" ${(!game.matchType || game.matchType === 'league') ? 'selected' : ''}>League</option>
            <option value="friendly" ${game.matchType === 'friendly' ? 'selected' : ''}>Friendly</option>
            <option value="tournament" ${game.matchType === 'tournament' ? 'selected' : ''}>Tournament</option>
          </select>
        </div>
        <div class="field-row" data-tournament-fields ${game.matchType === 'tournament' ? '' : 'hidden'}>
          <div class="field">
            <label>Tournament name</label>
            <input type="text" name="tournamentName" value="${escapeHtml(game.tournamentName || '')}" placeholder="e.g. Summer Cup" />
          </div>
          <div class="field">
            <label>Stage</label>
            <input type="text" name="stage" value="${escapeHtml(game.stage || '')}" placeholder="e.g. Group Stage" />
          </div>
        </div>
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
      const form = modalEl.querySelector('#edit-game-form');
      const typeSelect = form.querySelector('[name="matchType"]');
      const tournamentFields = form.querySelector('[data-tournament-fields]');
      typeSelect.addEventListener('change', () => {
        tournamentFields.hidden = typeSelect.value !== 'tournament';
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        update((state) => {
          const g = state.games.find((x) => x.id === game.id);
          g.matchType = fd.get('matchType') || 'league';
          g.tournamentName = (fd.get('tournamentName') || '').trim();
          g.stage = (fd.get('stage') || '').trim();
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
