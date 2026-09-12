import { getState, update, findPlayer } from '../store.js';
import { uid, escapeHtml, streamBadgeHtml, playerPositions, formatPositions } from '../util.js';
import { openModal, closeModal } from '../modal.js';
import { parseRosterFile, TEMPLATE_CSV } from '../importRoster.js';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const STREAMS = ['A', 'B', 'C', 'D'];

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
      <div class="row" style="flex-wrap:wrap;">
        <a class="btn ghost sm" href="#/balance">🎲 Balance</a>
        <button class="btn ghost sm" data-action="import-roster">📥 Import</button>
        <button class="btn" data-action="add-player">+ Add</button>
      </div>
    </div>
    <div class="card">
      ${sorted.length ? sorted.map(playerRow).join('') : '<div class="empty">No players yet. Add your first player.</div>'}
    </div>
  `;

  app.querySelector('[data-action="add-player"]').addEventListener('click', () => openPlayerForm());
  app.querySelector('[data-action="import-roster"]').addEventListener('click', () => openImportModal());
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
        <div class="player-sub">${formatPositions(p)}${p.guardianName ? ' · ' + escapeHtml(p.guardianName) : ''}</div>
      </div>
      ${streamBadgeHtml(p.skillStream)}
      ${p.active ? '' : '<span class="badge pending">inactive</span>'}
    </div>
  `;
}

function openPlayerForm(playerId) {
  const existing = playerId ? findPlayer(playerId) : null;
  const p = existing || { name: '', jerseyNumber: '', positions: [], skillStream: '', guardianName: '', guardianPhone: '', active: true };
  const currentPositions = playerPositions(p);

  const dlg = openModal({
    title: existing ? 'Edit Player' : 'Add Player',
    bodyHtml: `
      <form id="player-form" class="stack">
        <div class="field">
          <label>Player name</label>
          <input type="text" name="name" required value="${escapeHtml(p.name)}" placeholder="e.g. Ava Martinez" />
        </div>
        <div class="field">
          <label>Jersey #</label>
          <input type="number" name="jerseyNumber" min="0" max="99" value="${p.jerseyNumber ?? ''}" style="max-width:120px;" />
        </div>
        <div class="field">
          <label>Preferred position(s)</label>
          <div class="chip-list">
            ${POSITIONS.map((pos) => `
              <label class="checkbox-row" style="border:1px solid var(--line); border-radius:999px; padding:6px 12px; margin:0;">
                <input type="checkbox" name="positions" value="${pos}" ${currentPositions.includes(pos) ? 'checked' : ''} />
                ${pos}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="field">
          <label>Streaming classification (for fair team-splitting)</label>
          <select name="skillStream">
            <option value="" ${!p.skillStream ? 'selected' : ''}>Unclassified</option>
            ${STREAMS.map((s) => `<option value="${s}" ${p.skillStream === s ? 'selected' : ''}>Stream ${s}</option>`).join('')}
          </select>
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
          positions: fd.getAll('positions'),
          skillStream: fd.get('skillStream') || null,
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
            state.team.rules = (state.team.rules || []).filter(
              (r) => r.playerAId !== existing.id && r.playerBId !== existing.id
            );
            state.games.forEach((g) => {
              delete g.rsvps[existing.id];
              g.presentIds = (g.presentIds || []).filter((id) => id !== existing.id);
              if (g.captainId === existing.id) g.captainId = null;
              if (g.playerOfMatchId === existing.id) g.playerOfMatchId = null;
              if (g.lineup?.slots) {
                Object.keys(g.lineup.slots).forEach((slotId) => {
                  if (g.lineup.slots[slotId] === existing.id) g.lineup.slots[slotId] = null;
                });
              }
              if (g.live) {
                g.live.onField = (g.live.onField || []).filter((id) => id !== existing.id);
                g.live.sentOff = (g.live.sentOff || []).filter((id) => id !== existing.id);
                delete g.live.playingTime?.[existing.id];
                Object.keys(g.live.gkByPeriod || {}).forEach((period) => {
                  if (g.live.gkByPeriod[period] === existing.id) g.live.gkByPeriod[period] = null;
                });
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

function openImportModal() {
  openModal({
    title: 'Import Roster',
    bodyHtml: `
      <div class="stack">
        <p class="muted small mt-0">Import from a .csv or .xlsx file. The first row should have headers — we'll match common ones like Name, Jersey #, Position(s), Stream, Guardian Name, Guardian Phone. Only "Name" is required.</p>
        <div class="card-row" style="background:var(--green-100); border-radius:10px; padding:10px 12px;">
          <span class="small">New to this? Start from a template.</span>
          <button type="button" class="btn secondary sm" data-action="copy-template">📋 Copy CSV Template</button>
        </div>
        <textarea id="import-template-fallback" readonly hidden style="width:100%; min-height:80px; font-family:monospace; font-size:11.5px; padding:8px; border:1px solid var(--line); border-radius:8px;">${escapeHtml(TEMPLATE_CSV)}</textarea>
        <div class="field">
          <label>File</label>
          <input type="file" name="file" accept=".csv,.xlsx,.xls" />
        </div>
        <div id="import-status" class="muted small"></div>
        <div id="import-preview"></div>
      </div>
    `,
    onMount: (modalEl) => {
      const fileInput = modalEl.querySelector('input[name="file"]');
      const statusEl = modalEl.querySelector('#import-status');
      const previewEl = modalEl.querySelector('#import-preview');
      const copyBtn = modalEl.querySelector('[data-action="copy-template"]');
      const fallbackEl = modalEl.querySelector('#import-template-fallback');
      let parsedRows = [];

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(TEMPLATE_CSV);
          copyBtn.textContent = '✅ Copied!';
        } catch {
          fallbackEl.hidden = false;
          fallbackEl.focus();
          fallbackEl.select();
          copyBtn.textContent = 'Select the text below and copy it';
        }
        setTimeout(() => { copyBtn.textContent = '📋 Copy CSV Template'; }, 2500);
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        previewEl.innerHTML = '';
        if (!file) return;
        statusEl.textContent = 'Reading file…';
        const { rows, error } = await parseRosterFile(file);
        if (error) {
          statusEl.textContent = error;
          parsedRows = [];
          return;
        }
        parsedRows = rows;
        const validCount = rows.filter((r) => r.name).length;
        const skipped = rows.length - validCount;
        statusEl.textContent = `Found ${validCount} player${validCount === 1 ? '' : 's'}` +
          (skipped ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped — no name).` : '.');
        renderPreview();
      });

      function renderPreview() {
        const { players } = getState();
        const existingNames = new Set(players.map((p) => p.name.trim().toLowerCase()));
        const validRows = parsedRows.filter((r) => r.name);
        if (!validRows.length) {
          previewEl.innerHTML = '';
          return;
        }
        previewEl.innerHTML = `
          <div style="overflow-x:auto; margin-top:10px;">
            <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead>
                <tr>
                  <th style="padding:5px 6px;"></th>
                  <th style="text-align:left; padding:5px 6px;">Name</th>
                  <th style="text-align:left; padding:5px 6px;">#</th>
                  <th style="text-align:left; padding:5px 6px;">Position</th>
                  <th style="text-align:left; padding:5px 6px;">Stream</th>
                </tr>
              </thead>
              <tbody>
                ${validRows.map((r, i) => {
                  const isDup = existingNames.has(r.name.trim().toLowerCase());
                  const unrecognizedPos = r.positionsRaw && !r.positions.length;
                  const unrecognizedStream = r.streamRaw && !r.skillStream;
                  return `
                    <tr style="border-top:1px solid var(--line);">
                      <td style="padding:5px 6px;"><input type="checkbox" data-import-row="${i}" ${isDup ? '' : 'checked'} /></td>
                      <td style="padding:5px 6px;">${escapeHtml(r.name)}${isDup ? ' <span class="muted">(already on roster)</span>' : ''}</td>
                      <td style="padding:5px 6px;">${r.jerseyNumber ?? ''}</td>
                      <td style="padding:5px 6px;">${escapeHtml(r.positions.join('/'))}${unrecognizedPos ? ` <span class="muted">(unrecognized: ${escapeHtml(r.positionsRaw)})</span>` : ''}</td>
                      <td style="padding:5px 6px;">${r.skillStream ?? ''}${unrecognizedStream ? ` <span class="muted">(unrecognized: ${escapeHtml(r.streamRaw)})</span>` : ''}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <button type="button" class="btn block" data-action="commit-import" style="margin-top:12px;">Import Selected Players</button>
        `;

        previewEl.querySelector('[data-action="commit-import"]').addEventListener('click', () => {
          const checked = [...previewEl.querySelectorAll('[data-import-row]:checked')]
            .map((el) => validRows[Number(el.dataset.importRow)]);
          if (!checked.length) {
            alert('No players selected to import.');
            return;
          }
          update((state) => {
            checked.forEach((r) => {
              state.players.push({
                id: uid(),
                name: r.name,
                jerseyNumber: r.jerseyNumber,
                positions: r.positions,
                skillStream: r.skillStream,
                guardianName: r.guardianName,
                guardianPhone: r.guardianPhone,
                active: true,
              });
            });
          });
          closeModal();
        });
      }
    },
  });
}
