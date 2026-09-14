import { getState, update, findGame, saveAutoBackup } from '../store.js';
import { uid, escapeHtml, formatClock, formatDate, periodLabel, matchTypeBadgeHtml, gameNumPeriods, gamePeriodMinutes, upcomingSubs, pickIncoming, pickOutgoing, tryDownloadFile, matchEligiblePlayers, playerPositions } from '../util.js';
import { writeAutoSaveFile } from '../fileHandle.js';
import { outfieldTargetCount, formationFor, formationOptionsFor, remapLineupToFormat } from '../formations.js';
import { violatedRules } from '../rules.js';
import { openModal, closeModal, confirmDialog, alertDialog } from '../modal.js';
import { subPlanSectionHtml, openSubPlanEntryForm, benchDueLineHtml } from '../subPlan.js';

let selectingInboundId = null;
let lastGameId = null;
// Module-level so a drag in progress survives the pointermove/pointerup
// listeners living on `document` (they need to outlast any one render).
let dragState = null;
let suppressNextClick = false;

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
  const active = matchEligiblePlayers(players);
  const byId = Object.fromEntries(active.map((p) => [p.id, p]));
  const live = game.live;
  const isCompleted = game.status === 'completed';
  const targetOutfield = outfieldTargetCount(team.squadFormat);
  const formation = formationFor(team.squadFormat, game.formationId, team.customFormations || []);
  const formationOptions = formationOptionsFor(team.squadFormat, team.customFormations || []);
  const slotByPlayerId = Object.fromEntries(
    Object.entries(game.lineup?.slots || {}).filter(([, pid]) => pid).map(([slotId, pid]) => [pid, slotId])
  );
  const slotLabelById = Object.fromEntries(formation.slots.map((s) => [s.id, s.role]));
  // A game can override the team's default period length/count (set when
  // the match was scheduled) — resolve once and use these everywhere below
  // instead of reading team.numPeriods/periodMinutes directly.
  const numPeriods = gameNumPeriods(game, team);
  const periodMinutes = gamePeriodMinutes(game, team);
  const nextMatch = games.find((g) => g.date === game.date && g.id !== game.id && g.status === 'scheduled');
  // A sibling that exists but isn't "scheduled" (already live, or already
  // finished) still means a match day opponent WAS added — worth saying so
  // explicitly, rather than showing the same "add one" hint as when none
  // exists at all, which reads as if the earlier addition didn't register.
  const otherMatchDaySibling = !nextMatch
    ? games.find((g) => g.date === game.date && g.id !== game.id && g.status !== 'scheduled')
    : null;
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
        <div class="sub">${formatDate(game.date)} · ${isCompleted ? 'Final' : periodLabel(numPeriods, live.currentPeriod)}</div>
        <div style="margin-top:6px;">${matchTypeBadgeHtml(game)}</div>
      </div>
      <a class="icon-btn" href="#/game/${game.id}" aria-label="Back to game">✕</a>
    </div>

    ${!isCompleted ? `<a class="btn ghost sm" href="#/game/${game.id}/lineup" style="margin-bottom:12px; display:inline-flex;">👤 Squad tab — add a late arrival</a>` : ''}

    <div class="card timer-card">
      <div class="timer-display">${formatClock(live.elapsedSeconds)}</div>
      <div class="muted small">${isCompleted ? 'Full time' : periodLabel(numPeriods, live.currentPeriod) + ` · ${periodMinutes} min`}</div>

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
          ${live.currentPeriod < numPeriods
            ? `<button class="btn secondary sm" data-action="next-period">Next: ${periodLabel(numPeriods, live.currentPeriod + 1)}</button>`
            : ''}
        </div>
        <div class="timer-actions">
          <button class="btn danger" data-action="end-game">End Game</button>
          ${nextMatch ? `<button class="btn secondary" data-action="next-match">🏁 End &amp; Next: ${escapeHtml(nextMatch.opponent)}</button>` : ''}
        </div>
        ${!nextMatch ? (otherMatchDaySibling
          ? `<div class="muted small" style="margin-top:4px;">${otherMatchDaySibling.isHome ? 'vs' : '@'} ${escapeHtml(otherMatchDaySibling.opponent)} is also on this date but is ${otherMatchDaySibling.status === 'live' ? 'already live' : 'already finished'} — <a href="#/game/${otherMatchDaySibling.id}${otherMatchDaySibling.status === 'live' ? '/live' : ''}">open it</a> directly instead of using End &amp; Next.</div>`
          : `<div class="muted small" style="margin-top:4px;">Playing a second match today? <a href="#/game/${game.id}">Add a match day opponent</a> to get an "End &amp; Next" button here.</div>`
        ) : ''}
      `}
    </div>

    ${!isCompleted && live.elapsedSeconds >= periodMinutes * 60 * live.currentPeriod && live.currentPeriod < numPeriods
      ? `<div class="banner warn spread"><span>⏱ Time's up for ${periodLabel(numPeriods, live.currentPeriod)}.</span><button class="btn sm" data-action="next-period">Start ${periodLabel(numPeriods, live.currentPeriod + 1)}</button></div>`
      : ''}

    ${goalkeeperCardHtml(team, numPeriods, live, currentGk, isCompleted)}

    ${!isCompleted ? fairPlaySuggestionHtml(team, live, bench, onFieldOutfield, byId) : ''}
    ${!isCompleted ? upcomingSubsHtml(team, live, bench, onFieldOutfield) : ''}
    ${!isCompleted && (onFieldOutfield.length || bench.length)
      ? subPlanSectionHtml(game.subPlan || [], byId, { elapsedMinutes: live.elapsedSeconds / 60, showExecute: true })
      : ''}

    ${!isCompleted && selectingInboundId ? `
      <div class="banner info spread">
        <span>🔵 Bringing on: <strong>${escapeHtml(byId[selectingInboundId]?.name || '')}</strong> — tap an on-field player to swap${onFieldOutfield.length < targetOutfield ? ', or add to an open spot' : ''}.</span>
        <button class="btn sm ghost" data-action="cancel-sub">Cancel</button>
      </div>
      ${onFieldOutfield.length < targetOutfield ? `<button class="btn secondary block" data-action="add-to-pitch" style="margin-bottom:10px;">⬆ Add to Pitch (no swap)</button>` : ''}
    ` : ''}

    ${!isCompleted ? `
      <div class="section-title" style="margin-top:0;">Formation</div>
      <div class="field" style="margin:0 0 10px;">
        <select id="live-formation-select">
          ${formationOptions.map((f) => `<option value="${f.id}" ${formation.id === f.id ? 'selected' : ''}>${escapeHtml(f.label)}${f.custom ? ' (yours)' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="muted small" style="margin:0 0 8px;">Drag a player to move them, or drag a bench player onto a pitch spot to bring them on.</div>
      <div class="pitch-wrap">
        <div class="pitch" id="live-pitch">
          ${formation.slots.map((slot) => livePitchSlotHtml(slot, slot.role === 'GK' ? currentGk : byId[game.lineup?.slots?.[slot.id]])).join('')}
        </div>
      </div>
    ` : ''}

    <div class="section-title">On Field (${onFieldOutfield.length}${isCompleted ? '' : ` / ${targetOutfield} target`})</div>
    <div class="onfield-grid">
      ${onFieldOutfield.length ? onFieldOutfield.map((p) => fieldCardHtml(p, live, isCompleted, true, team, slotLabelById[slotByPlayerId[p.id]])).join('') : '<span class="muted small">No one is on the field.</span>'}
    </div>

    ${!isCompleted ? `
      <div class="section-title">Bench (${bench.length})</div>
      <div class="onfield-grid">
        ${bench.length ? bench.map((p) => benchCardHtml(p, live, game.subPlan || [])).join('') : '<span class="muted small">No one available on the bench.</span>'}
      </div>
    ` : ''}

    ${sentOffPlayers.length ? `
      <div class="section-title">Sent Off</div>
      <div class="card stack">
        ${sentOffPlayers.map((p) => `
          <div class="card-row">
            <span class="small">${escapeHtml(p.name)}</span>
            ${!isCompleted ? `<button type="button" class="btn ghost sm" data-action="recover-player" data-player-id="${p.id}">↩️ Recover</button>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="section-title">Playing Time</div>
    ${hasCarryover ? '<div class="muted small" style="margin:-6px 0 8px;">Includes minutes from earlier match(es) today, so fair-play suggestions stay balanced across the whole match day.</div>' : ''}
    <div class="card">
      ${playingTimeRows(active, live, presentIds)}
    </div>

    ${live.subLog.length ? `
      <div class="section-title">Match Events</div>
      <div class="card">
        ${live.subLog.slice().reverse().map((entry) => eventRowHtml(entry, numPeriods)).join('')}
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
      const msg = live.currentPeriod < numPeriods
        ? `You're still in ${periodLabel(numPeriods, live.currentPeriod)}. End the game early?`
        : 'End the game? Final score and playing time will be locked in.';
      if (!(await confirmDialog(msg, { okLabel: 'End Game' }))) return;
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.status = 'completed';
        g.live.running = false;
      });
      runPostMatchBackup(game);
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
        runPostMatchBackup(game);
        location.hash = `#/game/${nextMatch.id}/lineup`;
      });
    }

    const suggestBtn = app.querySelector('[data-action="use-suggestion"]');
    if (suggestBtn) {
      suggestBtn.addEventListener('click', () => {
        applySub(gameId, suggestBtn.dataset.inId, suggestBtn.dataset.outId, byId, team);
      });
    }

    const addPlanBtn = app.querySelector('[data-action="add-plan-entry"]');
    if (addPlanBtn) {
      addPlanBtn.addEventListener('click', () => {
        openSubPlanEntryForm({
          outgoingOptions: onFieldOutfield,
          incomingOptions: bench,
          onSave: (entry) => {
            update((state) => {
              const g = state.games.find((x) => x.id === gameId);
              g.subPlan = g.subPlan || [];
              g.subPlan.push({ id: uid(), outId: entry.outId, inId: entry.inId, atMinute: entry.atMinute });
            });
          },
        });
      });
    }
    app.querySelectorAll('[data-action="edit-plan-entry"]').forEach((el) => {
      el.addEventListener('click', () => {
        const existing = (game.subPlan || []).find((e) => e.id === el.dataset.planId);
        if (!existing) return;
        openSubPlanEntryForm({
          existing,
          outgoingOptions: onFieldOutfield,
          incomingOptions: bench,
          onSave: (entry) => {
            update((state) => {
              const g = state.games.find((x) => x.id === gameId);
              const idx = (g.subPlan || []).findIndex((e) => e.id === existing.id);
              if (idx !== -1) g.subPlan[idx] = { ...entry, id: existing.id };
            });
          },
          onDelete: (id) => {
            update((state) => {
              const g = state.games.find((x) => x.id === gameId);
              g.subPlan = (g.subPlan || []).filter((e) => e.id !== id);
            });
          },
        });
      });
    });
    app.querySelectorAll('[data-action="execute-plan-entry"]').forEach((el) => {
      el.addEventListener('click', async () => {
        const entry = (game.subPlan || []).find((e) => e.id === el.dataset.planId);
        if (!entry) return;
        await applySub(gameId, entry.inId, entry.outId, byId, team);
        // applySub can bail out (declined stint/rule warning) without making
        // the swap — only drop the planned entry once it's actually on the
        // pitch, so a declined attempt leaves the plan untouched to retry.
        const refreshed = findGame(gameId);
        if (refreshed?.live?.onField?.includes(entry.inId)) {
          update((state) => {
            const g = state.games.find((x) => x.id === gameId);
            g.subPlan = (g.subPlan || []).filter((e) => e.id !== entry.id);
          });
        }
      });
    });

    app.querySelectorAll('[data-action="log-card"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.playerId;
        openRemovalModal(gameId, byId[playerId], team.enableCards);
        if (selectingInboundId === playerId) selectingInboundId = null;
      });
    });

    app.querySelectorAll('[data-action="recover-player"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openRecoverModal(gameId, byId[btn.dataset.playerId]);
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
        const inPlayer = byId[inId];
        const inName = inPlayer?.name || '';
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          g.live.onField.push(inId);
          g.live.stintStart = g.live.stintStart || {};
          g.live.stintStart[inId] = g.live.elapsedSeconds;
          g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'add', inId, inName });
          // Filling an open spot rather than swapping — give them whichever
          // empty formation slot matches their preferred position, falling
          // back to any other empty non-GK slot so the pitch still shows
          // where they are even without a role match.
          const emptySlotIds = Object.keys(g.lineup?.slots || {}).filter((sid) => !g.lineup.slots[sid] && sid !== 'gk');
          const preferredSlotId = emptySlotIds.find((sid) => playerPositions(inPlayer).includes(formation.slots.find((s) => s.id === sid)?.role));
          const chosenSlotId = preferredSlotId || emptySlotIds[0];
          if (chosenSlotId) g.lineup.slots[chosenSlotId] = inId;
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

    const liveFormationSelect = app.querySelector('#live-formation-select');
    if (liveFormationSelect) {
      liveFormationSelect.addEventListener('change', (e) => {
        const newFormationId = e.target.value;
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          const newFormation = formationFor(state.team.squadFormat, newFormationId, state.team.customFormations || []);
          g.formationId = newFormationId;
          g.lineup.slots = remapLiveFormation(g.lineup.slots, g.live.onField, g.live.gkByPeriod[g.live.currentPeriod], newFormation);
        });
      });
    }

    attachPitchDragHandlers(app, gameId, byId, team);

    // Suppresses the synthetic click a browser fires right after a drag's
    // pointerup on the same element — without this, e.g. dropping a bench
    // player onto a pitch slot would also fire that bench card's own
    // tap-to-select click handler immediately afterward. `app` itself is
    // reused across re-renders (only its innerHTML is replaced), so this
    // capturing listener is attached at most once per container rather
    // than piling up a duplicate on every render.
    if (!app.dataset.dragClickGuard) {
      app.dataset.dragClickGuard = '1';
      app.addEventListener('click', (e) => {
        if (suppressNextClick) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }, true);
    }
  }

  return undefined;
}

// Same-id slots keep their player (via remapLineupToFormat), but unlike
// the pre-match Squad tab — where anyone not yet placed is simply "on the
// bench" — a live match has real on-field players who must end up
// SOMEWHERE on the new formation's pitch. Any of them left stranded by
// the id-based remap (their old slot id doesn't exist in the new shape)
// gets dropped into whatever slot is still empty, so nobody actually on
// the field ever ends up with no visible position after a formation swap.
function remapLiveFormation(oldSlots, onFieldIds, gkId, newFormation) {
  const slots = remapLineupToFormat(oldSlots, newFormation);
  const assigned = new Set(Object.values(slots).filter(Boolean));
  const emptySlotIds = newFormation.slots.map((s) => s.id).filter((sid) => !slots[sid]);

  if (gkId && !assigned.has(gkId)) {
    const gkIdx = emptySlotIds.indexOf('gk');
    if (gkIdx !== -1) {
      slots.gk = gkId;
      emptySlotIds.splice(gkIdx, 1);
      assigned.add(gkId);
    }
  }
  onFieldIds.filter((id) => !assigned.has(id)).forEach((id) => {
    const nextSlotId = emptySlotIds.shift();
    if (nextSlotId) slots[nextSlotId] = id;
  });
  return slots;
}

function livePitchSlotHtml(slot, player) {
  const initials = player ? (player.jerseyNumber ?? player.name.slice(0, 2).toUpperCase()) : (slot.role === 'GK' ? '🧤' : '+');
  // GK positioning isn't draggable here — goalkeeper changes go through
  // the dedicated Change/Assign button above, which also handles the
  // stint-warning and gk-change logging that a plain drag would skip.
  const draggable = player && slot.role !== 'GK';
  return `
    <div class="pitch-slot ${player ? '' : 'empty'}" data-live-pitch-slot="${slot.id}" style="left:${slot.x}%; top:${slot.y}%;">
      <div class="chip" ${draggable ? `data-drag-player="${player.id}"` : ''}>${initials}</div>
      <div class="slot-label">${player ? escapeHtml(player.name.split(' ')[0]) : slot.role}</div>
    </div>
  `;
}

// Custom pointer-event-based drag & drop (not native HTML5 DnD, which
// touch browsers support poorly) covering two live interactions:
//  - dragging an on-field chip to another pitch spot repositions them
//    (or swaps with whoever's there) — pure positioning, no substitution.
//  - dragging a bench card onto a pitch spot brings that player on: onto
//    an empty spot it's a straight add, onto an occupied one it's a real
//    substitution (routed through applySub so stint/rule warnings still
//    apply).
function attachPitchDragHandlers(app, gameId, byId, team) {
  const DRAG_THRESHOLD = 8;

  function startDrag(e, sourceType, playerId, sourceSlotId, originEl) {
    if (e.button !== undefined && e.button !== 0) return;
    dragState = { sourceType, playerId, sourceSlotId, originEl, startX: e.clientX, startY: e.clientY, moved: false, ghostEl: null };
    const onMove = (ev) => handleMove(ev);
    const onUp = (ev) => {
      handleUp(ev);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handleMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragState.moved = true;
      dragState.originEl.classList.add('dragging-source');
      const ghost = dragState.originEl.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.width = `${dragState.originEl.offsetWidth}px`;
      ghost.style.height = `${dragState.originEl.offsetHeight}px`;
      document.body.appendChild(ghost);
      dragState.ghostEl = ghost;
    }
    if (dragState.moved && dragState.ghostEl) {
      dragState.ghostEl.style.left = `${e.clientX - dragState.ghostEl.offsetWidth / 2}px`;
      dragState.ghostEl.style.top = `${e.clientY - dragState.ghostEl.offsetHeight / 2}px`;
      autoScrollNearEdge(e.clientY);
    }
  }

  // On a phone the pitch and the bench it's dragged from/to are often not
  // both on-screen at once — without this, dragging a bench player up to
  // the pitch (or a pitch player down to the bench) would require letting
  // go, scrolling, and starting over. Nudges the page when the pointer
  // gets near the top/bottom edge, same convention as most drag-and-drop
  // lists.
  function autoScrollNearEdge(clientY) {
    const margin = 70;
    const vh = window.innerHeight;
    if (clientY < margin) window.scrollBy(0, -(margin - clientY) / 4);
    else if (clientY > vh - margin) window.scrollBy(0, (margin - (vh - clientY)) / 4);
  }

  function handleUp(e) {
    if (!dragState) return;
    const { sourceType, playerId, sourceSlotId, originEl, moved, ghostEl } = dragState;
    if (ghostEl) ghostEl.remove();
    originEl.classList.remove('dragging-source');
    if (moved) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 300);
      const dropEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-live-pitch-slot]');
      if (dropEl) handleDrop(sourceType, playerId, sourceSlotId, dropEl.dataset.livePitchSlot);
    }
    dragState = null;
  }

  function handleDrop(sourceType, playerId, sourceSlotId, targetSlotId) {
    if (!targetSlotId || targetSlotId === 'gk') return;
    if (sourceType === 'pitch' && sourceSlotId === targetSlotId) return;
    const game = findGame(gameId);
    const targetOccupantId = game.lineup?.slots?.[targetSlotId] || null;

    if (sourceType === 'pitch') {
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.lineup.slots[sourceSlotId] = targetOccupantId || null;
        g.lineup.slots[targetSlotId] = playerId;
      });
      return;
    }

    if (targetOccupantId) {
      applySub(gameId, playerId, targetOccupantId, byId, team);
    } else {
      const inPlayer = byId[playerId];
      update((state) => {
        const g = state.games.find((x) => x.id === gameId);
        g.live.onField.push(playerId);
        g.live.stintStart = g.live.stintStart || {};
        g.live.stintStart[playerId] = g.live.elapsedSeconds;
        g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'add', inId: playerId, inName: inPlayer?.name || '' });
        g.lineup.slots[targetSlotId] = playerId;
      });
    }
  }

  app.querySelectorAll('[data-live-pitch-slot] [data-drag-player]').forEach((chip) => {
    chip.addEventListener('pointerdown', (e) => {
      const slotEl = chip.closest('[data-live-pitch-slot]');
      startDrag(e, 'pitch', chip.dataset.dragPlayer, slotEl.dataset.livePitchSlot, slotEl);
    });
  });

  app.querySelectorAll('[data-bench-player]').forEach((benchEl) => {
    benchEl.addEventListener('pointerdown', (e) => {
      startDrag(e, 'bench', benchEl.dataset.benchPlayer, null, benchEl);
    });
  });
}

function removePlayerFromPlay(state, gameId, playerId) {
  const g = state.games.find((x) => x.id === gameId);
  g.live.onField = g.live.onField.filter((id) => id !== playerId);
  Object.keys(g.live.gkByPeriod).forEach((period) => {
    if (g.live.gkByPeriod[period] === playerId) g.live.gkByPeriod[period] = null;
  });
  g.live.sentOff = [...new Set([...(g.live.sentOff || []), playerId])];
  // Frees up whichever formation slot they held so the pitch position
  // shows as vacant rather than still pointing at a player who's gone.
  Object.keys(g.lineup?.slots || {}).forEach((slotId) => {
    if (g.lineup.slots[slotId] === playerId) g.lineup.slots[slotId] = null;
  });
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
    matchEligiblePlayers(getState().players).filter((p) => (game.presentIds || []).includes(p.id)
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
    // The incoming player takes over whichever formation slot the outgoing
    // one held — keeps positions meaningful through the match instead of
    // freezing at kickoff, so "who's playing where" stays accurate live.
    const slotId = Object.keys(g.lineup?.slots || {}).find((sid) => g.lineup.slots[sid] === outId);
    if (slotId) g.lineup.slots[slotId] = inId;
  });
  selectingInboundId = null;
}

function goalkeeperCardHtml(team, numPeriods, live, currentGk, isCompleted) {
  const periods = Array.from({ length: numPeriods }, (_, i) => i + 1);
  const stint = currentGk ? stintSeconds(live, currentGk.id) : null;
  return `
    <div class="card">
      <div class="spread">
        <div>
          <div class="muted small">Goalkeeper — ${periodLabel(numPeriods, live.currentPeriod)}</div>
          <div style="font-weight:700; font-size:15px;">${currentGk ? escapeHtml(currentGk.name) : '⚠️ Not set'}</div>
          ${currentGk && !isCompleted ? `<div class="muted small">Stint: ${formatClock(stint)}</div>` : ''}
        </div>
        <div class="row">
          ${!isCompleted && currentGk ? `<button class="btn danger sm" data-action="log-card" data-player-id="${currentGk.id}">${team.enableCards ? 'Card' : 'Remove'}</button>` : ''}
          ${!isCompleted ? `<button class="btn sm ${currentGk ? 'ghost' : ''}" data-action="${currentGk ? 'change-gk' : 'assign-gk'}">${currentGk ? 'Change' : 'Assign'}</button>` : ''}
        </div>
      </div>
      ${periods.length > 1 ? `<div class="muted small" style="margin-top:8px;">${periods.map((n) => `${periodLabel(numPeriods, n)}: ${live.gkByPeriod[n] ? escapeHtml((getState().players.find((p) => p.id === live.gkByPeriod[n]) || {}).name || '?') : '—'}`).join(' · ')}</div>` : ''}
    </div>
  `;
}

// Fires whenever a match finishes (End Game or End & Next). Snapshots an
// automatic local backup (survives a bad edit or accidental Clear All
// Data — see saveAutoBackup), best-effort downloads a dated file, and
// best-effort overwrites the single self-updating file if the coach has
// chosen one (Settings > Data). The download and file-write only actually
// happen on a normal page; a sandboxed embedding like the Claude Artifact
// viewer blocks a page from starting its own downloads, so both silently
// no-op there — the automatic local snapshot and the manual Backup button
// in Settings are what's guaranteed to work in that context.
function runPostMatchBackup(game) {
  saveAutoBackup();
  const json = JSON.stringify(getState(), null, 2);
  const filename = `bootroom-backup-${game.date}-${game.opponent.replace(/[^a-z0-9]+/gi, '-')}.json`;
  tryDownloadFile(filename, json);
  writeAutoSaveFile(json);
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
  const timeOf = (id) => live.playingTime[id] || 0;
  const streamOf = (id) => byId[id]?.skillStream || null;

  // Due-ness itself stays a straight fairness comparison (same rule as
  // isSubDue, so this banner and the vibrate alert never disagree) — only
  // WHICH specific pair gets named below considers skill stream.
  const mostFieldTime = Math.max(...restEligible.map(time));
  const leastBenchTime = Math.min(...bench.map(time));
  if (mostFieldTime - leastBenchTime <= 60) {
    return `<div class="banner info">⚖️ Playing time looks balanced right now.</div>`;
  }

  const outId = pickOutgoing(restEligible.map((p) => p.id), bench.map((p) => p.id), timeOf, streamOf);
  const inId = pickIncoming(outId, bench.map((p) => p.id), timeOf, streamOf);
  const mostOnField = byId[outId];
  const leastOnBench = byId[inId];

  return `
    <div class="banner warn">
      <div class="spread">
        <span>⚖️ Fair-play suggestion: bring on <strong>${escapeHtml(leastOnBench.name)}</strong> (${formatClock(time(leastOnBench))}) for <strong>${escapeHtml(mostOnField.name)}</strong> (${formatClock(time(mostOnField))})</span>
      </div>
      <button class="btn sm secondary" style="margin-top:8px;" data-action="use-suggestion" data-in-id="${leastOnBench.id}" data-out-id="${mostOnField.id}">Use Suggestion</button>
    </div>
  `;
}

// A forward-looking companion to the fair-play banner above: instead of
// only firing when a swap is actually due, this previews the next couple
// of specific swaps approaching that point — naming who's coming on as
// well as who's coming off — so the coach can tell both players directly
// to get ready, rather than just knowing someone needs to come off.
function upcomingSubsHtml(team, live, bench, onFieldOutfield) {
  if (!team.equalPlayingTimePolicy) return '';
  if (!bench.length || !onFieldOutfield.length) return '';

  const byIdLocal = Object.fromEntries([...bench, ...onFieldOutfield].map((p) => [p.id, p]));
  const streamOf = (id) => byIdLocal[id]?.skillStream || null;
  const upcoming = upcomingSubs(team, live, bench.map((p) => p.id), onFieldOutfield.map((p) => p.id), 3, streamOf);
  if (!upcoming.length) return '';

  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="muted small" style="margin-bottom:8px;">🔜 Coming up — give these players a heads-up</div>
      <div class="row" style="flex-wrap:wrap; gap:6px;">
        ${upcoming.map(({ outId, inId, dueInSeconds }) => {
          const outName = escapeHtml(byIdLocal[outId]?.name || '');
          const inName = inId ? escapeHtml(byIdLocal[inId]?.name || '') : null;
          const label = inName ? `${inName} on for ${outName}` : outName;
          return `<span class="badge ${dueInSeconds <= 0 ? 'live' : 'pending'}">${label} · ${dueInSeconds <= 0 ? 'due now' : 'in ~' + formatClock(dueInSeconds)}</span>`;
        }).join('')}
      </div>
    </div>
  `;
}

function fieldCardHtml(p, live, isCompleted, isOnField, team, positionRole) {
  const seconds = live.playingTime[p.id] || 0;
  const clickable = !isCompleted && selectingInboundId;
  const stint = isOnField ? stintSeconds(live, p.id) : null;
  const minStintSeconds = (team?.minStintMinutes ?? 4) * 60;
  const stintLine = isOnField
    ? `<div class="pt">${stint < minStintSeconds ? '🔒' : ''} Stint: ${formatClock(stint)}</div>`
    : '';
  const cardAction = `<button type="button" class="btn danger sm" style="margin-top:6px;" data-action="log-card" data-player-id="${p.id}">${team?.enableCards ? 'Card / Remove' : 'Remove from Match'}</button>`;
  return `
    <div class="field-card ${clickable ? 'subbing' : ''}" ${clickable ? `data-onfield-player="${p.id}" style="cursor:pointer;"` : ''}>
      <div class="row spread">
        <span class="jersey" style="width:26px;height:26px;font-size:12px;">${p.jerseyNumber ?? '-'}</span>
        <span class="small muted">${positionRole ? escapeHtml(positionRole) : (isOnField ? 'On field' : 'Bench')}</span>
      </div>
      <div style="font-weight:700; font-size:13.5px; margin-top:4px;">${escapeHtml(p.name)}</div>
      <div class="pt">⏱ ${formatClock(seconds)}</div>
      ${stintLine}
      ${!isCompleted ? cardAction : ''}
    </div>
  `;
}

function benchCardHtml(p, live, subPlan) {
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
      ${benchDueLineHtml(p.id, subPlan, live.elapsedSeconds / 60)}
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
  'send-off': '🟥', 'period-start': '⏱', 'gk-change': '🧤', recovered: '↩️',
};

function eventRowHtml(entry, numPeriods) {
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
    case 'send-off': {
      const reasonLabel = { 'second yellow': 'second yellow', injury: 'injury', other: 'other reason' }[entry.reason];
      label = `Sent off: ${escapeHtml(entry.name)}${reasonLabel ? ` (${reasonLabel})` : ''}`;
      break;
    }
    case 'recovered':
      label = `Back available: ${escapeHtml(entry.name)}`;
      break;
    case 'card':
      label = `${entry.cardType === 'red' ? 'Red' : 'Yellow'} card: ${escapeHtml(entry.name)}`;
      break;
    case 'period-start':
      label = `${periodLabel(numPeriods, entry.period)} started`;
      break;
    case 'gk-change':
      label = `Goalkeeper: ${escapeHtml(entry.inName)} on${entry.outName ? `, ${escapeHtml(entry.outName)} off` : ''} (${periodLabel(numPeriods, entry.period)})`;
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

// Covers both "Card / Remove" (cards enabled — yellow/red/injury/other,
// all four unambiguous about whether the player stays on or is done for
// the match) and "Remove from Match" (cards disabled — just injury/other,
// no card bookkeeping). Either way, anything other than a first yellow
// takes the player out of play the same way: off the pitch, cleared from
// any goalkeeper slot, and dropped into sentOff so they can never be
// picked again as a sub for the rest of this match.
function openRemovalModal(gameId, player, enableCards) {
  if (!player) return;
  const game = findGame(gameId);
  const priorYellows = (game.live.subLog || []).filter(
    (e) => e.type === 'card' && e.cardType === 'yellow' && e.playerId === player.id
  ).length;
  const options = enableCards
    ? [
        { value: 'yellow', label: '🟨 Yellow card (stays on)' },
        { value: 'red', label: '🟥 Red card (sent off)' },
        { value: 'injury', label: '🚑 Injury (sent off, no card)' },
        { value: 'other', label: 'Other reason (sent off, no card)' },
      ]
    : [
        { value: 'injury', label: '🚑 Injury (sent off)' },
        { value: 'other', label: 'Other reason (sent off)' },
      ];

  openModal({
    title: `${enableCards ? 'Card / Remove' : 'Remove from Match'} — ${escapeHtml(player.name)}`,
    bodyHtml: `
      <form id="card-form" class="stack">
        <div class="field">
          <label>What happened?</label>
          <select name="kind">
            ${options.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </div>
        ${enableCards && priorYellows >= 1 ? `<p class="muted small" style="margin:0;">Already has a yellow card this match — picking Yellow again will automatically send them off.</p>` : ''}
        <button type="submit" class="btn block">${enableCards ? 'Log' : 'Remove'}</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#card-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const kind = new FormData(e.target).get('kind');
        let secondYellow = false;
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          if (kind === 'yellow') {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'card', cardType: 'yellow', playerId: player.id, name: player.name });
            if (priorYellows >= 1) {
              // A second yellow is a send-off by the laws of the game, not
              // a coach's call — apply it automatically rather than making
              // them separately notice and pick Red/Other themselves.
              secondYellow = true;
              removePlayerFromPlay(state, gameId, player.id);
              g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'send-off', playerId: player.id, name: player.name, reason: 'second yellow' });
            }
            return;
          }
          removePlayerFromPlay(state, gameId, player.id);
          if (kind === 'red') {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'card', cardType: 'red', playerId: player.id, name: player.name });
          } else {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'send-off', playerId: player.id, name: player.name, reason: kind === 'injury' ? 'injury' : 'other' });
          }
        });
        closeModal();
        if (secondYellow) alertDialog(`${player.name} picked up a second yellow card — automatically sent off and excluded from further substitutions.`);
      });
    },
  });
}

// Finds whichever subLog entries actually put this player into sentOff,
// searching back from the most recent — a straight red is one 'card'
// entry; a second-yellow send-off is that 'send-off' entry plus the
// specific 'card'/yellow entry right before it (not their first, valid
// yellow); an injury/other removal is just the one 'send-off' entry.
// Used both to describe why they're sent off in the Recover dialog, and
// — if the coach says it was logged in error — to know exactly what to
// delete so the record ends up as if it never happened.
function findRemovalReason(subLog, playerId) {
  for (let i = subLog.length - 1; i >= 0; i--) {
    const e = subLog[i];
    if (e.playerId !== playerId) continue;
    if (e.type === 'card' && e.cardType === 'red') return { reason: 'red card', indexes: [i] };
    if (e.type === 'send-off' && e.reason === 'second yellow') {
      // The specific yellow that triggered this: the *last* yellow logged
      // for this player before this send-off, found by scanning backward.
      let secondYellowIdx = -1;
      for (let k = i - 1; k >= 0; k--) {
        if (subLog[k].type === 'card' && subLog[k].cardType === 'yellow' && subLog[k].playerId === playerId) { secondYellowIdx = k; break; }
      }
      return { reason: 'second yellow card', indexes: secondYellowIdx !== -1 ? [secondYellowIdx, i] : [i] };
    }
    if (e.type === 'send-off') return { reason: e.reason === 'injury' ? 'injury' : 'other reason', indexes: [i] };
  }
  return { reason: 'unknown reason', indexes: [] };
}

function openRecoverModal(gameId, player) {
  if (!player) return;
  const game = findGame(gameId);
  const { reason, indexes } = findRemovalReason(game.live.subLog || [], player.id);

  openModal({
    title: `Recover — ${escapeHtml(player.name)}`,
    bodyHtml: `
      <form id="recover-form" class="stack">
        <p class="muted small mt-0">Currently sent off: <strong>${escapeHtml(reason)}</strong>. Recovering makes them available for subs again — it doesn't put them straight back on the pitch.</p>
        <label class="checkbox-row">
          <input type="checkbox" name="mistake" />
          This was logged by mistake — also remove it from the match record
        </label>
        <button type="submit" class="btn block">Recover</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#recover-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const mistake = new FormData(e.target).get('mistake') === 'on';
        update((state) => {
          const g = state.games.find((x) => x.id === gameId);
          g.live.sentOff = (g.live.sentOff || []).filter((id) => id !== player.id);
          if (mistake && indexes.length) {
            const toRemove = new Set(indexes);
            g.live.subLog = g.live.subLog.filter((_, i) => !toRemove.has(i));
          } else {
            g.live.subLog.push({ atSeconds: g.live.elapsedSeconds, type: 'recovered', playerId: player.id, name: player.name });
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
          // Keeps the pitch view's gk slot pointing at whoever's actually
          // in goal this period — this is the only place a GK is set, so
          // without this the live pitch's display fallback (currentGk)
          // would be right but the underlying slot data would silently
          // drift from it.
          if (g.lineup?.slots) g.lineup.slots.gk = g.live.gkByPeriod[g.live.currentPeriod] || null;
        });
        closeModal();
      });
    },
  });
}
