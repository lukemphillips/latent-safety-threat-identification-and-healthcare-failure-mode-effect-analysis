import { getState, shouldOfferAutoBackupRestore, getAutoBackups, restoreAutoBackupById, dismissAutoBackupPrompt } from '../store.js';
import { formatDate, formatTime, sortByDateTime, escapeHtml as escape, matchEligiblePlayers } from '../util.js';

function rsvpCounts(game, activePlayers) {
  const counts = { yes: 0, no: 0, maybe: 0, pending: 0 };
  activePlayers.forEach((p) => {
    const v = game.rsvps[p.id] || 'pending';
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

export function renderDashboard(app) {
  const { team, players, games } = getState();
  const activePlayers = matchEligiblePlayers(players);
  const upcoming = sortByDateTime(games.filter((g) => g.status !== 'completed'));
  const nextGame = upcoming[0] || null;
  const recentCompleted = sortByDateTime(games.filter((g) => g.status === 'completed')).reverse()[0] || null;
  const offerRestore = shouldOfferAutoBackupRestore();
  const latestBackup = offerRestore ? getAutoBackups()[0] : null;

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>${team.name || 'Your Team'}</h1>
        <div class="sub">${team.ageGroup ? team.ageGroup + ' · ' : ''}${team.squadFormat}-a-side</div>
      </div>
      <a class="icon-btn" href="#/help" aria-label="Help &amp; How-To">❓</a>
    </div>

    ${latestBackup ? `
      <div class="banner warn" style="margin-bottom:14px;">
        💾 No team set up here yet, but an automatic backup from ${new Date(latestBackup.at).toLocaleString()} was found on this device.
      </div>
      <div class="fab-row" style="margin-bottom:14px;">
        <button class="btn secondary block" data-action="restore-auto-backup">Restore Backup</button>
        <button class="btn ghost block" data-action="dismiss-auto-backup">Start Fresh</button>
      </div>
    ` : ''}

    <div class="section-title">Next Game</div>
    ${nextGame ? nextGameCard(nextGame, activePlayers) : `<div class="card empty">No games scheduled yet.<div style="margin-top:10px;"><a class="btn secondary sm" href="#/schedule">Add a game</a></div></div>`}

    ${recentCompleted ? `
      <div class="section-title">Last Result</div>
      ${lastResultCard(recentCompleted, team)}
    ` : ''}

    <div class="section-title">Quick Links</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
      <a class="btn secondary block" href="#/roster">👥 Roster (${activePlayers.length})</a>
      <a class="btn secondary block" href="#/schedule">📅 Schedule (${upcoming.length})</a>
      <a class="btn secondary block" href="#/training">🏃 Training</a>
      <a class="btn secondary block" href="#/stats">📊 Stats</a>
      <a class="btn secondary block" href="#/settings">⚙️ Settings</a>
      <a class="btn secondary block" href="#/help">❓ Help &amp; How-To</a>
    </div>
  `;

  const restoreBtn = app.querySelector('[data-action="restore-auto-backup"]');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      if (latestBackup) restoreAutoBackupById(latestBackup.id);
      renderDashboard(app);
    });
  }
  const dismissBtn = app.querySelector('[data-action="dismiss-auto-backup"]');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      dismissAutoBackupPrompt();
      renderDashboard(app);
    });
  }
}

function nextGameCard(game, activePlayers) {
  const counts = rsvpCounts(game, activePlayers);
  return `
    <a class="card" href="#/game/${game.id}" style="display:block;">
      <div class="card-row">
        <div>
          <div style="font-weight:700; font-size:15.5px;">${game.isHome ? 'vs' : '@'} ${escape(game.opponent)}</div>
          <div class="muted small">${formatDate(game.date)} · ${formatTime(game.time)}${game.location ? ' · ' + escape(game.location) : ''}</div>
        </div>
        <span class="badge ${game.status}">${game.status === 'live' ? 'LIVE' : game.status}</span>
      </div>
      <div class="rsvp-summary" style="margin-top:10px;">
        <span>✅ ${counts.yes} in</span>
        <span>❓ ${counts.maybe} maybe</span>
        <span>❌ ${counts.no} out</span>
        <span>⏳ ${counts.pending} pending</span>
      </div>
    </a>
  `;
}

function lastResultCard(game, team) {
  const us = game.live?.scoreUs ?? 0;
  const them = game.live?.scoreThem ?? 0;
  const result = us > them ? 'W' : us < them ? 'L' : 'D';
  const resultColor = result === 'W' ? 'yes' : result === 'L' ? 'no' : 'maybe';
  return `
    <a class="card" href="#/game/${game.id}" style="display:block;">
      <div class="card-row">
        <div>
          <div style="font-weight:700; font-size:15.5px;">${game.isHome ? 'vs' : '@'} ${escape(game.opponent)}</div>
          <div class="muted small">${formatDate(game.date)}</div>
        </div>
        <div class="row">
          <span class="badge ${resultColor}">${result}</span>
          <span style="font-weight:800; font-size:18px;">${us} - ${them}</span>
        </div>
      </div>
    </a>
  `;
}
