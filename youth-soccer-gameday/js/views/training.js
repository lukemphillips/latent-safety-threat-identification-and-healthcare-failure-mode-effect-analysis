import { getState, update, findTraining, findDrill } from '../store.js';
import { uid, escapeHtml, formatDate, formatTime, sortByDateTime, todayIso, nowHHMM, copyToClipboard } from '../util.js';
import { buildGroupsByStream } from '../trainingGroups.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { openDrillForm as openDrillLibraryForm } from './drills.js';

let selectingPlayerId = null;
let selectingSourceGroupId = null;

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
    <a class="card" href="#/training/${training.id}/attendance" style="display:block;">
      <div class="card-row">
        <div>
          <div style="font-weight:700; font-size:15px;">Training</div>
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
        <span class="small">${(training.presentIds || []).length} attending${(training.groups || []).length ? ` · ${training.groups.length} groups` : ''}${(training.blocks || []).length ? ` · ${training.blocks.length} plan blocks` : ''}</span>
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

function renderGroupsTab(container, training) {
  const { players } = getState();
  const presentIds = new Set(training.presentIds || []);
  const present = players.filter((p) => p.active && presentIds.has(p.id));
  const groups = training.groups || [];
  const byId = Object.fromEntries(present.map((p) => [p.id, p]));

  if (!present.length) {
    container.innerHTML = `<div class="banner info">Mark who's here on the Attendance tab first, then come back to build groups.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="field-row" style="align-items:flex-end;">
        <div class="field" style="max-width:180px;">
          <label>Number of groups</label>
          <input type="number" id="group-target-count" min="1" max="${present.length}" placeholder="Auto" value="${groups.length || ''}" />
        </div>
        <button class="btn secondary" data-action="auto-build-groups">🎲 ${groups.length ? 'Rebuild Groups' : 'Auto-Build Groups'}</button>
      </div>
      <div class="muted small" style="margin-top:6px;">Groups cluster players of similar ability together. Leave "Number of groups" blank for one group per skill stream present, or set a number to merge or split streams to fit.</div>
    </div>

    ${groups.length ? `
      <div class="banner info" style="margin-top:12px;">Tap a player to select them, then tap "Move here" on another group to move them across — handy when a group ends up too big or too small.</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; margin-top:12px;">
        ${groups.map((g) => groupCardHtml(g, byId)).join('')}
      </div>
    ` : '<div class="card empty" style="margin-top:12px;">No groups yet — tap Auto-Build Groups above.</div>'}
  `;

  container.querySelector('[data-action="auto-build-groups"]').addEventListener('click', () => {
    const raw = container.querySelector('#group-target-count').value;
    const targetCount = raw ? Number(raw) : null;
    const newGroups = buildGroupsByStream(present, targetCount);
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
  return `
    <div class="card" data-group-card="${group.id}" style="flex:1 1 220px;">
      <div class="spread" style="margin-bottom:6px;">
        <div style="font-weight:700;">${escapeHtml(group.name)} (${groupPlayers.length})</div>
        ${selectingPlayerId && !isSourceGroup ? `<button type="button" class="btn ghost sm" data-move-to-group="${group.id}">Move here →</button>` : ''}
      </div>
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

  if (blocks.length) {
    const totalMinutes = blocks.reduce((sum, b) => sum + blockEffectiveMinutes(b, groups), 0);
    const endTime = totalMinutes ? addMinutesToTime(training.time, totalMinutes) : null;
    lines.push('', `Plan (${totalMinutes} min total${endTime ? `, ends ~${formatTime(endTime)}` : ''}):`);
    blocks.forEach((b, i) => {
      if (b.mode === 'grouped') {
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
  const blocks = training.blocks || [];
  const groups = training.groups || [];
  const totalMinutes = blocks.reduce((sum, b) => sum + blockEffectiveMinutes(b, groups), 0);
  const endTime = totalMinutes ? addMinutesToTime(training.time, totalMinutes) : null;

  container.innerHTML = `
    <div class="spread" style="margin-bottom:10px;">
      <span class="muted small">${blocks.length ? `${totalMinutes} min total${endTime ? ` · ends ~${formatTime(endTime)}` : ''}` : 'No plan yet'}</span>
      <button class="btn secondary sm" data-action="add-block">+ Add Block</button>
    </div>
    ${blocks.length ? `
      <div class="stack">
        ${blocks.map((b, i) => blockCardHtml(b, i, blocks.length, groups)).join('')}
      </div>
    ` : '<div class="card empty">No session plan yet — add your first block above.</div>'}
  `;

  container.querySelector('[data-action="add-block"]').addEventListener('click', () => openBlockForm(training, groups));

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
    <div class="card">
      <div class="spread" style="margin-bottom:6px;">
        <span class="badge">${effectiveMinutes} min${isRotation ? ` (${block.minutes} × ${stations} rotations)` : ''}</span>
        <div class="row" style="gap:2px;">
          <button type="button" class="icon-btn" data-action="move-block-up" data-block-id="${block.id}" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>⬆️</button>
          <button type="button" class="icon-btn" data-action="move-block-down" data-block-id="${block.id}" aria-label="Move down" ${index === total - 1 ? 'disabled' : ''}>⬇️</button>
          <button type="button" class="icon-btn" data-action="edit-block" data-block-id="${block.id}" aria-label="Edit block">✏️</button>
          <button type="button" class="icon-btn" data-action="delete-block" data-block-id="${block.id}" aria-label="Delete block">🗑</button>
        </div>
      </div>
      ${block.mode === 'grouped' ? `
        <div class="muted small" style="margin-bottom:4px; font-weight:600;">${isRotation ? 'Rotation — every group does each, in turn:' : 'Per group:'}</div>
        <div class="stack">
          ${Object.entries(block.groupActivities || {}).filter(([gid]) => groupsById[gid]).map(([gid, text]) => `
            <div class="small"><strong>${escapeHtml(groupsById[gid].name)}:</strong> ${escapeHtml(text || '—')}</div>
          `).join('') || '<span class="muted small">No group activities set.</span>'}
        </div>
      ` : `<div>${escapeHtml(block.activity || '—')}</div>`}
    </div>
  `;
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

function openBlockForm(training, groups, existing) {
  const pf = existing || { mode: 'whole', minutes: 10, activity: '', groupActivities: {}, rotate: false };
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
        <div class="field">
          <label>Activity type</label>
          <select name="mode" ${hasGroups ? '' : 'disabled'}>
            <option value="whole" ${pf.mode !== 'grouped' ? 'selected' : ''}>Whole team, one activity</option>
            <option value="grouped" ${pf.mode === 'grouped' ? 'selected' : ''}>Each group does something different</option>
          </select>
          ${!hasGroups ? '<div class="muted small" style="margin-top:4px;">Build groups on the Groups tab to unlock per-group activities.</div>' : ''}
        </div>
        <div data-whole-field ${pf.mode === 'grouped' && hasGroups ? 'hidden' : ''}>
          <div class="field">
            <label>Activity</label>
            <input type="text" name="activity" value="${escapeHtml(pf.activity || '')}" placeholder="e.g. Passing triangles" />
            ${drillFillHtml('activity', drills)}
          </div>
        </div>
        <div data-grouped-fields ${pf.mode === 'grouped' && hasGroups ? '' : 'hidden'}>
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
            </div>
          `).join('')}
        </div>
        ${drills.length ? '' : '<div class="muted small">No drills saved yet — <a href="#/drills">add some to the Drill Library</a> to quick-fill activities from here next time.</div>'}
        <button type="submit" class="btn block">${existing ? 'Save' : 'Add Block'}</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#block-form');
      const modeSelect = form.querySelector('[name="mode"]');
      const wholeField = form.querySelector('[data-whole-field]');
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
        const grouped = modeSelect.value === 'grouped';
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
        refreshRotateUi();
      }

      form.querySelectorAll('[data-drill-fill]').forEach((select) => {
        select.addEventListener('change', () => {
          const drill = findDrill(select.value);
          const input = form.querySelector(`[name="${select.dataset.drillFill}"]`);
          if (drill && input) input.value = drill.name;
          select.value = '';
          refreshRotateUi();
        });
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const minutes = Number(fd.get('minutes')) || 1;
        const mode = hasGroups ? (fd.get('mode') || 'whole') : 'whole';
        const activity = (fd.get('activity') || '').trim();
        const rotate = mode === 'grouped' && fd.get('rotate') === 'on';
        const groupActivities = {};
        if (mode === 'grouped') {
          groups.forEach((g) => { groupActivities[g.id] = (fd.get(`group-${g.id}`) || '').trim(); });
        }

        update((state) => {
          const t = state.trainings.find((x) => x.id === training.id);
          if (existing) {
            const b = t.blocks.find((x) => x.id === existing.id);
            b.minutes = minutes;
            b.mode = mode;
            b.activity = activity;
            b.groupActivities = groupActivities;
            b.rotate = rotate;
          } else {
            t.blocks.push({ id: uid(), minutes, mode, activity, groupActivities, rotate });
          }
        });
        closeModal();
      });
    },
  });
}
