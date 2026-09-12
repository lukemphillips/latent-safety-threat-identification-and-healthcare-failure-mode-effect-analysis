import { getState, update } from '../store.js';
import { uid, escapeHtml, formatDate, formatTime, sortByDateTime, todayIso, nowHHMM, matchTypeBadgeHtml } from '../util.js';
import { emptyLineupSlots } from '../formations.js';
import { openModal, closeModal } from '../modal.js';

export function renderSchedule(app) {
  const { games } = getState();
  const upcoming = sortByDateTime(games.filter((g) => g.status !== 'completed'));
  const past = sortByDateTime(games.filter((g) => g.status === 'completed')).reverse();

  app.innerHTML = `
    <div class="page-title">
      <h1>Schedule</h1>
      <button class="btn" data-action="add-game">+ Add Game</button>
    </div>

    <div class="section-title">Upcoming</div>
    ${upcoming.length ? upcoming.map(gameCard).join('') : '<div class="card empty">No upcoming games.</div>'}

    ${past.length ? `
      <div class="section-title">Past</div>
      ${past.map(gameCard).join('')}
    ` : ''}
  `;

  app.querySelector('[data-action="add-game"]').addEventListener('click', openGameForm);
}

function gameCard(game) {
  const result = game.status === 'completed' && game.live
    ? ` · ${game.live.scoreUs}-${game.live.scoreThem}`
    : '';
  const tournamentLine = game.matchType === 'tournament' && game.tournamentName
    ? `<div class="muted small">${escapeHtml(game.tournamentName)}${game.stage ? ' · ' + escapeHtml(game.stage) : ''}</div>`
    : '';
  return `
    <a class="card" href="#/game/${game.id}" style="display:block;">
      <div class="card-row">
        <div>
          <div style="font-weight:700; font-size:15px;">${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)}</div>
          <div class="muted small">${formatDate(game.date)} · ${formatTime(game.time)}${game.location ? ' · ' + escapeHtml(game.location) : ''}${result}</div>
          ${tournamentLine}
        </div>
        <div class="stack" style="align-items:flex-end;">
          <span class="badge ${game.status}">${game.status === 'live' ? 'LIVE' : game.status}</span>
          ${matchTypeBadgeHtml(game)}
        </div>
      </div>
    </a>
  `;
}

function openGameForm() {
  openModal({
    title: 'Add Game',
    bodyHtml: `
      <form id="game-form" class="stack">
        <div class="field">
          <label>Match type</label>
          <select name="matchType">
            <option value="league" selected>League</option>
            <option value="friendly">Friendly</option>
            <option value="tournament">Tournament</option>
          </select>
        </div>
        <div class="field-row" data-tournament-fields hidden>
          <div class="field">
            <label>Tournament name</label>
            <input type="text" name="tournamentName" placeholder="e.g. Summer Cup" />
          </div>
          <div class="field">
            <label>Stage</label>
            <input type="text" name="stage" placeholder="e.g. Group Stage" />
          </div>
        </div>
        <div class="field">
          <label>Opponent</label>
          <input type="text" name="opponent" required placeholder="e.g. Riverside Rovers" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Date</label>
            <input type="date" name="date" value="${todayIso()}" required />
          </div>
          <div class="field">
            <label>Time</label>
            <input type="time" name="time" value="${nowHHMM()}" required />
          </div>
        </div>
        <div class="field">
          <label>Location</label>
          <input type="text" name="location" placeholder="Field / address" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" name="isHome" checked />
          Home game
        </label>
        <button type="submit" class="btn block">Add Game</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#game-form');
      const typeSelect = form.querySelector('[name="matchType"]');
      const tournamentFields = form.querySelector('[data-tournament-fields]');
      typeSelect.addEventListener('change', () => {
        tournamentFields.hidden = typeSelect.value !== 'tournament';
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const opponent = (fd.get('opponent') || '').trim();
        if (!opponent) return;
        update((state) => {
          const rsvps = {};
          state.players.filter((p) => p.active).forEach((p) => { rsvps[p.id] = 'pending'; });
          state.games.push({
            id: uid(),
            opponent,
            matchType: fd.get('matchType') || 'league',
            tournamentName: (fd.get('tournamentName') || '').trim(),
            stage: (fd.get('stage') || '').trim(),
            date: fd.get('date'),
            time: fd.get('time'),
            location: (fd.get('location') || '').trim(),
            isHome: fd.get('isHome') === 'on',
            status: 'scheduled',
            rsvps,
            presentIds: [],
            lineup: { slots: emptyLineupSlots(state.team.squadFormat) },
            live: null,
            notes: '',
          });
        });
        closeModal();
        location.hash = `#/game/${getState().games[getState().games.length - 1].id}`;
      });
    },
  });
}
