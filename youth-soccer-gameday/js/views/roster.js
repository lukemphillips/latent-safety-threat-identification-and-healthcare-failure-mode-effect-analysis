import { getState, update, findPlayer } from '../store.js';
import { uid, escapeHtml } from '../util.js';
import { openModal, closeModal } from '../modal.js';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

export function renderRoster(app) {
  const { players } = getState();
  const sorted = [...players].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (a.jerseyNumber ?? 0) - (b.jerseyNumber ?? 0);
  });

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Roster</h1>
        <div class="sub">${players.filter((p) => p.active).length} active players</div>
      </div>
      <button class="btn" data-action="add-player">+ Add</button>
    </div>
    <div class="card">
      ${sorted.length ? sorted.map(playerRow).join('') : '<div class="empty">No players yet. Add your first player.</div>'}
    </div>
  `;

  app.querySelector('[data-action="add-player"]').addEventListener('click', () => openPlayerForm());
  app.querySelectorAll('[data-action="edit-player"]').forEach((el) => {
    el.addEventListener('click', () => openPlayerForm(el.dataset.id));
  });
}

function playerRow(p) {
  return `
    <div class="player-row" style="cursor:pointer;" data-action="edit-player" data-id="${p.id}">
      <div class="jersey">${p.jerseyNumber ?? '-'}</div>
      <div class="player-meta">
        <div class="player-name ${p.active ? '' : 'inactive'}">${escapeHtml(p.name)}</div>
        <div class="player-sub">${p.position || ''}${p.guardianName ? ' · ' + escapeHtml(p.guardianName) : ''}</div>
      </div>
      ${p.active ? '' : '<span class="badge pending">inactive</span>'}
    </div>
  `;
}

function openPlayerForm(playerId) {
  const existing = playerId ? findPlayer(playerId) : null;
  const p = existing || { name: '', jerseyNumber: '', position: 'MID', guardianName: '', guardianPhone: '', active: true };

  const dlg = openModal({
    title: existing ? 'Edit Player' : 'Add Player',
    bodyHtml: `
      <form id="player-form" class="stack">
        <div class="field">
          <label>Player name</label>
          <input type="text" name="name" required value="${escapeHtml(p.name)}" placeholder="e.g. Ava Martinez" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Jersey #</label>
            <input type="number" name="jerseyNumber" min="0" max="99" value="${p.jerseyNumber ?? ''}" />
          </div>
          <div class="field">
            <label>Position</label>
            <select name="position">
              ${POSITIONS.map((pos) => `<option value="${pos}" ${p.position === pos ? 'selected' : ''}>${pos}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Guardian name</label>
          <input type="text" name="guardianName" value="${escapeHtml(p.guardianName)}" />
        </div>
        <div class="field">
          <label>Guardian phone</label>
          <input type="tel" name="guardianPhone" value="${escapeHtml(p.guardianPhone)}" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" name="active" ${p.active ? 'checked' : ''} />
          Active on roster
        </label>
        <div class="modal-actions">
          <button type="submit" class="btn block">Save</button>
          ${existing ? '<button type="button" class="btn danger" data-action="delete-player">Delete</button>' : ''}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#player-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = {
          name: (fd.get('name') || '').trim(),
          jerseyNumber: fd.get('jerseyNumber') ? Number(fd.get('jerseyNumber')) : null,
          position: fd.get('position'),
          guardianName: (fd.get('guardianName') || '').trim(),
          guardianPhone: (fd.get('guardianPhone') || '').trim(),
          active: fd.get('active') === 'on',
        };
        if (!data.name) return;
        update((state) => {
          if (existing) {
            Object.assign(findPlayer(existing.id), data);
          } else {
            state.players.push({ id: uid(), ...data });
          }
        });
        closeModal();
      });

      const delBtn = modalEl.querySelector('[data-action="delete-player"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          if (!confirm(`Remove ${p.name} from the roster? This also removes their RSVPs and lineup spots.`)) return;
          update((state) => {
            state.players = state.players.filter((pl) => pl.id !== existing.id);
            state.games.forEach((g) => {
              delete g.rsvps[existing.id];
              if (g.lineup?.slots) {
                Object.keys(g.lineup.slots).forEach((slotId) => {
                  if (g.lineup.slots[slotId] === existing.id) g.lineup.slots[slotId] = null;
                });
              }
              if (g.live) {
                g.live.onField = (g.live.onField || []).filter((id) => id !== existing.id);
                delete g.live.playingTime?.[existing.id];
              }
            });
          });
          closeModal();
        });
      }
    },
  });
  return dlg;
}
