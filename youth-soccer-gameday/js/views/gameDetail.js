import { getState, update, findGame } from '../store.js';
import { uid, escapeHtml, formatDate, formatTime, todayIso, matchTypeBadgeHtml, periodLabel, formatPositions, playerPositions, gameNumPeriods, gamePeriodMinutes, matchEligiblePlayers } from '../util.js';
import { formationFor, formationOptionsFor, remapLineupToFormat } from '../formations.js';
import { openModal, closeModal, confirmDialog, alertDialog } from '../modal.js';
import { openGameForm } from './schedule.js';
import { subPlanSectionHtml, openSubPlanEntryForm, benchDueLineHtml } from '../subPlan.js';

let selectingSlotId = null;

const RSVP_OPTIONS = [
  { key: 'yes', label: 'In', icon: '✅' },
  { key: 'maybe', label: 'Maybe', icon: '❓' },
  { key: 'no', label: 'Out', icon: '❌' },
];

const RSVP_BADGE = {
  yes: { cls: 'yes', icon: '✅', label: 'RSVP: In' },
  maybe: { cls: 'maybe', icon: '❓', label: 'RSVP: Maybe' },
  no: { cls: 'no', icon: '❌', label: 'RSVP: Out' },
  pending: { cls: 'pending', icon: '⏳', label: 'RSVP: Pending' },
};

function rsvpBadgeHtml(status) {
  const b = RSVP_BADGE[status || 'pending'];
  return `<span class="badge ${b.cls}" title="${b.label}">${b.icon}</span>`;
}

// Other games on the same date — used to confirm a match day opponent
// was actually added (rather than the coach just seeing the same "+ Add"
// button again with no sign anything happened) and to show its status.
function matchDaySiblings(game) {
  const { games } = getState();
  return games.filter((g) => g.date === game.date && g.id !== game.id);
}

function matchDaySiblingsHtml(game) {
  const siblings = matchDaySiblings(game);
  if (!siblings.length) return '';
  return `
    <div class="card">
      <div class="muted small" style="margin-bottom:6px;">Also on this date:</div>
      ${siblings.map((g) => `
        <div class="card-row" style="margin-bottom:4px;">
          <span class="small">${g.isHome ? 'vs' : '@'} ${escapeHtml(g.opponent)} — <span class="badge ${g.status}">${g.status === 'live' ? 'LIVE' : g.status}</span></span>
          <a class="btn ghost sm" href="#/game/${g.id}${g.status === 'live' ? '/live' : ''}">Open</a>
        </div>
      `).join('')}
    </div>
  `;
}

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
  const active = matchEligiblePlayers(players);
  const present = active.filter((p) => (game.presentIds || []).includes(p.id));
  return present.length ? present : active;
}

function openHonoreeModal(game, { field, title, label }) {
  const pool = honoreePool(game);
  if (!pool.length) {
    alertDialog('No active players to choose from yet.');
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
      <div class="row" style="gap:4px;">
        <button class="icon-btn" data-action="edit-game" aria-label="Edit game">✏️</button>
        ${game.status === 'scheduled' ? `<button class="icon-btn" data-action="delete-game-quick" aria-label="Delete game">🗑</button>` : ''}
      </div>
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

    ${matchDaySiblingsHtml(game)}
    <button class="btn ghost sm" data-action="add-matchday-opponent" style="margin-bottom:12px;">+ Add ${matchDaySiblings(game).length ? 'Another' : ''} Match Day Opponent</button>

    ${statusBanner(game)}

    <div class="tabs">
      <a class="tab ${tab === 'rsvp' ? 'active' : ''}" href="#/game/${game.id}/rsvp">RSVP</a>
      <a class="tab ${tab === 'lineup' ? 'active' : ''}" href="#/game/${game.id}/lineup">Squad</a>
    </div>

    <div id="tab-content"></div>
  `;

  app.querySelector('[data-action="edit-game"]').addEventListener('click', () => openEditGameForm(game));
  const quickDeleteBtn = app.querySelector('[data-action="delete-game-quick"]');
  if (quickDeleteBtn) quickDeleteBtn.addEventListener('click', () => deleteGame(game));
  app.querySelector('[data-action="add-matchday-opponent"]').addEventListener('click', () => openGameForm({
    date: game.date, location: game.location, isHome: game.isHome, matchType: game.matchType,
    periodMinutes: gamePeriodMinutes(game, getState().team), numPeriods: gameNumPeriods(game, getState().team),
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
  const active = matchEligiblePlayers(players);
  const counts = { yes: 0, no: 0, maybe: 0, pending: 0 };
  active.forEach((p) => { counts[game.rsvps[p.id] || 'pending']++; });

  const presentIds = new Set(game.presentIds || []);

  container.innerHTML = `
    <div class="banner info">Optional — use this if you're collecting availability ahead of time. On the Squad tab, "Use RSVP List" marks everyone who's In as present in one tap — attendance still tracks separately, so you can see who actually showed vs. who said they would.</div>
    <div class="rsvp-summary card">
      <span>✅ ${counts.yes} in</span>
      <span>❓ ${counts.maybe} maybe</span>
      <span>❌ ${counts.no} out</span>
      <span>⏳ ${counts.pending} pending</span>
    </div>
    <div class="card">
      ${active.length ? active.map((p) => rsvpRow(game, p, presentIds.has(p.id))).join('') : '<div class="empty">No active players on the roster.</div>'}
    </div>
    ${counts.yes ? `<a class="btn ghost sm block" href="#/balance/${game.id}" style="margin-top:12px;">🎲 Balance Teams from RSVPs</a>` : ''}
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

function rsvpRow(game, p, isPresent) {
  const current = game.rsvps[p.id] || 'pending';
  return `
    <div class="player-row">
      <div class="jersey">${p.jerseyNumber ?? '-'}</div>
      <div class="player-meta">
        <div class="player-name">${escapeHtml(p.name)}</div>
        <div class="player-sub">${formatPositions(p)}${isPresent ? ' · ✅ marked present' : ''}</div>
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
  const active = matchEligiblePlayers(players);
  const presentIds = new Set(game.presentIds || []);
  const present = active.filter((p) => presentIds.has(p.id));
  const absent = active.filter((p) => !presentIds.has(p.id));
  const rsvpYes = active.filter((p) => game.rsvps?.[p.id] === 'yes');

  if (game.status === 'live') return renderLiveSquadTab(container, game, active, present, absent);
  if (game.status === 'completed') return renderCompletedSquadTab(container, present, absent);

  const formationOptions = formationOptionsFor(team.squadFormat, team.customFormations || []);
  const formation = formationFor(team.squadFormat, game.formationId, team.customFormations || []);
  const slots = game.lineup.slots;
  const assignedIds = new Set(Object.values(slots).filter(Boolean));
  const bench = present.filter((p) => !assignedIds.has(p.id));
  const filledCount = Object.values(slots).filter(Boolean).length;

  const byId = Object.fromEntries(active.map((p) => [p.id, p]));

  container.innerHTML = `
    <div class="section-title" style="margin-top:0;">Who's here today?</div>
    <div class="card">
      <div class="spread" style="margin-bottom:10px;">
        <span class="muted small">${present.length}/${active.length} present${rsvpYes.length ? ` · ${rsvpYes.length} RSVP'd In` : ''}</span>
        <div class="row" style="gap:8px;">
          <button class="btn secondary sm" data-action="use-rsvp-list" ${rsvpYes.length ? '' : 'disabled'}>✅ Use RSVP List</button>
          <button class="btn ghost sm" data-action="mark-all-present">Mark All Present</button>
        </div>
      </div>
      <div class="chip-list">
        ${active.length ? active.map((p) => attendanceChipHtml(p, presentIds.has(p.id), game.rsvps?.[p.id])).join('') : '<span class="muted small">No active players on the roster.</span>'}
      </div>
    </div>
    ${present.length ? `<a class="btn ghost sm" href="#/balance/${game.id}" style="margin:10px 0; display:inline-flex;">🎲 Balance Teams from today's squad</a>` : ''}

    <div class="field" style="margin:16px 0 0;">
      <label>Formation</label>
      <select id="formation-select">
        ${formationOptions.map((f) => `<option value="${f.id}" ${formation.id === f.id ? 'selected' : ''}>${escapeHtml(f.label)}${f.custom ? ' (yours)' : ''}</option>`).join('')}
      </select>
    </div>
    <div class="muted small" style="margin:4px 0 10px;">Want a different shape? <a href="#/settings">Create your own in Settings</a> — it'll show up here for every ${team.squadFormat}-a-side game.</div>

    <div class="spread" style="margin:0 0 10px;">
      <span class="muted small">${formation.label} · ${filledCount}/${formation.slots.length} filled</span>
      <div class="row" style="gap:8px;">
        <button class="btn secondary sm" data-action="auto-fill-lineup" ${present.length && filledCount < formation.slots.length ? '' : 'disabled'}>⚡ Auto-Fill</button>
        <button class="btn ghost sm" data-action="clear-lineup">Clear Lineup</button>
      </div>
    </div>
    <div class="banner info">Tap an open spot on the pitch, then tap a player to place them — or use "Auto-Fill" to place everyone present by their preferred position, then adjust from there. The GK spot sets your ${periodLabel(gameNumPeriods(game, team), 1)} keeper.</div>
    <div class="pitch-wrap">
      <div class="pitch">
        ${formation.slots.map((slot) => pitchSlotHtml(slot, slots[slot.id] ? byId[slots[slot.id]] : null)).join('')}
      </div>
    </div>
    <div class="section-title">Bench (${bench.length})</div>
    <div class="bench-list">
      ${bench.length ? bench.map((p) => benchChipHtml(p)).join('') : `<span class="muted small">${present.length ? 'Everyone present is on the pitch.' : 'Mark players present above to build your squad.'}</span>`}
    </div>

    ${present.length ? subPlanSectionHtml(game.subPlan || [], byId, { elapsedMinutes: null, showExecute: false }) : ''}

    ${absent.length ? `
      <div class="section-title">Not here (${absent.length})</div>
      <div class="muted small">${absent.map((p) => escapeHtml(p.name)).join(', ')}</div>
    ` : ''}
  `;

  container.querySelector('[data-action="mark-all-present"]').addEventListener('click', () => {
    update((state) => {
      const g = state.games.find((x) => x.id === game.id);
      g.presentIds = matchEligiblePlayers(state.players).map((p) => p.id);
    });
  });

  container.querySelector('#formation-select').addEventListener('change', (e) => {
    const newFormationId = e.target.value;
    selectingSlotId = null;
    update((state) => {
      const g = state.games.find((x) => x.id === game.id);
      const newFormation = formationFor(state.team.squadFormat, newFormationId, state.team.customFormations || []);
      g.formationId = newFormationId;
      g.lineup.slots = remapLineupToFormat(g.lineup.slots, newFormation);
    });
  });

  const useRsvpBtn = container.querySelector('[data-action="use-rsvp-list"]');
  if (useRsvpBtn) {
    useRsvpBtn.addEventListener('click', () => {
      update((state) => {
        const g = state.games.find((x) => x.id === game.id);
        const rsvpYesIds = matchEligiblePlayers(state.players).filter((p) => g.rsvps?.[p.id] === 'yes').map((p) => p.id);
        g.presentIds = [...new Set([...(g.presentIds || []), ...rsvpYesIds])];
      });
    });
  }

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

  container.querySelector('[data-action="clear-lineup"]').addEventListener('click', async () => {
    if (!(await confirmDialog('Clear the whole lineup?'))) return;
    selectingSlotId = null;
    update((state) => {
      const g = state.games.find((x) => x.id === game.id);
      Object.keys(g.lineup.slots).forEach((sid) => { g.lineup.slots[sid] = null; });
    });
  });

  const autoFillBtn = container.querySelector('[data-action="auto-fill-lineup"]');
  if (autoFillBtn) {
    autoFillBtn.addEventListener('click', () => {
      selectingSlotId = null;
      update((state) => {
        const g = state.games.find((x) => x.id === game.id);
        const presentPlayers = matchEligiblePlayers(state.players).filter((p) => (g.presentIds || []).includes(p.id));
        g.lineup.slots = autoFillLineup(formation, presentPlayers, g.lineup.slots);
      });
    });
  }

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

  const addPlanBtn = container.querySelector('[data-action="add-plan-entry"]');
  if (addPlanBtn) {
    addPlanBtn.addEventListener('click', () => {
      openSubPlanEntryForm({
        outgoingOptions: present,
        incomingOptions: present,
        onSave: (entry) => {
          update((state) => {
            const g = state.games.find((x) => x.id === game.id);
            g.subPlan = g.subPlan || [];
            g.subPlan.push({ id: uid(), outId: entry.outId, inId: entry.inId, atMinute: entry.atMinute });
          });
        },
      });
    });
  }
  container.querySelectorAll('[data-action="edit-plan-entry"]').forEach((el) => {
    el.addEventListener('click', () => {
      const existing = (game.subPlan || []).find((e) => e.id === el.dataset.planId);
      if (!existing) return;
      openSubPlanEntryForm({
        existing,
        outgoingOptions: present,
        incomingOptions: present,
        onSave: (entry) => {
          update((state) => {
            const g = state.games.find((x) => x.id === game.id);
            const idx = (g.subPlan || []).findIndex((e) => e.id === existing.id);
            if (idx !== -1) g.subPlan[idx] = { ...entry, id: existing.id };
          });
        },
        onDelete: (id) => {
          update((state) => {
            const g = state.games.find((x) => x.id === game.id);
            g.subPlan = (g.subPlan || []).filter((e) => e.id !== id);
          });
        },
      });
    });
  });

  function attendanceChipHtml(p, isPresent, rsvpStatus) {
    return `
      <button type="button" class="bench-chip ${isPresent ? 'picking' : ''}" data-attendance-toggle="${p.id}">
        <span class="jersey">${p.jerseyNumber ?? '-'}</span>
        ${escapeHtml(p.name)} ${isPresent ? '✅' : '⚪'} ${rsvpStatus && rsvpStatus !== 'pending' ? rsvpBadgeHtml(rsvpStatus) : ''}
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
        ${benchDueLineHtml(p.id, game.subPlan || [], null)}
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

// Same-date games (a "match day") share fair-play minutes: a player's
// running total carries from one match into the next rather than each
// match starting everyone back at zero, so equal-playing-time suggestions
// stay honest across the whole day, not just the current match. Each
// sibling's own playingTime is already cumulative (it was seeded from
// whatever came before it), so for a 3+ match day we take the value from
// only the chronologically-latest sibling per player rather than summing
// every sibling — summing would count earlier matches' minutes again for
// every match after them.
function matchDayCarryover(games, game) {
  const siblings = games
    .filter((g) => g.id !== game.id && g.date === game.date && g.live)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const carryover = {};
  siblings.forEach((g) => {
    Object.entries(g.live.playingTime || {}).forEach(([playerId, seconds]) => {
      carryover[playerId] = seconds;
    });
  });
  return carryover;
}

// Shared by the quick delete icon (scheduled games only) and the Delete
// button inside Edit Game (any status). Navigates back to Matchday and
// returns whether the delete went ahead, so callers can decide what else
// to do (e.g. also close a modal) only on success.
async function deleteGame(game) {
  const ok = await confirmDialog(`Delete the game vs ${game.opponent}? This can't be undone.`, { okLabel: 'Delete', danger: true });
  if (!ok) return false;
  update((state) => {
    state.games = state.games.filter((g) => g.id !== game.id);
  });
  location.hash = '#/schedule';
  return true;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fills only the empty slots, leaving any manual picks alone. Present
// players are matched to a slot's role by their preferred position(s)
// first (GK slots filled before anything else, so a keeper-tagged player
// isn't used to plug an outfield gap); leftovers fill whatever's left.
export function autoFillLineup(formation, presentPlayers, currentSlots) {
  const slots = { ...currentSlots };
  const assignedIds = new Set(Object.values(slots).filter(Boolean));
  const unassigned = shuffle(presentPlayers.filter((p) => !assignedIds.has(p.id)));

  const emptySlots = formation.slots.filter((s) => !slots[s.id]);
  const orderedSlots = [...emptySlots.filter((s) => s.role === 'GK'), ...emptySlots.filter((s) => s.role !== 'GK')];

  orderedSlots.forEach((slot) => {
    const idx = unassigned.findIndex((p) => playerPositions(p).includes(slot.role));
    if (idx === -1) return;
    slots[slot.id] = unassigned[idx].id;
    unassigned.splice(idx, 1);
  });
  orderedSlots.forEach((slot) => {
    if (slots[slot.id] || !unassigned.length) return;
    slots[slot.id] = unassigned.shift().id;
  });
  return slots;
}

async function startGame(game) {
  const { players, team, games } = getState();
  const active = matchEligiblePlayers(players);
  const presentIds = game.presentIds || [];
  const gkId = game.lineup.slots.gk || null;
  const outfieldIds = Object.entries(game.lineup.slots)
    .filter(([slotId, pid]) => slotId !== 'gk' && pid)
    .map(([, pid]) => pid);

  if (!presentIds.length && !(await confirmDialog('No players marked present yet. Start the game anyway?'))) return;
  if (!gkId && !(await confirmDialog(`No goalkeeper set for the ${periodLabel(gameNumPeriods(game, team), 1)}. Start anyway?`))) return;

  const carryover = matchDayCarryover(games, game);
  const playingTime = {};
  active.forEach((p) => { playingTime[p.id] = carryover[p.id] || 0; });
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
      // When each period's clock actually started, in cumulative match
      // seconds — lets the live view show time elapsed IN THE CURRENT
      // PERIOD (e.g. "6:12" into the 2nd half) instead of the confusing
      // running match total, without changing what elapsedSeconds itself
      // means everywhere else (stints, sub plan minutes, the event log).
      periodStartElapsed: { 1: 0 },
      scoreUs: 0,
      scoreThem: 0,
      onField: outfieldIds,
      gkByPeriod: { 1: gkId },
      sentOff: [],
      playingTime,
      // Snapshot of what playingTime started at, so Stats can tell how many
      // of this game's final minutes were actually played in THIS match vs
      // carried over from an earlier match the same day (see stats.js).
      carryoverSeconds: carryover,
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
        ${game.status === 'scheduled' ? `
          <div class="field-row">
            <div class="field">
              <label>Minutes per period</label>
              <input type="number" name="periodMinutes" min="1" max="60" value="${gamePeriodMinutes(game, getState().team)}" />
            </div>
            <div class="field">
              <label># of periods</label>
              <input type="number" name="numPeriods" min="1" max="4" value="${gameNumPeriods(game, getState().team)}" />
            </div>
          </div>
        ` : ''}
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
          // Fields only present in the form while the game is still
          // scheduled — a live game's period settings can't safely change
          // (see the squad-format block in Settings for the same reason).
          if (fd.has('periodMinutes')) g.periodMinutes = Number(fd.get('periodMinutes')) || g.periodMinutes;
          if (fd.has('numPeriods')) g.numPeriods = Number(fd.get('numPeriods')) || g.numPeriods;
        });
        closeModal();
      });
      modalEl.querySelector('[data-action="delete-game"]').addEventListener('click', async () => {
        if (!(await deleteGame(game))) return;
        closeModal();
      });
    },
  });
}
