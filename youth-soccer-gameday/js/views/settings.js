import { getState, update, resetToSample, clearAllData } from '../store.js';
import { FORMATIONS, emptyLineupSlots } from '../formations.js';
import { escapeHtml } from '../util.js';

export function renderSettings(app) {
  const { team } = getState();

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
      <button type="submit" class="btn block">Save Team Settings</button>
    </form>

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
}
