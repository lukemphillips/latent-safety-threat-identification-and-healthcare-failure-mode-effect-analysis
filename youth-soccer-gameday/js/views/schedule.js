import { getState, update } from '../store.js';
import { uid, escapeHtml, formatDate, formatTime, sortByDateTime, todayIso, nowHHMM, matchTypeBadgeHtml, matchEligiblePlayers } from '../util.js';
import { emptyLineupSlots, SQUAD_FORMAT_SIZES } from '../formations.js';
import { openModal, closeModal } from '../modal.js';

export function squadFormatOptionsHtml(selected) {
  return SQUAD_FORMAT_SIZES
    .map((size) => `<option value="${size}" ${size === selected ? 'selected' : ''}>${size}-a-side</option>`).join('');
}

export function renderSchedule(app) {
  const { games } = getState();
  const upcoming = sortByDateTime(games.filter((g) => g.status !== 'completed'));
  const past = sortByDateTime(games.filter((g) => g.status === 'completed')).reverse();

  app.innerHTML = `
    <div class="page-title">
      <h1>Matchday</h1>
      <button class="btn" data-action="add-game">+ Add Game</button>
    </div>

    <div class="section-title">Upcoming</div>
    ${upcoming.length ? matchDayGroups(upcoming) : '<div class="card empty">No upcoming games.</div>'}

    ${past.length ? `
      <div class="section-title">Past</div>
      ${matchDayGroups(past, true)}
    ` : ''}
  `;

  app.querySelector('[data-action="add-game"]').addEventListener('click', () => openGameForm());
}

function matchDayGroups(games, preserveOrder) {
  const byDate = [];
  games.forEach((g) => {
    let group = byDate.find((x) => x.date === g.date);
    if (!group) { group = { date: g.date, games: [] }; byDate.push(group); }
    group.games.push(g);
  });
  if (!preserveOrder) byDate.sort((a, b) => a.date.localeCompare(b.date));

  return byDate.map((group) => `
    ${group.games.length > 1 ? `<div class="muted small" style="margin:10px 0 4px; font-weight:700;">${formatDate(group.date)} — Match Day (${group.games.length} matches)</div>` : ''}
    ${group.games.map(gameCard).join('')}
  `).join('');
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

export function openGameForm(prefill) {
  const pf = prefill || {};
  const { team } = getState();
  const isMatchDayAdd = !!pf.date;
  openModal({
    title: isMatchDayAdd ? 'Add Match Day Opponent' : 'Add Game',
    bodyHtml: `
      <form id="game-form" class="stack">
        <div class="field">
          <label>Match type</label>
          <select name="matchType">
            <option value="league" ${(!pf.matchType || pf.matchType === 'league') ? 'selected' : ''}>League</option>
            <option value="friendly" ${pf.matchType === 'friendly' ? 'selected' : ''}>Friendly</option>
            <option value="tournament" ${pf.matchType === 'tournament' ? 'selected' : ''}>Tournament</option>
          </select>
        </div>
        <div class="field-row" data-tournament-fields ${pf.matchType === 'tournament' ? '' : 'hidden'}>
          <div class="field">
            <label>Tournament name</label>
            <input type="text" name="tournamentName" value="${escapeHtml(pf.tournamentName || '')}" placeholder="e.g. Summer Cup" />
          </div>
          <div class="field">
            <label>Stage</label>
            <input type="text" name="stage" value="${escapeHtml(pf.stage || '')}" placeholder="e.g. Group Stage" />
          </div>
        </div>
        <div class="field">
          <label>Opponent</label>
          <input type="text" name="opponent" required placeholder="e.g. Riverside Rovers" />
        </div>
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
        <label class="checkbox-row">
          <input type="checkbox" name="isHome" ${pf.isHome === false ? '' : 'checked'} />
          Home game
        </label>
        <div class="field">
          <label>Format</label>
          <select name="squadFormat">${squadFormatOptionsHtml(pf.squadFormat ?? team.squadFormat)}</select>
          <p class="muted small" style="margin:4px 0 0;">Only for this match — your team's usual format (${team.squadFormat}-a-side) is unaffected. Handy for a friendly or tournament played at a different size.</p>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Minutes per period</label>
            <input type="number" name="periodMinutes" min="1" max="60" value="${pf.periodMinutes ?? team.periodMinutes}" />
          </div>
          <div class="field">
            <label># of periods</label>
            <input type="number" name="numPeriods" min="1" max="4" value="${pf.numPeriods ?? team.numPeriods}" />
          </div>
        </div>
        ${!isMatchDayAdd ? `
          <label class="checkbox-row">
            <input type="checkbox" name="addSecondMatch" />
            ⚡ Also add a second match this day (same date, location & format — different opponent)
          </label>
          <div class="field-row" data-second-match-fields hidden>
            <div class="field">
              <label>Second opponent</label>
              <input type="text" name="secondOpponent" placeholder="e.g. Eastside United" />
            </div>
            <div class="field">
              <label>Second match time</label>
              <input type="time" name="secondTime" value="${pf.time || nowHHMM()}" />
            </div>
          </div>
        ` : ''}
        <button type="submit" class="btn block">${isMatchDayAdd ? 'Add Match' : 'Add Game'}</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#game-form');
      const typeSelect = form.querySelector('[name="matchType"]');
      const tournamentFields = form.querySelector('[data-tournament-fields]');
      typeSelect.addEventListener('change', () => {
        tournamentFields.hidden = typeSelect.value !== 'tournament';
      });

      const secondMatchCheckbox = form.querySelector('[name="addSecondMatch"]');
      const secondMatchFields = form.querySelector('[data-second-match-fields]');
      if (secondMatchCheckbox) {
        secondMatchCheckbox.addEventListener('change', () => {
          secondMatchFields.hidden = !secondMatchCheckbox.checked;
        });
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const opponent = (fd.get('opponent') || '').trim();
        if (!opponent) return;

        const periodMinutes = Number(fd.get('periodMinutes')) || team.periodMinutes;
        const numPeriods = Number(fd.get('numPeriods')) || team.numPeriods;
        const squadFormat = Number(fd.get('squadFormat')) || team.squadFormat;
        // Only stored on the game when it actually differs from the team's
        // current default — left null (inherit), a game keeps tracking the
        // team default even if that's changed later in Settings (which
        // reshapes every inheriting game's lineup); an explicit override
        // here is a deliberate choice for just this match and stays put.
        const squadFormatOverride = squadFormat !== team.squadFormat ? squadFormat : null;
        const secondOpponent = (fd.get('secondOpponent') || '').trim();
        const addSecond = fd.get('addSecondMatch') === 'on' && secondOpponent;

        const firstId = uid();
        const secondId = addSecond ? uid() : null;

        update((state) => {
          const buildRsvps = () => {
            const rsvps = {};
            matchEligiblePlayers(state.players).forEach((p) => { rsvps[p.id] = 'pending'; });
            return rsvps;
          };
          const shared = {
            matchType: fd.get('matchType') || 'league',
            tournamentName: (fd.get('tournamentName') || '').trim(),
            stage: (fd.get('stage') || '').trim(),
            date: fd.get('date'),
            location: (fd.get('location') || '').trim(),
            isHome: fd.get('isHome') === 'on',
            periodMinutes,
            numPeriods,
            squadFormat: squadFormatOverride,
            status: 'scheduled',
            captainId: null,
            playerOfMatchId: null,
            live: null,
            notes: '',
            updatedAt: Date.now(),
          };
          state.games.push({
            id: firstId, opponent, time: fd.get('time'), rsvps: buildRsvps(), presentIds: [],
            lineup: { slots: emptyLineupSlots(squadFormat) }, ...shared,
          });
          if (secondId) {
            state.games.push({
              id: secondId, opponent: secondOpponent, time: fd.get('secondTime') || fd.get('time'), rsvps: buildRsvps(), presentIds: [],
              lineup: { slots: emptyLineupSlots(squadFormat) }, ...shared,
            });
          }
        });
        closeModal();
        location.hash = `#/game/${firstId}`;
      });
    },
  });
}
