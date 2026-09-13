import { getState, update, findTraining } from '../store.js';
import { uid, escapeHtml, formatDate, formatTime, sortByDateTime, todayIso, nowHHMM } from '../util.js';
import { buildGroupsByStream } from '../trainingGroups.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';

let selectingPlayerId = null;
let selectingSourceGroupId = null;

export function renderTraining(app) {
  const { trainings } = getState();
  const upcoming = sortByDateTime(trainings.filter((t) => t.date >= todayIso()));
  const past = sortByDateTime(trainings.filter((t) => t.date < todayIso())).reverse();

  app.innerHTML = `
    <div class="page-title">
      <h1>Training</h1>
      <button class="btn" data-action="add-training">+ Add Training</button>
    </div>

    <div class="section-title" style="margin-top:0;">Upcoming</div>
    ${upcoming.length ? upcoming.map(trainingCard).join('') : '<div class="card empty">No upcoming training sessions.</div>'}

    ${past.length ? `
      <div class="section-title">Past</div>
      ${past.map(trainingCard).join('')}
    ` : ''}
  `;

  app.querySelector('[data-action="add-training"]').addEventListener('click', () => openTrainingForm());
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

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Training</h1>
        <div class="sub">${formatDate(training.date)} · ${formatTime(training.time)}${training.location ? ' · ' + escapeHtml(training.location) : ''}</div>
      </div>
      <div class="row" style="gap:4px;">
        <button class="icon-btn" data-action="edit-training" aria-label="Edit training">✏️</button>
      </div>
    </div>

    <div class="tabs">
      <a class="tab ${tab === 'attendance' ? 'active' : ''}" href="#/training/${training.id}/attendance">Attendance</a>
      <a class="tab ${tab === 'groups' ? 'active' : ''}" href="#/training/${training.id}/groups">Groups</a>
      <a class="tab ${tab === 'plan' ? 'active' : ''}" href="#/training/${training.id}/plan">Plan</a>
    </div>

    <div id="tab-content"></div>
  `;

  app.querySelector('[data-action="edit-training"]').addEventListener('click', () => openTrainingForm(training));

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

function renderPlanTab(container, training) {
  const blocks = training.blocks || [];
  const groups = training.groups || [];
  const totalMinutes = blocks.reduce((sum, b) => sum + (b.minutes || 0), 0);
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
  return `
    <div class="card">
      <div class="spread" style="margin-bottom:6px;">
        <span class="badge">${block.minutes} min</span>
        <div class="row" style="gap:2px;">
          <button type="button" class="icon-btn" data-action="move-block-up" data-block-id="${block.id}" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>⬆️</button>
          <button type="button" class="icon-btn" data-action="move-block-down" data-block-id="${block.id}" aria-label="Move down" ${index === total - 1 ? 'disabled' : ''}>⬇️</button>
          <button type="button" class="icon-btn" data-action="edit-block" data-block-id="${block.id}" aria-label="Edit block">✏️</button>
          <button type="button" class="icon-btn" data-action="delete-block" data-block-id="${block.id}" aria-label="Delete block">🗑</button>
        </div>
      </div>
      ${block.mode === 'grouped' ? `
        <div class="muted small" style="margin-bottom:4px; font-weight:600;">Per group:</div>
        <div class="stack">
          ${Object.entries(block.groupActivities || {}).filter(([gid]) => groupsById[gid]).map(([gid, text]) => `
            <div class="small"><strong>${escapeHtml(groupsById[gid].name)}:</strong> ${escapeHtml(text || '—')}</div>
          `).join('') || '<span class="muted small">No group activities set.</span>'}
        </div>
      ` : `<div>${escapeHtml(block.activity || '—')}</div>`}
    </div>
  `;
}

function openBlockForm(training, groups, existing) {
  const pf = existing || { mode: 'whole', minutes: 10, activity: '', groupActivities: {} };
  const hasGroups = groups.length > 0;
  openModal({
    title: existing ? 'Edit Block' : 'Add Block',
    bodyHtml: `
      <form id="block-form" class="stack">
        <div class="field">
          <label>Duration (minutes)</label>
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
          </div>
        </div>
        <div data-grouped-fields ${pf.mode === 'grouped' && hasGroups ? '' : 'hidden'}>
          ${groups.map((g) => `
            <div class="field">
              <label>${escapeHtml(g.name)}</label>
              <input type="text" name="group-${g.id}" value="${escapeHtml((pf.groupActivities || {})[g.id] || '')}" placeholder="Activity for this group" />
            </div>
          `).join('')}
        </div>
        <button type="submit" class="btn block">${existing ? 'Save' : 'Add Block'}</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#block-form');
      const modeSelect = form.querySelector('[name="mode"]');
      const wholeField = form.querySelector('[data-whole-field]');
      const groupedFields = form.querySelector('[data-grouped-fields]');
      if (hasGroups) {
        modeSelect.addEventListener('change', () => {
          const grouped = modeSelect.value === 'grouped';
          wholeField.hidden = grouped;
          groupedFields.hidden = !grouped;
        });
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const minutes = Number(fd.get('minutes')) || 1;
        const mode = hasGroups ? (fd.get('mode') || 'whole') : 'whole';
        const activity = (fd.get('activity') || '').trim();
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
          } else {
            t.blocks.push({ id: uid(), minutes, mode, activity, groupActivities });
          }
        });
        closeModal();
      });
    },
  });
}
