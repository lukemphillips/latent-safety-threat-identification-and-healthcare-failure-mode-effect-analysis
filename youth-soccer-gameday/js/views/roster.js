import { getState, update, findPlayer } from '../store.js';
import { uid, escapeHtml, streamBadgeHtml, playerPositions, formatPositions, copyToClipboard, comparePlayersBy, usedTeamAllocationsInOrder } from '../util.js';
import { openModal, closeModal, confirmDialog, alertDialog } from '../modal.js';
import { parseRosterFile, TEMPLATE_CSV } from '../importRoster.js';
import { isMatchdayOnly } from '../cloudSync.js';

// A Matchday-access device's roster edits are rejected by Cloud Sync's
// Apps Script regardless of what this app sends (see cloudSync.js), so
// opening the edit form here would just look like it worked and then
// quietly get overwritten on the next sync — better to explain up front.
function blockIfMatchdayOnly() {
  if (!isMatchdayOnly()) return false;
  alertDialog("The roster can only be changed from a Full Edit device — ask whoever set up Cloud Sync for that link if a player needs adding or editing.");
  return true;
}

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const STREAMS = ['A', 'B', 'C', 'D'];
const ROSTER_SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'stream', label: 'Stream' },
  { key: 'teamAllocation', label: 'Team Allocation' },
];

// null = the original default order (active first, then guests, then by
// jersey number) — same as before this sorting existed. Picking one of the
// columns below (same keys/behavior as Balance Teams' Squad table) sorts
// the whole roster by that instead, active/inactive/guest mixed together.
let rosterSortKey = null;
let rosterSortDir = 'asc';

// A single team-allocation value to show exclusively, or null for
// everyone — for clubs running one big squad across several named teams
// (e.g. "9.4", "9.5"), so a coach can pull up just their own sub-team.
let rosterTeamAllocFilter = null;

function sortRosterPlayers(players) {
  if (!rosterSortKey) {
    return [...players].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (!!a.isGuest !== !!b.isGuest) return a.isGuest ? 1 : -1;
      return (a.jerseyNumber ?? 0) - (b.jerseyNumber ?? 0);
    });
  }
  const sorted = [...players];
  sorted.sort((a, b) => {
    const cmp = comparePlayersBy(rosterSortKey, a, b);
    return rosterSortDir === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

export function renderRoster(app) {
  const { players } = getState();
  const teamAllocValues = usedTeamAllocationsInOrder(players);
  // Drop a filter that no longer matches anyone (e.g. the last player with
  // that value was reassigned) instead of silently showing an empty list.
  if (rosterTeamAllocFilter && !teamAllocValues.includes(rosterTeamAllocFilter)) rosterTeamAllocFilter = null;
  const filtered = rosterTeamAllocFilter
    ? players.filter((p) => p.teamAllocation === rosterTeamAllocFilter)
    : players;
  const sorted = sortRosterPlayers(filtered);

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Roster</h1>
        <div class="sub">${players.filter((p) => p.active && !p.isGuest).length} active players${players.some((p) => p.isGuest) ? ` · ${players.filter((p) => p.isGuest).length} guest${players.filter((p) => p.isGuest).length === 1 ? '' : 's'}` : ''}</div>
      </div>
      <div class="row" style="flex-wrap:wrap;">
        <a class="btn ghost sm" href="#/balance">🎲 Balance</a>
        <button class="btn ghost sm" data-action="import-roster">📥 Import</button>
        <button class="btn" data-action="add-player">+ Add</button>
      </div>
    </div>
    <div class="spread" style="margin:0 0 10px; flex-wrap:wrap; gap:8px 16px; align-items:center;">
      <div class="muted small">Sort by:</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        ${ROSTER_SORTS.map((s) => `
          <button type="button" class="btn ${rosterSortKey === s.key ? 'secondary' : 'ghost'} sm" data-roster-sort="${s.key}">
            ${s.label}${rosterSortKey === s.key ? (rosterSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
          </button>
        `).join('')}
      </div>
    </div>
    ${teamAllocValues.length ? `
      <div class="muted small" style="margin-bottom:4px;">Team allocation</div>
      <div class="chip-list" style="margin-bottom:12px;">
        ${teamAllocValues.map((v) => `<button type="button" class="bench-chip ${rosterTeamAllocFilter === v ? 'picking' : ''}" data-team-alloc-filter="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('')}
        ${rosterTeamAllocFilter ? '<button type="button" class="bench-chip" data-action="clear-team-alloc-filter">✕ Clear</button>' : ''}
      </div>
    ` : ''}
    <div class="card">
      ${sorted.length ? sorted.map(playerRow).join('') : `<div class="empty">${rosterTeamAllocFilter ? 'No players with this team allocation.' : 'No players yet. Add your first player.'}</div>`}
    </div>
  `;

  app.querySelector('[data-action="add-player"]').addEventListener('click', () => { if (!blockIfMatchdayOnly()) openPlayerForm(); });
  app.querySelector('[data-action="import-roster"]').addEventListener('click', () => { if (!blockIfMatchdayOnly()) openImportModal(); });
  app.querySelectorAll('[data-action="edit-player"]').forEach((el) => {
    el.addEventListener('click', () => { if (!blockIfMatchdayOnly()) openPlayerForm(el.dataset.id); });
  });
  app.querySelectorAll('[data-roster-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rosterSort;
      if (rosterSortKey === key) rosterSortDir = rosterSortDir === 'desc' ? 'asc' : 'desc';
      else { rosterSortKey = key; rosterSortDir = 'asc'; }
      renderRoster(app);
    });
  });
  app.querySelectorAll('[data-team-alloc-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.teamAllocFilter;
      rosterTeamAllocFilter = rosterTeamAllocFilter === value ? null : value;
      renderRoster(app);
    });
  });
  const clearFilterBtn = app.querySelector('[data-action="clear-team-alloc-filter"]');
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      rosterTeamAllocFilter = null;
      renderRoster(app);
    });
  }
}

function playerRow(p) {
  return `
    <div class="player-row" style="cursor:pointer;" data-action="edit-player" data-id="${p.id}">
      <div class="jersey">${p.jerseyNumber ?? '-'}</div>
      <div class="player-meta">
        <div class="player-name ${p.active ? '' : 'inactive'}">${escapeHtml(p.name)}</div>
        <div class="player-sub">${formatPositions(p)}${p.guardianName ? ' · ' + escapeHtml(p.guardianName) : ''}</div>
        ${p.notes ? `<div class="muted small" style="margin-top:2px;">📝 ${escapeHtml(p.notes)}</div>` : ''}
      </div>
      ${streamBadgeHtml(p.skillStream)}
      ${p.teamAllocation ? `<span class="badge team-alloc">${escapeHtml(p.teamAllocation)}</span>` : ''}
      ${p.isGuest ? `<span class="badge scheduled">👥 Guest${p.guestTeamName ? ` (${escapeHtml(p.guestTeamName)})` : ''}</span>` : ''}
      ${p.active ? '' : '<span class="badge pending">inactive</span>'}
    </div>
  `;
}

function openPlayerForm(playerId) {
  const existing = playerId ? findPlayer(playerId) : null;
  const p = existing || { name: '', jerseyNumber: '', positions: [], skillStream: '', teamAllocation: '', guardianName: '', guardianPhone: '', notes: '', active: true, isGuest: false, guestTeamName: '' };
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
          <label>Team allocation</label>
          <input type="text" name="teamAllocation" value="${escapeHtml(p.teamAllocation || '')}" placeholder="e.g. 9.4" style="max-width:160px;" />
          <div class="muted small" style="margin-top:4px;">Which of your club's teams this player is actually rostered to — for clubs running one big squad across several named teams (e.g. 9.4, 9.5). Separate from Balance Teams' random daily split.</div>
        </div>
        <div class="field">
          <label>Guardian name</label>
          <input type="text" name="guardianName" value="${escapeHtml(p.guardianName)}" />
        </div>
        <div class="field">
          <label>Guardian phone</label>
          <input type="tel" name="guardianPhone" value="${escapeHtml(p.guardianPhone)}" />
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea name="notes" placeholder="Anything worth remembering — allergies, pickup arrangements, injuries, etc.">${escapeHtml(p.notes || '')}</textarea>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" name="active" ${p.active ? 'checked' : ''} />
          Active on roster
        </label>
        <label class="checkbox-row">
          <input type="checkbox" id="player-is-guest" name="isGuest" ${p.isGuest ? 'checked' : ''} />
          👥 Guest player, visiting from another team
        </label>
        <div class="field" id="guest-team-name-field" ${p.isGuest ? '' : 'hidden'}>
          <label>Visiting from (optional)</label>
          <input type="text" name="guestTeamName" value="${escapeHtml(p.guestTeamName || '')}" placeholder="e.g. Riverside Rovers" />
        </div>
        <div class="muted small" style="margin-top:-8px;">Guests show up for Training attendance, groups, and small-sided matches, but never in Matchday, RSVP, a game's Squad/Lineup, Live Game, squad rules, Balance Teams, or Stats — they're not part of this team's actual fixtures.</div>
        <div class="modal-actions">
          <button type="submit" class="btn block">Save</button>
          ${existing ? '<button type="button" class="btn danger" data-action="delete-player">Delete</button>' : ''}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#player-form');
      const guestCheckbox = modalEl.querySelector('#player-is-guest');
      const guestTeamNameField = modalEl.querySelector('#guest-team-name-field');
      guestCheckbox.addEventListener('change', () => {
        guestTeamNameField.hidden = !guestCheckbox.checked;
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const isGuest = fd.get('isGuest') === 'on';
        const data = {
          name: (fd.get('name') || '').trim(),
          jerseyNumber: fd.get('jerseyNumber') ? Number(fd.get('jerseyNumber')) : null,
          positions: fd.getAll('positions'),
          skillStream: fd.get('skillStream') || null,
          teamAllocation: (fd.get('teamAllocation') || '').trim(),
          guardianName: (fd.get('guardianName') || '').trim(),
          guardianPhone: (fd.get('guardianPhone') || '').trim(),
          notes: (fd.get('notes') || '').trim(),
          active: fd.get('active') === 'on',
          isGuest,
          guestTeamName: isGuest ? (fd.get('guestTeamName') || '').trim() : '',
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
        delBtn.addEventListener('click', async () => {
          if (!(await confirmDialog(`Remove ${p.name} from the roster? This also removes their RSVPs and lineup spots.`, { okLabel: 'Remove', danger: true }))) return;
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
              g.subPlan = (g.subPlan || []).filter((e) => e.outId !== existing.id && e.inId !== existing.id);
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
        <label class="checkbox-row">
          <input type="checkbox" id="import-as-guests" />
          👥 Import this whole list as guest players (visiting from another team, for a joint training session)
        </label>
        <div class="field" id="import-guest-team-name-field" hidden>
          <label>Visiting from (optional)</label>
          <input type="text" id="import-guest-team-name" placeholder="e.g. Riverside Rovers" />
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
      const importAsGuestsCheckbox = modalEl.querySelector('#import-as-guests');
      const guestTeamNameField = modalEl.querySelector('#import-guest-team-name-field');
      let parsedRows = [];

      importAsGuestsCheckbox.addEventListener('change', () => {
        guestTeamNameField.hidden = !importAsGuestsCheckbox.checked;
      });

      copyBtn.addEventListener('click', async () => {
        await copyToClipboard(TEMPLATE_CSV, {
          onSuccess: () => { copyBtn.textContent = '✅ Copied!'; },
          onFallback: () => {
            fallbackEl.hidden = false;
            fallbackEl.focus();
            fallbackEl.select();
            copyBtn.textContent = 'Select the text below and copy it';
          },
        });
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
            alertDialog('No players selected to import.');
            return;
          }
          const isGuest = importAsGuestsCheckbox.checked;
          const guestTeamName = isGuest ? modalEl.querySelector('#import-guest-team-name').value.trim() : '';
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
                isGuest,
                guestTeamName,
              });
            });
          });
          closeModal();
        });
      }
    },
  });
}
