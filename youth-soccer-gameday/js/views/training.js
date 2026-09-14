import { getState, update, findTraining, findDrill } from '../store.js';
import { uid, escapeHtml, formatDate, formatTime, formatClock, sortByDateTime, todayIso, nowHHMM, copyToClipboard } from '../util.js';
import { buildGroupsByStream } from '../trainingGroups.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { openDrillForm as openDrillLibraryForm, openDrillDetailModal } from './drills.js';
import { splitBalancedTeams } from './balanceTeams.js';

let selectingPlayerId = null;
let selectingSourceGroupId = null;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function renderTraining(app) {
  const { trainings } = getState();
  const upcoming = sortByDateTime(trainings.filter((t) => t.date >= todayIso()));
  const past = sortByDateTime(trainings.filter((t) => t.date < todayIso())).reverse();

  app.innerHTML = `
    <div class="page-title">
      <h1>Training</h1>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <a class="btn ghost sm" href="#/drills">📚 Drill Library</a>
        <button class="btn ghost sm" data-action="add-drill">+ Add Drill</button>
        <button class="btn" data-action="add-training">+ Add Training</button>
      </div>
    </div>

    <div class="section-title" style="margin-top:0;">Upcoming</div>
    ${upcoming.length ? upcoming.map(trainingCard).join('') : '<div class="card empty">No upcoming training sessions.</div>'}

    ${past.length ? `
      <div class="section-title">Past</div>
      ${past.map(trainingCard).join('')}
    ` : ''}
  `;

  app.querySelector('[data-action="add-training"]').addEventListener('click', () => openTrainingForm());
  app.querySelector('[data-action="add-drill"]').addEventListener('click', () => openDrillLibraryForm());
}

function trainingCard(training) {
  const groupCount = (training.groups || []).length;
  const blockCount = (training.blocks || []).length;
  return `
    <a class="card" href="#/training/${training.id}/${training.live ? 'plan' : 'attendance'}" style="display:block;">
      <div class="card-row">
        <div>
          <div style="font-weight:700; font-size:15px;">Training${training.live ? ' · <span style="color:var(--red);">🔴 LIVE</span>' : ''}</div>
          <div class="muted small">${formatDate(training.date)} · ${formatTime(training.time)}${training.location ? ' · ' + escapeHtml(training.location) : ''}</div>
          <div class="muted small">${(training.presentIds || []).length} attending${groupCount ? ` · ${groupCount} group${groupCount === 1 ? '' : 's'}` : ''}${blockCount ? ` · ${blockCount} plan block${blockCount === 1 ? '' : 's'}` : ''}</div>
        </div>
      </div>
    </a>
  `;
}

export function openTrainingForm(existing) {
  const pf = existing || {};
  openModal({
    title: existing ? 'Edit Training' : 'Add Training',
    bodyHtml: `
      <form id="training-form" class="stack">
        <div class="field-row">
          <div class="field">
            <label>Date</label>
            <input type="date" name="date" value="${pf.date || todayIso()}" required />
          </div>
          <div class="field">
            <label>Time</label>
            <input type="time" name="time" value="${pf.time || nowHHMM()}" required />
          </div>
        </div>
        <div class="field">
          <label>Location</label>
          <input type="text" name="location" value="${escapeHtml(pf.location || '')}" placeholder="Field / address" />
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn block">${existing ? 'Save' : 'Add Training'}</button>
          ${existing ? '<button type="button" class="btn danger" data-action="delete-training">Delete</button>' : ''}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#training-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const date = fd.get('date');
        const time = fd.get('time');
        const loc = (fd.get('location') || '').trim();
        if (existing) {
          update((state) => {
            const t = state.trainings.find((x) => x.id === existing.id);
            t.date = date;
            t.time = time;
            t.location = loc;
          });
          closeModal();
        } else {
          const id = uid();
          update((state) => {
            state.trainings.push({ id, date, time, location: loc, presentIds: [], groups: [], blocks: [] });
          });
          closeModal();
          location.hash = `#/training/${id}/attendance`;
        }
      });
      const deleteBtn = modalEl.querySelector('[data-action="delete-training"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!(await confirmDialog('Delete this training session? This can\'t be undone.', { okLabel: 'Delete', danger: true }))) return;
          update((state) => {
            state.trainings = state.trainings.filter((t) => t.id !== existing.id);
          });
          closeModal();
          window.location.hash = '#/training';
        });
      }
    },
  });
}

export function renderTrainingDetail(app, trainingId, tab) {
  const training = findTraining(trainingId);
  if (!training) {
    app.innerHTML = '<p class="empty">Training session not found. <a href="#/training">Back to training</a></p>';
    return;
  }
  selectingPlayerId = null;
  selectingSourceGroupId = null;

  const { players, team } = getState();
  const shareText = formatTrainingForShare(training, players, team.name);

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Training</h1>
        <div class="sub">${formatDate(training.date)} · ${formatTime(training.time)}${training.location ? ' · ' + escapeHtml(training.location) : ''}</div>
      </div>
      <div class="row" style="gap:4px;">
        <button class="btn ghost sm" data-action="add-drill">+ Add Drill</button>
        <button class="icon-btn" data-action="edit-training" aria-label="Edit training">✏️</button>
      </div>
    </div>

    <div class="card">
      <div class="spread" style="align-items:center;">
        <span class="small">${(training.presentIds || []).length} attending${(training.groups || []).length ? ` · ${training.groups.length} groups` : ''}${(training.matchTeams || []).length ? ` · ${training.matchTeams.length} match teams` : ''}${(training.blocks || []).length ? ` · ${training.blocks.length} plan blocks` : ''}</span>
        <div class="row" style="gap:8px;">
          <button class="btn secondary sm" data-action="copy-session">📋 Copy to Share</button>
          <button class="btn secondary sm" data-action="native-share-session" hidden>📤 Text / Share…</button>
        </div>
      </div>
      <textarea id="session-share-fallback" readonly hidden style="width:100%; min-height:100px; font-family:monospace; font-size:12px; padding:8px; border:1px solid var(--line); border-radius:8px; margin-top:10px;">${escapeHtml(shareText)}</textarea>
    </div>

    <div class="tabs">
      <a class="tab ${tab === 'attendance' ? 'active' : ''}" href="#/training/${training.id}/attendance">Attendance</a>
      <a class="tab ${tab === 'groups' ? 'active' : ''}" href="#/training/${training.id}/groups">Groups</a>
      <a class="tab ${tab === 'matches' ? 'active' : ''}" href="#/training/${training.id}/matches">Matches</a>
      <a class="tab ${tab === 'plan' ? 'active' : ''}" href="#/training/${training.id}/plan">Plan</a>
    </div>

    <div id="tab-content"></div>
  `;

  app.querySelector('[data-action="edit-training"]').addEventListener('click', () => openTrainingForm(training));
  app.querySelector('[data-action="add-drill"]').addEventListener('click', () => openDrillLibraryForm());

  const copyBtn = app.querySelector('[data-action="copy-session"]');
  const nativeBtn = app.querySelector('[data-action="native-share-session"]');
  const fallbackEl = app.querySelector('#session-share-fallback');
  if (typeof navigator.share === 'function') nativeBtn.hidden = false;

  copyBtn.addEventListener('click', async () => {
    await copyToClipboard(shareText, {
      onSuccess: () => { copyBtn.textContent = '✅ Copied!'; },
      onFallback: () => {
        fallbackEl.hidden = false;
        fallbackEl.focus();
        fallbackEl.select();
        copyBtn.textContent = 'Select the text below and copy it';
      },
    });
    setTimeout(() => { copyBtn.textContent = '📋 Copy to Share'; }, 2500);
  });

  nativeBtn.addEventListener('click', async () => {
    try {
      await navigator.share({ title: `${team.name || 'Boot Room'} Training Session`, text: shareText });
    } catch {
      // User cancelled the share sheet, or it's unsupported here — Copy above always works.
    }
  });

  const content = app.querySelector('#tab-content');
  if (tab === 'groups') renderGroupsTab(content, training);
  else if (tab === 'matches') renderMatchesTab(content, training);
  else if (tab === 'plan') renderPlanTab(content, training);
  else renderAttendanceTab(content, training);
}

function renderAttendanceTab(container, training) {
  const { players } = getState();
  const active = players.filter((p) => p.active);
  const presentIds = new Set(training.presentIds || []);
  const present = active.filter((p) => presentIds.has(p.id));

  container.innerHTML = `
    <div class="spread" style="margin-bottom:10px;">
      <span class="muted small">${present.length}/${active.length} present</span>
      <div class="row" style="gap:8px;">
        <button class="btn ghost sm" data-action="mark-all-present">Mark All Present</button>
        <button class="btn ghost sm" data-action="mark-none-present">Mark None</button>
      </div>
    </div>
    <div class="card">
      <div class="chip-list">
        ${active.length ? active.map((p) => attendanceChipHtml(p, presentIds.has(p.id))).join('') : '<span class="muted small">No active players on the roster.</span>'}
      </div>
    </div>
    ${present.length ? '<div class="banner info" style="margin-top:12px;">Head to the Groups tab to build training groups from who\'s here.</div>' : ''}
  `;

  container.querySelector('[data-action="mark-all-present"]').addEventListener('click', () => {
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      t.presentIds = state.players.filter((p) => p.active).map((p) => p.id);
    });
  });
  container.querySelector('[data-action="mark-none-present"]').addEventListener('click', () => {
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      t.presentIds = [];
    });
  });

  container.querySelectorAll('[data-attendance-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const playerId = el.dataset.attendanceToggle;
      update((state) => {
        const t = state.trainings.find((x) => x.id === training.id);
        const set = new Set(t.presentIds || []);
        if (set.has(playerId)) set.delete(playerId);
        else set.add(playerId);
        t.presentIds = [...set];
      });
    });
  });
}

function attendanceChipHtml(p, isPresent) {
  return `
    <button type="button" class="bench-chip ${isPresent ? 'picking' : ''}" data-attendance-toggle="${p.id}">
      <span class="jersey">${p.jerseyNumber ?? '-'}</span>
      ${escapeHtml(p.name)} ${isPresent ? '✅' : '⚪'}
    </button>
  `;
}

// "Same stream" reuses the training-groups clustering algorithm (players
// of similar ability trained together, coachable at one level); "Mixed
// ability" reuses Balance Teams' even-spread algorithm so each group gets
// a fair cross-section of every stream instead — useful when the point of
// a station is players of different levels working together (e.g. older
// players helping younger ones), or just to vary things up. Mirrors the
// same two-mode choice already offered on the Matches tab.
function buildMixedGroups(players, count) {
  return splitBalancedTeams(players, count).map((groupPlayers, i) => ({ id: uid(), name: `Group ${i + 1}`, playerIds: groupPlayers.map((p) => p.id) }));
}

function renderGroupsTab(container, training) {
  const { players } = getState();
  const presentIds = new Set(training.presentIds || []);
  const present = players.filter((p) => p.active && presentIds.has(p.id));
  const groups = training.groups || [];
  const byId = Object.fromEntries(present.map((p) => [p.id, p]));
  const mode = training.groupMode || 'stream';
  const maxGroups = Math.max(1, present.length);

  if (!present.length) {
    container.innerHTML = `<div class="banner info">Mark who's here on the Attendance tab first, then come back to build groups.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="tabs" style="max-width:360px;">
        <div class="tab ${mode === 'stream' ? 'active' : ''}" data-group-mode="stream">Same stream</div>
        <div class="tab ${mode === 'mixed' ? 'active' : ''}" data-group-mode="mixed">Mixed ability</div>
      </div>
      <div class="field-row" style="align-items:flex-end; margin-top:10px;">
        <div class="field" style="max-width:180px;">
          <label>Number of groups</label>
          <input type="number" id="group-target-count" min="1" max="${maxGroups}" placeholder="${mode === 'mixed' ? '' : 'Auto'}" value="${groups.length || ''}" />
        </div>
        <button class="btn secondary" data-action="auto-build-groups">🎲 ${groups.length ? 'Rebuild Groups' : 'Auto-Build Groups'}</button>
      </div>
      ${mode === 'stream' ? `
        <label class="checkbox-row" style="margin-top:8px;">
          <input type="checkbox" id="group-balance-numbers" checked />
          ⚖️ Balance numbers across groups
        </label>
      ` : ''}
      <div class="muted small" style="margin-top:6px;">${mode === 'stream'
        ? 'Groups cluster players of similar ability together. Leave "Number of groups" blank for one group per skill stream present, or set a number to merge or split streams to fit. With balancing on, sizes are then evened out (moving a player to a neighbouring group where needed) so no group ends up much bigger than another.'
        : 'Each skill stream is spread evenly across every group, rather than kept together — useful for mixed-ability stations, or just to vary things up. Set how many groups you want (numbers are balanced automatically).'}</div>
    </div>

    ${groups.length ? `
      <div class="banner info" style="margin-top:12px;">Tap a player to select them, then tap "Move here" on another group to move them across — handy when a group ends up too big or too small.</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; margin-top:12px;">
        ${groups.map((g) => groupCardHtml(g, byId)).join('')}
      </div>
    ` : '<div class="card empty" style="margin-top:12px;">No groups yet — tap Auto-Build Groups above.</div>'}
  `;

  container.querySelectorAll('[data-group-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      update((state) => {
        const t = state.trainings.find((x) => x.id === training.id);
        t.groupMode = el.dataset.groupMode;
      });
    });
  });

  container.querySelector('[data-action="auto-build-groups"]').addEventListener('click', () => {
    const raw = container.querySelector('#group-target-count').value;
    const currentMode = training.groupMode || 'stream';
    const newGroups = currentMode === 'mixed'
      ? buildMixedGroups(present, Math.max(1, Math.min(maxGroups, Number(raw) || groups.length || 2)))
      : buildGroupsByStream(present, raw ? Number(raw) : null, container.querySelector('#group-balance-numbers').checked);
    selectingPlayerId = null;
    selectingSourceGroupId = null;
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      t.groups = newGroups;
      // Clear any per-group activities from the Plan tab that pointed at
      // groups which no longer exist after a rebuild — a stale id there
      // would just be dead weight, never shown again.
      const groupIds = new Set(newGroups.map((g) => g.id));
      (t.blocks || []).forEach((block) => {
        if (block.mode === 'grouped') {
          Object.keys(block.groupActivities || {}).forEach((gid) => {
            if (!groupIds.has(gid)) delete block.groupActivities[gid];
          });
        }
      });
    });
  });

  container.querySelectorAll('[data-group-player]').forEach((el) => {
    el.addEventListener('click', () => {
      const playerId = el.dataset.groupPlayer;
      const groupId = el.dataset.sourceGroup;
      if (selectingPlayerId === playerId) {
        selectingPlayerId = null;
        selectingSourceGroupId = null;
      } else {
        selectingPlayerId = playerId;
        selectingSourceGroupId = groupId;
      }
      renderGroupsTab(container, findTraining(training.id));
    });
  });

  container.querySelectorAll('[data-move-to-group]').forEach((el) => {
    el.addEventListener('click', () => {
      const targetGroupId = el.dataset.moveToGroup;
      const playerId = selectingPlayerId;
      const sourceGroupId = selectingSourceGroupId;
      if (!playerId || !sourceGroupId) return;
      selectingPlayerId = null;
      selectingSourceGroupId = null;
      update((state) => {
        const t = state.trainings.find((x) => x.id === training.id);
        const source = t.groups.find((g) => g.id === sourceGroupId);
        const target = t.groups.find((g) => g.id === targetGroupId);
        if (!source || !target) return;
        source.playerIds = source.playerIds.filter((id) => id !== playerId);
        if (!target.playerIds.includes(playerId)) target.playerIds.push(playerId);
      });
    });
  });
}

function groupCardHtml(group, byId) {
  const isSourceGroup = selectingSourceGroupId === group.id;
  const groupPlayers = group.playerIds.map((id) => byId[id]).filter(Boolean);
  const counts = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  groupPlayers.forEach((p) => { counts[p.skillStream && counts[p.skillStream] !== undefined ? p.skillStream : 'none'] += 1; });
  return `
    <div class="card" data-group-card="${group.id}" style="flex:1 1 220px;">
      <div class="spread" style="margin-bottom:6px;">
        <div style="font-weight:700;">${escapeHtml(group.name)} (${groupPlayers.length})</div>
        ${selectingPlayerId && !isSourceGroup ? `<button type="button" class="btn ghost sm" data-move-to-group="${group.id}">Move here →</button>` : ''}
      </div>
      <div class="muted small" style="margin-bottom:8px;">A:${counts.A} · B:${counts.B} · C:${counts.C} · D:${counts.D}${counts.none ? ` · Unclassified:${counts.none}` : ''}</div>
      <div class="stack">
        ${groupPlayers.length ? groupPlayers.map((p) => `
          <button type="button" class="bench-chip ${selectingPlayerId === p.id ? 'picking' : ''}" data-group-player="${p.id}" data-source-group="${group.id}" style="justify-content:flex-start;">
            <span class="jersey">${p.jerseyNumber ?? '-'}</span>
            ${escapeHtml(p.name)}
          </button>
        `).join('') : '<span class="muted small">No one in this group.</span>'}
      </div>
    </div>
  `;
}

const MATCH_MIN_TEAMS = 2;
const MATCH_MIN_PLAYERS_PER_TEAM = 2;

// Small-sided match teams are a separate concept from coaching Groups: a
// Group is about running a station at the right ability level, a Match
// Team is about who plays who. "Same stream" reuses the training-groups
// clustering algorithm (players of similar ability play each other,
// useful for running two matches at different intensities); "mixed"
// reuses Balance Teams' even-spread algorithm (a fair, competitive single
// match). Shuffling the input first means "Randomize Again" gives a
// different split even in same-stream mode whenever a stream has to be
// divided to fit the team count.
function buildMatchTeams(players, count, mode) {
  const groups = mode === 'mixed'
    ? splitBalancedTeams(players, count).map((teamPlayers) => ({ playerIds: teamPlayers.map((p) => p.id) }))
    : buildGroupsByStream(shuffle(players), count);
  return groups.map((g, i) => ({ id: uid(), name: `Team ${i + 1}`, playerIds: g.playerIds }));
}

function renderMatchesTab(container, training) {
  const { players } = getState();
  const presentIds = new Set(training.presentIds || []);
  const present = players.filter((p) => p.active && presentIds.has(p.id));
  const byId = Object.fromEntries(present.map((p) => [p.id, p]));
  const maxTeams = Math.max(MATCH_MIN_TEAMS, Math.floor(present.length / MATCH_MIN_PLAYERS_PER_TEAM));
  const teamCount = Math.min(training.matchTeamCount || MATCH_MIN_TEAMS, maxTeams);
  const mode = training.matchMode || 'same';
  const teams = training.matchTeams || [];

  if (!present.length) {
    container.innerHTML = `<div class="banner info">Mark who's here on the Attendance tab first, then come back to set up small-sided matches.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field" style="max-width:160px;">
          <label>Number of teams</label>
          <input type="number" id="match-team-count" min="${MATCH_MIN_TEAMS}" max="${maxTeams}" value="${teamCount}" />
        </div>
        <button class="btn secondary" data-action="build-matches">🎲 ${teams.length ? 'Randomize Again' : 'Build Match Teams'}</button>
      </div>
      <div class="muted small" style="margin-top:6px;">Up to ${maxTeams} team${maxTeams === 1 ? '' : 's'} with ${present.length} present (at least ${MATCH_MIN_PLAYERS_PER_TEAM} players each).</div>
      <div class="tabs" style="margin-top:10px; max-width:360px;">
        <div class="tab ${mode === 'same' ? 'active' : ''}" data-match-mode="same">Same stream</div>
        <div class="tab ${mode === 'mixed' ? 'active' : ''}" data-match-mode="mixed">Mixed ability</div>
      </div>
      <div class="muted small" style="margin-top:6px;">${mode === 'same'
        ? 'Groups players of similar ability together — good for running separate matches at different intensities.'
        : 'Spreads each skill stream evenly across every team — a fair, competitive match.'}</div>
    </div>

    ${teams.length ? `
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; margin-top:12px;">
        ${teams.map((t) => matchTeamCardHtml(t, byId)).join('')}
      </div>
    ` : '<div class="card empty" style="margin-top:12px;">No match teams yet — tap Build Match Teams above.</div>'}
  `;

  container.querySelectorAll('[data-match-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      update((state) => {
        const t = state.trainings.find((x) => x.id === training.id);
        t.matchMode = el.dataset.matchMode;
      });
    });
  });

  container.querySelector('[data-action="build-matches"]').addEventListener('click', () => {
    const countInput = container.querySelector('#match-team-count');
    const count = Math.max(MATCH_MIN_TEAMS, Math.min(maxTeams, Number(countInput.value) || MATCH_MIN_TEAMS));
    const currentMode = training.matchMode || 'same';
    const newTeams = buildMatchTeams(present, count, currentMode);
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      t.matchTeamCount = count;
      t.matchTeams = newTeams;
    });
  });
}

function matchTeamCardHtml(team, byId) {
  const teamPlayers = team.playerIds.map((id) => byId[id]).filter(Boolean);
  const counts = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  teamPlayers.forEach((p) => { counts[p.skillStream && counts[p.skillStream] !== undefined ? p.skillStream : 'none'] += 1; });
  return `
    <div class="card" style="flex:1 1 220px;">
      <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(team.name)} (${teamPlayers.length})</div>
      <div class="muted small" style="margin-bottom:8px;">A:${counts.A} · B:${counts.B} · C:${counts.C} · D:${counts.D}${counts.none ? ` · Unclassified:${counts.none}` : ''}</div>
      <div class="stack">
        ${teamPlayers.length ? teamPlayers.map((p) => `
          <div class="player-row">
            <div class="jersey">${p.jerseyNumber ?? '-'}</div>
            <div class="player-meta"><div class="player-name">${escapeHtml(p.name)}</div></div>
          </div>
        `).join('') : '<span class="muted small">No one on this team.</span>'}
      </div>
    </div>
  `;
}

function addMinutesToTime(hhmm, minutes) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// A rotation block runs the same activities as a normal grouped block, but
// instead of every group staying at its own activity for the whole block,
// groups rotate through every station in turn — so the block actually
// takes as long as one rotation × however many stations there are, not
// just one rotation's worth. Station count is the number of groups with
// an activity actually set, falling back to the group count so an
// in-progress block (no activities typed yet) still shows a sane total.
function rotationStationCount(block, groups) {
  const active = groups.filter((g) => ((block.groupActivities || {})[g.id] || '').trim());
  return active.length || groups.length;
}

function blockEffectiveMinutes(block, groups) {
  if (block.mode === 'grouped' && block.rotate) {
    return (block.minutes || 0) * rotationStationCount(block, groups);
  }
  return block.minutes || 0;
}

// Lays the plan out on a single timeline in seconds — each entry's
// start/end is where that block sits in the overall session once rotation
// blocks are expanded to their full (minutes × stations) length. The live
// timer derives "what's happening right now" purely from elapsed seconds
// against this timeline, rather than tracking a separate block pointer, so
// skipping/rewinding is just moving a number.
function planTimeline(training) {
  const groups = training.groups || [];
  let cursor = 0;
  return (training.blocks || []).map((block) => {
    const effectiveSeconds = blockEffectiveMinutes(block, groups) * 60;
    const start = cursor;
    cursor += effectiveSeconds;
    return { block, startSeconds: start, endSeconds: cursor, effectiveSeconds };
  });
}

// Takes an already-computed timeline (not the training object) so callers
// that also need the array itself — for indexOf, length, etc. — get back
// an entry that's actually === one of its own elements, rather than a
// fresh object from a second, separate planTimeline() call.
function currentTimelineEntry(timeline, elapsedSeconds) {
  if (!timeline.length) return null;
  return timeline.find((e) => elapsedSeconds < e.endSeconds) || timeline[timeline.length - 1];
}

// Within a rotation block, which "leg" (0-indexed rotation) is current and
// how much of it remains.
function rotationLegInfo(block, groups, secondsIntoBlock) {
  const stations = rotationStationCount(block, groups);
  const legSeconds = Math.max(1, block.minutes || 1) * 60;
  const legIndex = Math.min(stations - 1, Math.floor(secondsIntoBlock / legSeconds));
  const secondsIntoLeg = secondsIntoBlock - legIndex * legSeconds;
  return { legIndex, stations, secondsIntoLeg, legSeconds };
}

// Falls back to matching the activity's own text against a saved drill's
// name (case/whitespace-insensitive) whenever there's no explicit link —
// covers activity text that was typed by hand rather than picked from the
// "📚 Fill from Drill Library…" dropdown (including every block from
// before that link existed, like the sample seed data, or from before
// this feature was added at all), so "View Drill" can still show up for
// anything that happens to already match a real drill by name.
function resolveActivityDrillId(activityText, explicitDrillId) {
  if (explicitDrillId) return explicitDrillId;
  const text = (activityText || '').trim().toLowerCase();
  if (!text) return null;
  const match = getState().drills.find((d) => d.name.trim().toLowerCase() === text);
  return match ? match.id : null;
}

// What each real group is actually doing during a given rotation leg: at
// leg 0 every group is at its own station; at leg L each group has moved
// on to the station that was L groups ahead of it, cycling back around —
// i.e. everyone visits every station exactly once by the last leg.
function rotationAssignment(block, groups, legIndex) {
  const activeGroups = groups.filter((g) => ((block.groupActivities || {})[g.id] || '').trim());
  const n = activeGroups.length;
  if (!n) return [];
  return activeGroups.map((g, i) => {
    const stationGroup = activeGroups[(i + legIndex) % n];
    const activity = (block.groupActivities || {})[stationGroup.id];
    return {
      group: g,
      activity,
      drillId: resolveActivityDrillId(activity, (block.groupActivityDrillIds || {})[stationGroup.id]),
    };
  });
}

// Ticks a live session forward by one second (called from main.js's global
// per-second ticker, same pattern as a live match's clock). Returns true
// exactly when this tick crosses into a new block, so the caller can fire
// an attention chime — never on the tick that finishes the whole plan,
// since there's nothing left to alert about.
export function advanceTrainingLive(training) {
  if (!training.live || !training.live.running) return false;
  const timeline = planTimeline(training);
  const total = timeline.length ? timeline[timeline.length - 1].endSeconds : 0;
  const before = currentTimelineEntry(timeline, training.live.elapsedSeconds);
  training.live.elapsedSeconds += 1;
  if (training.live.elapsedSeconds >= total) {
    training.live.running = false;
    training.live.elapsedSeconds = total;
    return false;
  }
  const after = currentTimelineEntry(timeline, training.live.elapsedSeconds);
  return !!(before && after && before.block.id !== after.block.id);
}

// Plain-text summary of a whole session — attendance, groups, and the full
// plan — for the Copy to Share / native Share button, so a coach can drop
// the whole thing into a WhatsApp message or text to another coach without
// retyping it. Deliberately not HTML: it's meant to be pasted somewhere
// else entirely, not rendered in this app.
function formatTrainingForShare(training, players, teamName) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const groups = training.groups || [];
  const blocks = training.blocks || [];

  const lines = [
    `${teamName || 'Boot Room'} — Training`,
    `${formatDate(training.date)} · ${formatTime(training.time)}${training.location ? ' · ' + training.location : ''}`,
    '',
  ];

  const present = (training.presentIds || []).map((id) => byId[id]).filter(Boolean);
  lines.push(`Attendance (${present.length}):`);
  lines.push(present.length ? present.map((p) => p.name).join(', ') : '—');

  if (groups.length) {
    lines.push('', 'Groups:');
    groups.forEach((g) => {
      const names = g.playerIds.map((id) => byId[id]?.name).filter(Boolean);
      lines.push(`  ${g.name} (${names.length}): ${names.join(', ') || '—'}`);
    });
  }

  const matchTeams = training.matchTeams || [];
  if (matchTeams.length) {
    lines.push('', `Match Teams (${training.matchMode === 'mixed' ? 'mixed ability' : 'same stream'}):`);
    matchTeams.forEach((t) => {
      const names = t.playerIds.map((id) => byId[id]?.name).filter(Boolean);
      lines.push(`  ${t.name} (${names.length}): ${names.join(', ') || '—'}`);
    });
  }

  if (blocks.length) {
    const totalMinutes = blocks.reduce((sum, b) => sum + blockEffectiveMinutes(b, groups), 0);
    const endTime = totalMinutes ? addMinutesToTime(training.time, totalMinutes) : null;
    lines.push('', `Plan (${totalMinutes} min total${endTime ? `, ends ~${formatTime(endTime)}` : ''}):`);
    blocks.forEach((b, i) => {
      if (b.isBreak) {
        lines.push(`  ${i + 1}. ${b.minutes} min — ☕ Break${b.activity ? ': ' + b.activity : ''}`);
      } else if (b.mode === 'grouped') {
        if (b.rotate) {
          const stations = rotationStationCount(b, groups);
          lines.push(`  ${i + 1}. ${b.minutes} min × ${stations} rotations (${b.minutes * stations} min) — rotate through:`);
        } else {
          lines.push(`  ${i + 1}. ${b.minutes} min — per group:`);
        }
        groups.forEach((g) => {
          const activity = (b.groupActivities || {})[g.id];
          if (activity) lines.push(`     ${g.name}: ${activity}`);
        });
      } else {
        lines.push(`  ${i + 1}. ${b.minutes} min — ${b.activity || '—'}`);
      }
    });
  }

  return lines.join('\n').trim();
}

function renderPlanTab(container, training) {
  if (training.live) renderLiveTimer(container, training);
  else renderStaticPlan(container, training);
}

function renderStaticPlan(container, training) {
  const blocks = training.blocks || [];
  const groups = training.groups || [];
  const totalMinutes = blocks.reduce((sum, b) => sum + blockEffectiveMinutes(b, groups), 0);
  const endTime = totalMinutes ? addMinutesToTime(training.time, totalMinutes) : null;

  container.innerHTML = `
    <div class="spread" style="margin-bottom:10px;">
      <span class="muted small">${blocks.length ? `${totalMinutes} min total${endTime ? ` · ends ~${formatTime(endTime)}` : ''}` : 'No plan yet'}</span>
      <div class="row" style="gap:8px;">
        ${blocks.length ? '<button class="btn sm" data-action="start-live">▶ Start Session</button>' : ''}
        <button class="btn secondary sm" data-action="add-block">+ Add Block</button>
      </div>
    </div>
    ${blocks.length ? `
      <div class="stack">
        ${blocks.map((b, i) => blockCardHtml(b, i, blocks.length, groups)).join('')}
      </div>
    ` : '<div class="card empty">No session plan yet — add your first block above.</div>'}
  `;

  container.querySelector('[data-action="add-block"]').addEventListener('click', () => openBlockForm(training, groups));

  const startBtn = container.querySelector('[data-action="start-live"]');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      update((state) => {
        const t = state.trainings.find((x) => x.id === training.id);
        t.live = { running: true, elapsedSeconds: 0 };
      });
    });
  }

  container.querySelectorAll('[data-action="edit-block"]').forEach((el) => {
    el.addEventListener('click', () => {
      const block = blocks.find((b) => b.id === el.dataset.blockId);
      if (block) openBlockForm(training, groups, block);
    });
  });

  container.querySelectorAll('[data-action="delete-block"]').forEach((el) => {
    el.addEventListener('click', async () => {
      if (!(await confirmDialog('Remove this block from the plan?', { okLabel: 'Remove', danger: true }))) return;
      update((state) => {
        const t = state.trainings.find((x) => x.id === training.id);
        t.blocks = t.blocks.filter((b) => b.id !== el.dataset.blockId);
      });
    });
  });

  container.querySelectorAll('[data-action="move-block-up"]').forEach((el) => {
    el.addEventListener('click', () => moveBlock(training, el.dataset.blockId, -1));
  });
  container.querySelectorAll('[data-action="move-block-down"]').forEach((el) => {
    el.addEventListener('click', () => moveBlock(training, el.dataset.blockId, 1));
  });

  container.querySelectorAll('[data-action="view-drill"]').forEach((el) => {
    el.addEventListener('click', () => openDrillDetailModal(findDrill(el.dataset.drillId)));
  });
}

// Called from main.js's per-second ticker instead of a full re-render, so
// an ordinary tick doesn't tear down and rebuild the live timer's buttons
// (Pause/Skip/View Drill/etc.) out from under a tap-in-progress. Only
// patches the on-screen clock text directly; returns false (a no-op) if
// the live timer isn't the thing currently on screen, or if the block/
// rotation-leg has actually changed and needs a real render instead.
export function patchLiveTimerClock(training) {
  if (!training || !training.live) return false;
  const root = document.querySelector('[data-live-timer-root]');
  if (!root || root.dataset.trainingId !== training.id) return false;

  const groups = training.groups || [];
  const timeline = planTimeline(training);
  if (!timeline.length) return false;
  const elapsed = training.live.elapsedSeconds;
  const entry = currentTimelineEntry(timeline, elapsed);
  const idx = timeline.indexOf(entry);
  const secondsIntoBlock = elapsed - entry.startSeconds;
  const block = entry.block;
  const isRotation = block.mode === 'grouped' && block.rotate;
  const legIndex = isRotation ? rotationLegInfo(block, groups, secondsIntoBlock).legIndex : null;
  const blockKey = `${idx}:${legIndex ?? ''}`;
  if (root.dataset.blockKey !== blockKey) return false;

  const secondsLeftInBlock = Math.max(0, entry.effectiveSeconds - secondsIntoBlock);
  const clockEl = root.querySelector('#live-timer-clock');
  if (clockEl) clockEl.textContent = formatClock(secondsLeftInBlock);

  if (isRotation) {
    const { secondsIntoLeg, legSeconds } = rotationLegInfo(block, groups, secondsIntoBlock);
    const rotationClockEl = root.querySelector('#live-timer-rotation-clock');
    if (rotationClockEl) rotationClockEl.textContent = formatClock(Math.max(0, legSeconds - secondsIntoLeg));
  }
  return true;
}

function renderLiveTimer(container, training) {
  const groups = training.groups || [];
  const timeline = planTimeline(training);
  if (!timeline.length) {
    container.innerHTML = '<div class="banner info">No plan blocks to run.</div>';
    return;
  }
  const elapsed = training.live.elapsedSeconds;
  const entry = currentTimelineEntry(timeline, elapsed);
  const idx = timeline.indexOf(entry);
  const secondsIntoBlock = elapsed - entry.startSeconds;
  const secondsLeftInBlock = Math.max(0, entry.effectiveSeconds - secondsIntoBlock);
  const block = entry.block;
  const isRotation = block.mode === 'grouped' && block.rotate;
  const legIndex = isRotation ? rotationLegInfo(block, groups, secondsIntoBlock).legIndex : null;
  // Identifies "what's currently showing" (which block, and which rotation
  // leg within it) — patchLiveTimerClock compares this against a fresh
  // computation each tick, and only patches the clock text in place when
  // it's unchanged, letting a real content change (a new block or leg)
  // fall through to a normal full re-render instead.
  const blockKey = `${idx}:${legIndex ?? ''}`;

  let activityHtml;
  if (block.isBreak) {
    activityHtml = `<div style="text-align:center; font-size:16px; font-weight:700;">☕ Break${block.activity ? ': ' + escapeHtml(block.activity) : ''}</div>`;
  } else if (block.mode === 'grouped') {
    if (isRotation) {
      const { stations, secondsIntoLeg, legSeconds } = rotationLegInfo(block, groups, secondsIntoBlock);
      const assignments = rotationAssignment(block, groups, legIndex);
      activityHtml = `
        <div class="muted small" style="text-align:center; margin-bottom:6px;">Rotation ${legIndex + 1} of ${stations} · <span id="live-timer-rotation-clock">${formatClock(Math.max(0, legSeconds - secondsIntoLeg))}</span> left this rotation</div>
        <div class="stack">
          ${assignments.map(({ group, activity, drillId }) => `<div class="small" style="text-align:center;"><strong>${escapeHtml(group.name)}:</strong> ${escapeHtml(activity || '—')} ${viewDrillButtonHtml(drillId)}</div>`).join('')}
        </div>
      `;
    } else {
      const active = groups.filter((g) => ((block.groupActivities || {})[g.id] || '').trim());
      activityHtml = `
        <div class="stack">
          ${active.map((g) => `<div class="small" style="text-align:center;"><strong>${escapeHtml(g.name)}:</strong> ${escapeHtml((block.groupActivities || {})[g.id])} ${viewDrillButtonHtml(resolveActivityDrillId((block.groupActivities || {})[g.id], (block.groupActivityDrillIds || {})[g.id]))}</div>`).join('') || '<div class="muted small" style="text-align:center;">No group activities set.</div>'}
        </div>
      `;
    }
  } else {
    activityHtml = `<div style="text-align:center; font-size:16px; font-weight:600;">${escapeHtml(block.activity || '—')} ${viewDrillButtonHtml(resolveActivityDrillId(block.activity, block.activityDrillId))}</div>`;
  }

  container.innerHTML = `
    <div data-live-timer-root data-training-id="${training.id}" data-block-key="${blockKey}">
      <div class="card" style="text-align:center;">
        <div class="muted small">Block ${idx + 1} of ${timeline.length}${training.live.running ? '' : ' · Paused'}</div>
        <div id="live-timer-clock" style="font-size:44px; font-weight:800; font-variant-numeric:tabular-nums; margin:6px 0;">${formatClock(secondsLeftInBlock)}</div>
        ${activityHtml}
      </div>
      <div class="row" style="gap:8px; justify-content:center; flex-wrap:wrap; margin:14px 0;">
        ${training.live.running
          ? '<button class="btn secondary" data-action="pause-live">⏸ Pause</button>'
          : '<button class="btn" data-action="resume-live">▶ Resume</button>'}
        <button class="btn ghost" data-action="prev-block" ${idx === 0 ? 'disabled' : ''}>⏮ Previous</button>
        <button class="btn ghost" data-action="skip-block">⏭ Skip</button>
        <button class="btn danger" data-action="end-live">⏹ End Session</button>
      </div>
      <div class="section-title" style="margin-top:0;">Session order</div>
      <div class="card">
        ${timeline.map((e, i) => `
          <div class="card-row" style="padding:6px 0; ${i === idx ? 'font-weight:700;' : ''} ${i < idx ? 'opacity:0.55;' : ''}">
            <span class="small">${i < idx ? '✅' : i === idx ? '▶' : '⏳'} ${e.block.isBreak ? '☕ Break' : (e.block.mode === 'grouped' ? (e.block.rotate ? 'Rotation' : 'Per group') : escapeHtml(e.block.activity || 'Activity'))}</span>
            <span class="small muted">${Math.round(e.effectiveSeconds / 60)} min</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const pauseBtn = container.querySelector('[data-action="pause-live"]');
  if (pauseBtn) pauseBtn.addEventListener('click', () => {
    update((state) => { const t = state.trainings.find((x) => x.id === training.id); t.live.running = false; });
  });
  const resumeBtn = container.querySelector('[data-action="resume-live"]');
  if (resumeBtn) resumeBtn.addEventListener('click', () => {
    update((state) => { const t = state.trainings.find((x) => x.id === training.id); t.live.running = true; });
  });
  container.querySelector('[data-action="prev-block"]').addEventListener('click', () => {
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      const tl = planTimeline(t);
      const cur = currentTimelineEntry(tl, t.live.elapsedSeconds);
      const i = tl.indexOf(cur);
      t.live.elapsedSeconds = i > 0 ? tl[i - 1].startSeconds : 0;
    });
  });
  container.querySelector('[data-action="skip-block"]').addEventListener('click', () => {
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      const tl = planTimeline(t);
      const cur = currentTimelineEntry(tl, t.live.elapsedSeconds);
      const i = tl.indexOf(cur);
      if (i < tl.length - 1) {
        t.live.elapsedSeconds = tl[i + 1].startSeconds;
      } else {
        t.live.elapsedSeconds = tl[i].endSeconds;
        t.live.running = false;
      }
    });
  });
  container.querySelector('[data-action="end-live"]').addEventListener('click', async () => {
    if (!(await confirmDialog('End this live session? The plan itself stays saved — you can start it again later.', { okLabel: 'End Session' }))) return;
    update((state) => {
      const t = state.trainings.find((x) => x.id === training.id);
      t.live = null;
    });
  });

  container.querySelectorAll('[data-action="view-drill"]').forEach((el) => {
    el.addEventListener('click', () => openDrillDetailModal(findDrill(el.dataset.drillId)));
  });
}

function moveBlock(training, blockId, direction) {
  update((state) => {
    const t = state.trainings.find((x) => x.id === training.id);
    const idx = t.blocks.findIndex((b) => b.id === blockId);
    const newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= t.blocks.length) return;
    const [block] = t.blocks.splice(idx, 1);
    t.blocks.splice(newIdx, 0, block);
  });
}

function blockCardHtml(block, index, total, groups) {
  const groupsById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const isRotation = block.mode === 'grouped' && block.rotate;
  const stations = isRotation ? rotationStationCount(block, groups) : null;
  const effectiveMinutes = blockEffectiveMinutes(block, groups);
  return `
    <div class="card" style="${block.isBreak ? 'border-style:dashed;' : ''}">
      <div class="spread" style="margin-bottom:6px;">
        <span class="badge">${block.isBreak ? '☕ ' : ''}${effectiveMinutes} min${isRotation ? ` (${block.minutes} × ${stations} rotations)` : ''}</span>
        <div class="row" style="gap:2px;">
          <button type="button" class="icon-btn" data-action="move-block-up" data-block-id="${block.id}" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>⬆️</button>
          <button type="button" class="icon-btn" data-action="move-block-down" data-block-id="${block.id}" aria-label="Move down" ${index === total - 1 ? 'disabled' : ''}>⬇️</button>
          <button type="button" class="icon-btn" data-action="edit-block" data-block-id="${block.id}" aria-label="Edit block">✏️</button>
          <button type="button" class="icon-btn" data-action="delete-block" data-block-id="${block.id}" aria-label="Delete block">🗑</button>
        </div>
      </div>
      ${block.isBreak
        ? `<div class="muted small">Break${block.activity ? ': ' + escapeHtml(block.activity) : ''}</div>`
        : block.mode === 'grouped' ? `
        <div class="muted small" style="margin-bottom:4px; font-weight:600;">${isRotation ? 'Rotation — every group does each, in turn:' : 'Per group:'}</div>
        <div class="stack">
          ${Object.entries(block.groupActivities || {}).filter(([gid]) => groupsById[gid]).map(([gid, text]) => `
            <div class="small">
              <strong>${escapeHtml(groupsById[gid].name)}:</strong> ${escapeHtml(text || '—')}
              ${viewDrillButtonHtml(resolveActivityDrillId(text, (block.groupActivityDrillIds || {})[gid]))}
            </div>
          `).join('') || '<span class="muted small">No group activities set.</span>'}
        </div>
      ` : `<div>${escapeHtml(block.activity || '—')} ${viewDrillButtonHtml(resolveActivityDrillId(block.activity, block.activityDrillId))}</div>`}
    </div>
  `;
}

function viewDrillButtonHtml(drillId) {
  if (!drillId) return '';
  return `<button type="button" class="small" data-action="view-drill" data-drill-id="${drillId}" style="background:none; border:none; padding:0; color:inherit; cursor:pointer; font:inherit; text-decoration:underline;">📚 View Drill</button>`;
}

function drillFillHtml(fieldName, drills) {
  if (!drills.length) return '';
  return `
    <select data-drill-fill="${fieldName}" style="margin-top:6px;">
      <option value="">📚 Fill from Drill Library…</option>
      ${drills.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
    </select>
  `;
}

// Filling an activity from the Drill Library only ever copied its name in
// as plain text (see the [data-drill-fill] change handler below) — with
// no link back to the actual drill record, there was no way to reopen
// its description/image/attachment later, live or not. This hidden field
// carries that link alongside the text: set when a drill is picked from
// the dropdown, and cleared the moment the coach types over the text by
// hand (so a since-edited activity never points at the wrong drill).
function drillLinkFieldHtml(fieldName, drillId) {
  return `<input type="hidden" name="${fieldName}-drillId" value="${escapeHtml(drillId || '')}" />`;
}

function openBlockForm(training, groups, existing) {
  const pf = existing || { mode: 'whole', minutes: 10, activity: '', groupActivities: {}, rotate: false, isBreak: false };
  const hasGroups = groups.length > 0;
  const { drills } = getState();

  openModal({
    title: existing ? 'Edit Block' : 'Add Block',
    bodyHtml: `
      <form id="block-form" class="stack">
        <div class="field">
          <label data-minutes-label>Duration (minutes)</label>
          <input type="number" name="minutes" min="1" max="180" value="${pf.minutes}" required />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" name="isBreak" ${pf.isBreak ? 'checked' : ''} />
          ☕ This is a break (water/rest — no activity type or groups)
        </label>
        <div data-mode-field class="field" ${pf.isBreak ? 'hidden' : ''}>
          <label>Activity type</label>
          <select name="mode" ${hasGroups ? '' : 'disabled'}>
            <option value="whole" ${pf.mode !== 'grouped' ? 'selected' : ''}>Whole team, one activity</option>
            <option value="grouped" ${pf.mode === 'grouped' ? 'selected' : ''}>Each group does something different</option>
          </select>
          ${!hasGroups ? '<div class="muted small" style="margin-top:4px;">Build groups on the Groups tab to unlock per-group activities.</div>' : ''}
        </div>
        <div data-whole-field ${pf.mode === 'grouped' && hasGroups && !pf.isBreak ? 'hidden' : ''}>
          <div class="field">
            <label data-whole-activity-label>${pf.isBreak ? 'Note (optional)' : 'Activity'}</label>
            <input type="text" name="activity" value="${escapeHtml(pf.activity || '')}" placeholder="e.g. Passing triangles" />
            ${drillFillHtml('activity', drills)}
            ${drillLinkFieldHtml('activity', pf.activityDrillId)}
          </div>
        </div>
        <div data-grouped-fields ${pf.mode === 'grouped' && hasGroups && !pf.isBreak ? '' : 'hidden'}>
          <label class="checkbox-row">
            <input type="checkbox" name="rotate" ${pf.rotate ? 'checked' : ''} />
            Rotate groups through each activity (a circuit — every group does every station in turn)
          </label>
          <div class="muted small" data-rotate-hint style="margin-bottom:8px;"></div>
          ${groups.map((g) => `
            <div class="field">
              <label>${escapeHtml(g.name)}</label>
              <input type="text" name="group-${g.id}" value="${escapeHtml((pf.groupActivities || {})[g.id] || '')}" placeholder="Activity for this group" />
              ${drillFillHtml(`group-${g.id}`, drills)}
              ${drillLinkFieldHtml(`group-${g.id}`, (pf.groupActivityDrillIds || {})[g.id])}
            </div>
          `).join('')}
        </div>
        ${drills.length ? '' : '<div class="muted small">No drills saved yet — <a href="#/drills">add some to the Drill Library</a> to quick-fill activities from here next time.</div>'}
        <button type="submit" class="btn block">${existing ? 'Save' : 'Add Block'}</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#block-form');
      const isBreakCheckbox = form.querySelector('[name="isBreak"]');
      const modeField = form.querySelector('[data-mode-field]');
      const modeSelect = form.querySelector('[name="mode"]');
      const wholeField = form.querySelector('[data-whole-field]');
      const wholeActivityLabel = form.querySelector('[data-whole-activity-label]');
      const groupedFields = form.querySelector('[data-grouped-fields]');
      const minutesInput = form.querySelector('[name="minutes"]');
      const minutesLabel = form.querySelector('[data-minutes-label]');
      const rotateCheckbox = form.querySelector('[name="rotate"]');
      const rotateHint = form.querySelector('[data-rotate-hint]');

      function activeStationCount() {
        const withText = groups.filter((g) => (form.querySelector(`[name="group-${g.id}"]`)?.value || '').trim());
        return withText.length || groups.length;
      }

      function refreshRotateUi() {
        const grouped = !isBreakCheckbox.checked && modeSelect.value === 'grouped';
        const rotating = grouped && rotateCheckbox.checked;
        minutesLabel.textContent = rotating ? 'Minutes per rotation' : 'Duration (minutes)';
        if (rotating) {
          const stations = activeStationCount();
          const mins = Number(minutesInput.value) || 0;
          rotateHint.textContent = `${stations} station${stations === 1 ? '' : 's'} × ${mins} min = ${stations * mins} min for this block.`;
        } else {
          rotateHint.textContent = '';
        }
      }

      function refreshBreakUi() {
        const isBreak = isBreakCheckbox.checked;
        modeField.hidden = isBreak;
        wholeActivityLabel.textContent = isBreak ? 'Note (optional)' : 'Activity';
        if (isBreak) {
          wholeField.hidden = false;
          groupedFields.hidden = true;
        } else {
          const grouped = modeSelect.value === 'grouped';
          wholeField.hidden = grouped;
          groupedFields.hidden = !grouped;
        }
        refreshRotateUi();
      }

      isBreakCheckbox.addEventListener('change', refreshBreakUi);

      if (hasGroups) {
        modeSelect.addEventListener('change', () => {
          const grouped = modeSelect.value === 'grouped';
          wholeField.hidden = grouped;
          groupedFields.hidden = !grouped;
          refreshRotateUi();
        });
        rotateCheckbox.addEventListener('change', refreshRotateUi);
        minutesInput.addEventListener('input', refreshRotateUi);
        groups.forEach((g) => {
          const input = form.querySelector(`[name="group-${g.id}"]`);
          if (input) input.addEventListener('input', refreshRotateUi);
        });
      }
      refreshBreakUi();

      form.querySelectorAll('[data-drill-fill]').forEach((select) => {
        const fieldName = select.dataset.drillFill;
        const input = form.querySelector(`[name="${fieldName}"]`);
        const linkField = form.querySelector(`[name="${fieldName}-drillId"]`);
        select.addEventListener('change', () => {
          const drill = findDrill(select.value);
          if (drill && input) input.value = drill.name;
          if (linkField) linkField.value = drill ? drill.id : '';
          select.value = '';
          refreshRotateUi();
        });
        // Typing over a filled-in activity by hand means it may no longer
        // describe the linked drill — drop the link rather than leave
        // "View Drill" pointing at something the text doesn't match.
        if (input && linkField) {
          input.addEventListener('input', () => { linkField.value = ''; });
        }
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const minutes = Number(fd.get('minutes')) || 1;
        const isBreak = fd.get('isBreak') === 'on';
        const mode = isBreak ? 'whole' : (hasGroups ? (fd.get('mode') || 'whole') : 'whole');
        const activity = (fd.get('activity') || '').trim();
        const activityDrillId = (fd.get('activity-drillId') || '').trim() || null;
        const rotate = !isBreak && mode === 'grouped' && fd.get('rotate') === 'on';
        const groupActivities = {};
        const groupActivityDrillIds = {};
        if (!isBreak && mode === 'grouped') {
          groups.forEach((g) => {
            groupActivities[g.id] = (fd.get(`group-${g.id}`) || '').trim();
            groupActivityDrillIds[g.id] = (fd.get(`group-${g.id}-drillId`) || '').trim() || null;
          });
        }

        update((state) => {
          const t = state.trainings.find((x) => x.id === training.id);
          if (existing) {
            const b = t.blocks.find((x) => x.id === existing.id);
            b.minutes = minutes;
            b.mode = mode;
            b.activity = activity;
            b.activityDrillId = activityDrillId;
            b.groupActivities = groupActivities;
            b.groupActivityDrillIds = groupActivityDrillIds;
            b.rotate = rotate;
            b.isBreak = isBreak;
          } else {
            t.blocks.push({ id: uid(), minutes, mode, activity, activityDrillId, groupActivities, groupActivityDrillIds, rotate, isBreak });
          }
        });
        closeModal();
      });
    },
  });
}
