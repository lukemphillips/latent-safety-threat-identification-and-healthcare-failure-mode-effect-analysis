import { getState, update } from '../store.js';
import { escapeHtml, formatDate, formatMinutes, formatPercent, formatPositions, matchTypeBadgeHtml, sortByDateTime, startOfWeekIso, weekLabel, uid, periodLabel, gameNumPeriods } from '../util.js';
import { openModal, closeModal, alertDialog } from '../modal.js';

// Reads a weekly award's chosen players regardless of whether it's the
// current multi-player shape (playerIds) or an older single-player one
// (playerId) saved before multiple winners were supported.
function awardPlayerIds(award) {
  if (!award) return [];
  if (award.playerIds) return award.playerIds;
  return award.playerId ? [award.playerId] : [];
}

function sortColumns(team) {
  const cols = [
    { key: 'apps', label: 'Apps' },
    { key: 'minutes', label: 'Min' },
    { key: 'goals', label: 'G' },
    { key: 'assists', label: 'A' },
    { key: 'saves', label: 'Sv' },
  ];
  if (team.enableCards) {
    cols.push({ key: 'yellows', label: 'Y' }, { key: 'reds', label: 'R' });
  }
  cols.push(
    { key: 'potm', label: '⭐' }, { key: 'captaincies', label: '🅲' },
    { key: 'weeklyAwards', label: '🏅' }, { key: 'attendance', label: 'Att%' },
  );
  return cols;
}

let sortKey = 'goals';
let sortDir = 'desc';

function computeLeaderRows() {
  const { players, games, team } = getState();
  const active = players.filter((p) => p.active);
  const completed = games.filter((g) => g.status === 'completed');
  const trackedForAttendance = games.filter((g) => (g.presentIds || []).length > 0);
  const weeklyAwards = team.weeklyAwards || [];

  return active.map((p) => {
    let minutes = 0, goals = 0, assists = 0, saves = 0, apps = 0, yellows = 0, reds = 0, potm = 0, captaincies = 0;
    completed.forEach((g) => {
      // On a match-day with more than one game, playingTime is seeded from
      // the earlier match(es) so the live fair-play banner can compare
      // minutes across the whole day (see matchDayCarryover in
      // gameDetail.js) — it is NOT this game's own minutes. Subtract the
      // carryover baseline back out so a player's season totals/apps count
      // what they actually played in this game, not what they'd already
      // played before it started.
      const total = g.live?.playingTime?.[p.id] || 0;
      const carriedIn = g.live?.carryoverSeconds?.[p.id] || 0;
      const secs = Math.max(0, total - carriedIn);
      if (secs > 0) apps += 1;
      minutes += secs;
      if (g.playerOfMatchId === p.id) potm += 1;
      if (g.captainId === p.id) captaincies += 1;
      (g.live?.subLog || []).forEach((e) => {
        if (e.type === 'goal-us' && e.scorerId === p.id) goals += 1;
        if (e.type === 'goal-us' && e.assistId === p.id) assists += 1;
        if (e.type === 'save' && e.playerId === p.id) saves += 1;
        if (e.type === 'card' && e.playerId === p.id && e.cardType === 'yellow') yellows += 1;
        if (e.type === 'card' && e.playerId === p.id && e.cardType === 'red') reds += 1;
      });
    });
    const presentCount = trackedForAttendance.filter((g) => (g.presentIds || []).includes(p.id)).length;
    const attendance = trackedForAttendance.length ? presentCount / trackedForAttendance.length : null;
    const weeklyAwardCount = weeklyAwards.filter((a) => awardPlayerIds(a).includes(p.id)).length;
    return { player: p, apps, minutes, goals, assists, saves, yellows, reds, potm, captaincies, weeklyAwards: weeklyAwardCount, attendance };
  });
}

function sortRows(rows) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortKey === 'attendance' ? (a.attendance ?? -1) : a[sortKey];
    const bv = sortKey === 'attendance' ? (b.attendance ?? -1) : b[sortKey];
    if (av === bv) return a.player.name.localeCompare(b.player.name);
    return (av - bv) * dir;
  });
}

// Groups completed games into Monday-anchored weeks so a coach can name a
// Player of the Week once that week's matches are done, rather than only
// having a per-match "Player of the Match" — separate honors most youth
// leagues track side by side.
function weeksWithGames() {
  const { games, team } = getState();
  const completed = games.filter((g) => g.status === 'completed');
  const byWeek = {};
  completed.forEach((g) => {
    const weekStart = startOfWeekIso(g.date);
    byWeek[weekStart] = byWeek[weekStart] || [];
    byWeek[weekStart].push(g);
  });
  return Object.entries(byWeek)
    .map(([weekStart, gamesInWeek]) => {
      const presentIds = new Set();
      gamesInWeek.forEach((g) => (g.presentIds || []).forEach((id) => presentIds.add(id)));
      const award = (team.weeklyAwards || []).find((a) => a.weekStart === weekStart) || null;
      return { weekStart, games: sortByDateTime(gamesInWeek), presentIds: [...presentIds], award };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function headToHead() {
  const { games } = getState();
  const completed = games.filter((g) => g.status === 'completed' && g.live);
  const byOpponent = {};
  completed.forEach((g) => {
    byOpponent[g.opponent] = byOpponent[g.opponent] || [];
    byOpponent[g.opponent].push(g);
  });
  return Object.entries(byOpponent).map(([opponent, list]) => {
    let w = 0, d = 0, l = 0;
    list.forEach((g) => {
      if (g.live.scoreUs > g.live.scoreThem) w += 1;
      else if (g.live.scoreUs < g.live.scoreThem) l += 1;
      else d += 1;
    });
    return { opponent, games: sortByDateTime(list).reverse(), w, d, l };
  }).sort((a, b) => a.opponent.localeCompare(b.opponent));
}

// How many times each player has gone in goal, broken down by which half
// (or quarter, etc. — whatever the team's period format is) they kept for.
// gkByPeriod on a completed game's live state is { periodNumber: playerId
// } for that one match; this tallies it across every completed match.
// Columns are labelled off the team's current period format/count rather
// than each game's own numPeriods, since a season's matches are normally
// all played to the same format — good enough without tracking a label
// per historical game.
function computeGoalkeeperRows() {
  const { players, games, team } = getState();
  const active = players.filter((p) => p.active);
  const completed = games.filter((g) => g.status === 'completed' && g.live);

  let maxPeriods = 0;
  completed.forEach((g) => {
    maxPeriods = Math.max(maxPeriods, gameNumPeriods(g, team));
  });

  const rows = active
    .map((p) => {
      const byPeriod = {};
      let total = 0;
      completed.forEach((g) => {
        Object.entries(g.live.gkByPeriod || {}).forEach(([periodNum, playerId]) => {
          if (playerId !== p.id) return;
          byPeriod[periodNum] = (byPeriod[periodNum] || 0) + 1;
          total += 1;
        });
      });
      return { player: p, byPeriod, total };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.player.name.localeCompare(b.player.name));

  return { rows, maxPeriods };
}

function goalkeeperStatsHtml() {
  const { team } = getState();
  const { rows, maxPeriods } = computeGoalkeeperRows();
  if (!rows.length) return '';
  const periodNumbers = Array.from({ length: maxPeriods }, (_, i) => i + 1);
  return `
    <div class="section-title">🧤 Goalkeeper Appearances</div>
    <div class="card" style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:6px 8px;">Player</th>
            ${periodNumbers.map((n) => `<th style="text-align:right; padding:6px 8px; white-space:nowrap;">${escapeHtml(periodLabel(team.numPeriods, n))}</th>`).join('')}
            <th style="text-align:right; padding:6px 8px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr style="border-top:1px solid var(--line);">
              <td style="padding:6px 8px; font-weight:600;">${escapeHtml(r.player.name)}</td>
              ${periodNumbers.map((n) => `<td style="text-align:right; padding:6px 8px;">${r.byPeriod[n] || 0}</td>`).join('')}
              <td style="text-align:right; padding:6px 8px; font-weight:700;">${r.total}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderStats(app) {
  const { games, team } = getState();
  const completedCount = games.filter((g) => g.status === 'completed').length;
  const rows = sortRows(computeLeaderRows());
  const history = sortByDateTime(games).reverse();
  const h2h = headToHead();
  const columns = sortColumns(team);
  const weeks = weeksWithGames();

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Stats</h1>
        <div class="sub">${completedCount} match${completedCount === 1 ? '' : 'es'} played</div>
      </div>
    </div>

    ${weeks.length ? `
      <div class="section-title">🏅 Player of the Week</div>
      ${weeks.map(weekRowHtml).join('')}
    ` : ''}

    <div class="section-title">Leaders</div>
    <div class="card" style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:6px 8px;">Player</th>
            ${columns.map((c) => `
              <th data-sort-col="${c.key}" style="text-align:right; padding:6px 8px; cursor:pointer; white-space:nowrap;">
                ${c.label}${sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((r) => leaderRowHtml(r, columns)).join('') : `<tr><td colspan="${columns.length + 1}" class="empty">No players yet.</td></tr>`}
        </tbody>
      </table>
    </div>

    ${goalkeeperStatsHtml()}

    <div class="section-title">History</div>
    ${history.length ? history.map(historyRowHtml).join('') : '<div class="card empty">No games yet.</div>'}

    ${h2h.length ? `
      <div class="section-title">Head-to-Head</div>
      ${h2h.map(h2hRowHtml).join('')}
    ` : ''}
  `;

  app.querySelectorAll('[data-sort-col]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortCol;
      if (sortKey === key) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      else { sortKey = key; sortDir = 'desc'; }
      renderStats(app);
    });
  });

  app.querySelectorAll('[data-action="set-week-award"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const week = weeks.find((w) => w.weekStart === btn.dataset.week);
      if (week) openWeekAwardModal(week, () => renderStats(app));
    });
  });
}

function weekRowHtml(week) {
  const { players } = getState();
  const winnerIds = awardPlayerIds(week.award);
  const winners = winnerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  return `
    <div class="card">
      <div class="card-row">
        <div>
          <div style="font-weight:700;">${escapeHtml(weekLabel(week.weekStart))}</div>
          <div class="muted small">${week.games.map((g) => `${g.isHome ? 'vs' : '@'} ${escapeHtml(g.opponent)}`).join(', ')}</div>
        </div>
        <button class="btn ghost sm" data-action="set-week-award" data-week="${week.weekStart}">${winners.length ? 'Change' : 'Set'}</button>
      </div>
      <div class="small" style="margin-top:8px;">⭐ ${winners.length ? winners.map((p) => `<strong>${escapeHtml(p.name)}</strong>`).join(', ') : '<span class="muted">Not set</span>'}</div>
    </div>
  `;
}

function openWeekAwardModal(week, onSaved) {
  const { players } = getState();
  const active = players.filter((p) => p.active);
  const present = active.filter((p) => week.presentIds.includes(p.id));
  const pool = present.length ? present : active;
  if (!pool.length) {
    alertDialog('No active players to choose from yet.');
    return;
  }
  const selectedIds = new Set(awardPlayerIds(week.award));
  openModal({
    title: 'Player of the Week',
    bodyHtml: `
      <p class="muted small mt-0">${escapeHtml(weekLabel(week.weekStart))} — ${week.games.map((g) => `${g.isHome ? 'vs' : '@'} ${escapeHtml(g.opponent)}`).join(', ')}. Pick one or more.</p>
      <form id="week-award-form" class="stack">
        <div class="stack" style="max-height:280px; overflow-y:auto;">
          ${pool.map((p) => `
            <label class="checkbox-row">
              <input type="checkbox" name="players" value="${p.id}" ${selectedIds.has(p.id) ? 'checked' : ''} />
              ${escapeHtml(p.name)}
            </label>
          `).join('')}
        </div>
        <button type="submit" class="btn block">Save</button>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('#week-award-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const playerIds = new FormData(e.target).getAll('players');
        update((state) => {
          state.team.weeklyAwards = state.team.weeklyAwards || [];
          const existing = state.team.weeklyAwards.find((a) => a.weekStart === week.weekStart);
          if (!playerIds.length) {
            state.team.weeklyAwards = state.team.weeklyAwards.filter((a) => a.weekStart !== week.weekStart);
          } else if (existing) {
            existing.playerIds = playerIds;
            delete existing.playerId;
          } else {
            state.team.weeklyAwards.push({ id: uid(), weekStart: week.weekStart, playerIds });
          }
        });
        closeModal();
        onSaved();
      });
    },
  });
}

function leaderRowHtml(row, columns) {
  const cellFor = {
    apps: row.apps,
    minutes: formatMinutes(row.minutes),
    goals: row.goals,
    assists: row.assists,
    saves: row.saves,
    yellows: row.yellows,
    reds: row.reds,
    potm: row.potm,
    captaincies: row.captaincies,
    weeklyAwards: row.weeklyAwards,
    attendance: row.attendance == null ? '—' : formatPercent(row.attendance),
  };
  return `
    <tr style="border-top:1px solid var(--line);">
      <td style="padding:6px 8px;">
        <div style="font-weight:600;">${escapeHtml(row.player.name)}</div>
        <div class="muted" style="font-size:11px;">${formatPositions(row.player)}</div>
      </td>
      ${columns.map((c) => `<td style="text-align:right; padding:6px 8px;">${cellFor[c.key]}</td>`).join('')}
    </tr>
  `;
}

function historyRowHtml(game) {
  const result = game.status === 'completed' && game.live
    ? resultBadge(game.live.scoreUs, game.live.scoreThem)
    : '';
  const scoreText = game.status === 'completed' && game.live ? `${game.live.scoreUs}-${game.live.scoreThem}` : '';
  return `
    <a class="card" href="#/game/${game.id}" style="display:block;">
      <div class="card-row">
        <div>
          <div style="font-weight:700; font-size:14.5px;">${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)}</div>
          <div class="muted small">${formatDate(game.date)}${game.matchType === 'tournament' && game.tournamentName ? ' · ' + escapeHtml(game.tournamentName) : ''}</div>
        </div>
        <div class="stack" style="align-items:flex-end;">
          <div class="row">
            ${result}
            ${scoreText ? `<span style="font-weight:800;">${scoreText}</span>` : `<span class="badge ${game.status}">${game.status}</span>`}
          </div>
          ${matchTypeBadgeHtml(game)}
        </div>
      </div>
    </a>
  `;
}

function resultBadge(us, them) {
  const r = us > them ? 'W' : us < them ? 'L' : 'D';
  const cls = r === 'W' ? 'yes' : r === 'L' ? 'no' : 'maybe';
  return `<span class="badge ${cls}">${r}</span>`;
}

function h2hRowHtml(entry) {
  return `
    <details class="card">
      <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700;">${escapeHtml(entry.opponent)}</span>
        <span class="small muted">${entry.w}W ${entry.d}D ${entry.l}L</span>
      </summary>
      <div style="margin-top:10px;">
        ${entry.games.map((g) => `
          <div class="sublog-item">
            <span>${formatDate(g.date)}${g.isHome ? '' : ' (away)'}</span>
            <span>${g.live ? `${g.live.scoreUs}-${g.live.scoreThem}` : '—'}</span>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}
