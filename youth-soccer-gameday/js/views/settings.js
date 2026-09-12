import { getState, update, resetToSample, clearAllData, findPlayer } from '../store.js';
import { FORMATIONS, emptyLineupSlots } from '../formations.js';
import { escapeHtml, uid } from '../util.js';
import { openModal, closeModal } from '../modal.js';

export function renderSettings(app) {
  const { team, players } = getState();

  app.innerHTML = `
    <div class="page-title"><h1>Settings</h1></div>

    <div class="section-title">Team</div>
    <form id="team-form" class="card stack">
      <div class="field">
        <label>Team name</label>
        <input type="text" name="name" value="${escapeHtml(team.name)}" required />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Age group</label>
          <input type="text" name="ageGroup" value="${escapeHtml(team.ageGroup)}" placeholder="e.g. U10" />
        </div>
        <div class="field">
          <label>Format</label>
          <select name="squadFormat">
            ${Object.values(FORMATIONS).map((f) => `<option value="${f.size}" ${team.squadFormat === f.size ? 'selected' : ''}>${f.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Minutes per period</label>
          <input type="number" name="periodMinutes" min="1" max="60" value="${team.periodMinutes}" />
        </div>
        <div class="field">
          <label># of periods</label>
          <input type="number" name="numPeriods" min="1" max="4" value="${team.numPeriods}" />
        </div>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" name="equalPlayingTimePolicy" ${team.equalPlayingTimePolicy ? 'checked' : ''} />
        Equal playing time policy (show fair-play suggestions during live games)
      </label>
      <button type="submit" class="btn block">Save Team Settings</button>
    </form>

    <div class="section-title">Squad Rules</div>
    <div class="card">
      <p class="muted small mt-0">Pairs of players who should never both be off the pitch at the same time (e.g. only one confident goalkeeper cover). Advisory only — you can always override.</p>
      <div class="stack">
        ${(team.rules || []).length
          ? team.rules.map((r) => ruleRow(r)).join('')
          : '<p class="muted small">No rules set.</p>'}
      </div>
      <button class="btn secondary block" data-action="add-rule" style="margin-top:10px;">+ Add Rule</button>
    </div>

    <div class="section-title">Data</div>
    <div class="card stack">
      <p class="muted small mt-0">All data is stored only in this browser (no account, no server). Use these to demo the app or start fresh.</p>
      <button class="btn secondary block" data-action="reset-sample">Reload Sample Data</button>
      <button class="btn danger block" data-action="clear-data">Clear All Data</button>
    </div>
  `;

  app.querySelector('#team-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newFormat = Number(fd.get('squadFormat'));
    const formatChanged = newFormat !== team.squadFormat;

    if (formatChanged) {
      const hasLineups = getState().games.some(
        (g) => g.status !== 'completed' && Object.values(g.lineup?.slots || {}).some(Boolean)
      );
      if (hasLineups && !confirm('Changing the squad format will reset lineups for upcoming games. Continue?')) {
        return;
      }
    }

    update((state) => {
      state.team.name = (fd.get('name') || '').trim() || state.team.name;
      state.team.ageGroup = (fd.get('ageGroup') || '').trim();
      state.team.squadFormat = newFormat;
      state.team.periodMinutes = Number(fd.get('periodMinutes')) || state.team.periodMinutes;
      state.team.numPeriods = Number(fd.get('numPeriods')) || state.team.numPeriods;
      state.team.equalPlayingTimePolicy = fd.get('equalPlayingTimePolicy') === 'on';
      if (formatChanged) {
        state.games.forEach((g) => {
          if (g.status !== 'completed') g.lineup = { slots: emptyLineupSlots(newFormat) };
        });
      }
    });
  });

  app.querySelector('[data-action="reset-sample"]').addEventListener('click', () => {
    if (confirm('Reload sample team, roster, and games? This replaces current data.')) resetToSample();
  });
  app.querySelector('[data-action="clear-data"]').addEventListener('click', () => {
    if (confirm('Clear all players and games? This cannot be undone.')) clearAllData();
  });

  app.querySelector('[data-action="add-rule"]').addEventListener('click', () => openRuleForm(players));
  app.querySelectorAll('[data-action="remove-rule"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      update((state) => {
        state.team.rules = (state.team.rules || []).filter((r) => r.id !== btn.dataset.id);
      });
    });
  });
}

function ruleRow(r) {
  const a = findPlayer(r.playerAId);
  const b = findPlayer(r.playerBId);
  return `
    <div class="card-row">
      <span class="small">${escapeHtml(a?.name || 'Unknown')} &amp; ${escapeHtml(b?.name || 'Unknown')} — keep at least one on the pitch</span>
      <button class="icon-btn" data-action="remove-rule" data-id="${r.id}" aria-label="Remove rule">✕</button>
    </div>
  `;
}

function openRuleForm(players) {
  const active = players.filter((p) => p.active);
  if (active.length < 2) {
    alert('You need at least two active players to set a rule.');
    return;
  }
  const options = (excludeId) => active
    .filter((p) => p.id !== excludeId)
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  openModal({
    title: 'Add Squad Rule',
    bodyHtml: `
      <form id="rule-form" class="stack">
        <p class="muted small mt-0">These two players should never both be on the bench at the same time.</p>
        <div class="field">
          <label>Player A</label>
          <select name="playerA">${options()}</select>
        </div>
        <div class="field">
          <label>Player B</label>
          <select name="playerB">${options(active[0]?.id)}</select>
        </div>
        <button type="submit" class="btn block">Add Rule</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#rule-form');
      const selectA = form.querySelector('[name="playerA"]');
      const selectB = form.querySelector('[name="playerB"]');
      selectA.addEventListener('change', () => {
        const keep = selectB.value;
        selectB.innerHTML = options(selectA.value);
        if ([...selectB.options].some((o) => o.value === keep)) selectB.value = keep;
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const playerAId = selectA.value;
        const playerBId = selectB.value;
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        update((state) => {
          state.team.rules = state.team.rules || [];
          state.team.rules.push({ id: uid(), playerAId, playerBId });
        });
        closeModal();
      });
    },
  });
}
