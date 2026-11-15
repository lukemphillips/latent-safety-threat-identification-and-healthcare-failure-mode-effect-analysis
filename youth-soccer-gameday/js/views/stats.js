import { getState, update } from '../store.js';
import { escapeHtml, formatDate, formatMinutes, formatPercent, formatPositions, matchTypeBadgeHtml, sortByDateTime, startOfWeekIso, weekLabel, monthKey, monthLabel, uid, periodLabel, gameNumPeriods, gamePeriodMinutes, matchEligiblePlayers } from '../util.js';
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
    { key: 'avgMinutes', label: 'Avg Min' },
    { key: 'goals', label: 'G' },
    { key: 'assists', label: 'A' },
    { key: 'saves', label: 'Sv' },
  ];
  if (team.enableCards) {
    cols.push({ key: 'yellows', label: 'Y' }, { key: 'reds', label: 'R' });
  }
  if (team.minPlayingTimePercent != null) {
    cols.push({ key: 'playingTimePercent', label: 'PT%' });
  }
  cols.push(
    { key: 'potm', label: '⭐' }, { key: 'captaincies', label: '🅲' },
    { key: 'weeklyAwards', label: '🏅' }, { key: 'attendance', label: 'Match Att%' },
    { key: 'trainingAttendance', label: 'Trn Att%' },
  );
  return cols;
}

// The compact Leaders table's own columns — just the handful of stats a
// coach actually scans at a glance. sortColumns(team) above (the full
// set, including PT%/POTM/captaincies/awards/attendance) is still used
// for the per-player detail modal, and for the "more stats" sort dropdown
// below (deepStatColumns) — whichever of those is currently active also
// gets appended as an extra column here, so sorting by it never leaves a
// value on screen unexplained.
function keyStatColumns(team) {
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
  return cols;
}

// Stats not shown as a table column by default — reachable through the
// "more stats" dropdown instead of crowding the table with 13 columns.
function deepStatColumns(team) {
  const keyKeys = new Set(keyStatColumns(team).map((c) => c.key));
  return sortColumns(team).filter((c) => !keyKeys.has(c.key));
}

// Full-word labels for the player detail modal — the short single-letter/
// icon labels above are only meant for a dense table header.
const STAT_FULL_LABELS = {
  apps: 'Appearances',
  minutes: 'Minutes Played',
  avgMinutes: 'Avg Playing Time per Match',
  goals: 'Goals',
  assists: 'Assists',
  saves: 'Saves',
  yellows: 'Yellow Cards',
  reds: 'Red Cards',
  playingTimePercent: 'Playing Time %',
  potm: 'Player of the Match',
  captaincies: 'Captaincies',
  weeklyAwards: 'Weekly Awards',
  attendance: 'Match Attendance',
  trainingAttendance: 'Training Attendance',
};

// Shared by the leader card's headline number and the player detail
// modal's full stat list, so the two never disagree on formatting.
function statDisplayValue(row, key, team) {
  if (key === 'minutes') return formatMinutes(row.minutes);
  if (key === 'avgMinutes') return row.avgMinutes == null ? '—' : formatMinutes(row.avgMinutes);
  if (key === 'attendance') return row.attendance == null ? '—' : formatPercent(row.attendance);
  if (key === 'trainingAttendance') return row.trainingAttendance == null ? '—' : formatPercent(row.trainingAttendance);
  if (key === 'playingTimePercent') {
    if (row.playingTimePercent == null) return '—';
    const below = team.minPlayingTimePercent != null && Math.round(row.playingTimePercent * 100) < team.minPlayingTimePercent;
    return `${below ? '⚠️ ' : ''}${formatPercent(row.playingTimePercent)}`;
  }
  return row[key];
}

let sortKey = 'goals';
let sortDir = 'desc';

// Sorting the Leaders table re-renders the whole Stats page, which would
// otherwise snap every open <details> (Earlier Weeks, Goalkeeper
// Appearances, History months, Head-to-Head) back closed. Keyed open/closed
// state survives that re-render; a key only appears here once the coach has
// actually toggled it, so sections keep whatever default they're given below
// until then.
const detailsOpenState = {};
function isDetailsOpen(key, defaultOpen) {
  return key in detailsOpenState ? detailsOpenState[key] : defaultOpen;
}
function trackDetailsToggle(app) {
  app.querySelectorAll('details[data-details-key]').forEach((el) => {
    el.addEventListener('toggle', () => {
      detailsOpenState[el.dataset.detailsKey] = el.open;
    });
  });
}

function computeLeaderRows() {
  const { players, games, trainings, team } = getState();
  const active = matchEligiblePlayers(players);
  const completed = games.filter((g) => g.status === 'completed');
  const trackedForAttendance = games.filter((g) => (g.presentIds || []).length > 0);
  const trackedTrainings = (trainings || []).filter((t) => (t.presentIds || []).length > 0);
  const weeklyAwards = team.weeklyAwards || [];

  return active.map((p) => {
    let minutes = 0, goals = 0, assists = 0, saves = 0, apps = 0, yellows = 0, reds = 0, potm = 0, captaincies = 0;
    // "Possible" seconds — the total length of every completed match this
    // player was actually present for (whether picked or benched) — is the
    // denominator for playingTimePercent below: minutes they *could* have
    // played, not just a count of matches, so a season with a mix of
    // 50-minute and 70-minute matches still comes out fair.
    let possibleSeconds = 0;
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
      if ((g.presentIds || []).includes(p.id)) {
        possibleSeconds += gameNumPeriods(g, team) * gamePeriodMinutes(g, team) * 60;
      }
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
    const playingTimePercent = possibleSeconds > 0 ? minutes / possibleSeconds : null;
    const avgMinutes = apps > 0 ? minutes / apps : null;
    const presentCount = trackedForAttendance.filter((g) => (g.presentIds || []).includes(p.id)).length;
    const attendance = trackedForAttendance.length ? presentCount / trackedForAttendance.length : null;
    const trainingPresentCount = trackedTrainings.filter((t) => (t.presentIds || []).includes(p.id)).length;
    const trainingAttendance = trackedTrainings.length ? trainingPresentCount / trackedTrainings.length : null;
    const weeklyAwardCount = weeklyAwards.filter((a) => awardPlayerIds(a).includes(p.id)).length;
    return { player: p, apps, minutes, avgMinutes, goals, assists, saves, yellows, reds, potm, captaincies, weeklyAwards: weeklyAwardCount, attendance, trainingAttendance, playingTimePercent };
  });
}

const NULLABLE_SORT_KEYS = ['attendance', 'trainingAttendance', 'playingTimePercent', 'avgMinutes'];

function sortRows(rows) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'name') return a.player.name.localeCompare(b.player.name) * dir;
    const av = NULLABLE_SORT_KEYS.includes(sortKey) ? (a[sortKey] ?? -1) : a[sortKey];
    const bv = NULLABLE_SORT_KEYS.includes(sortKey) ? (b[sortKey] ?? -1) : b[sortKey];
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

// Groups match history by calendar month, most recent first, so a full
// season's worth of matches collapses into a handful of drop-down
// sections instead of one long unbroken list. Only the most recent month
// starts open.
function historyByMonth(history) {
  const byMonth = {};
  history.forEach((g) => {
    const key = monthKey(g.date);
    byMonth[key] = byMonth[key] || [];
    byMonth[key].push(g);
  });
  return Object.entries(byMonth)
    .map(([key, gamesInMonth]) => {
      let w = 0, d = 0, l = 0;
      gamesInMonth.forEach((g) => {
        if (g.status !== 'completed' || !g.live) return;
        if (g.live.scoreUs > g.live.scoreThem) w += 1;
        else if (g.live.scoreUs < g.live.scoreThem) l += 1;
        else d += 1;
      });
      return { key, games: gamesInMonth, w, d, l };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
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
  const active = matchEligiblePlayers(players);
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
  const { team, games } = getState();
  const { rows, maxPeriods } = computeGoalkeeperRows();
  const hasCompletedGame = games.some((g) => g.status === 'completed' && g.live);
  if (!rows.length) {
    // Shown even when empty (rather than disappearing outright) so it's
    // clear the feature exists and what's missing — no completed match
    // yet, or one has finished but no keeper was ever assigned per half.
    return `
      <div class="section-title">🧤 Goalkeeper Appearances</div>
      <div class="card empty">${hasCompletedGame
        ? 'No completed match yet has a goalkeeper recorded for a half — set one on the Squad tab before starting, or confirm it when a new period begins.'
        : 'Once a match is completed with a goalkeeper set for each half, appearances will show up here.'}</div>
    `;
  }
  const periodNumbers = Array.from({ length: maxPeriods }, (_, i) => i + 1);
  return `
    <details class="card" data-details-key="goalkeeper" ${isDetailsOpen('goalkeeper', false) ? 'open' : ''}>
      <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:700;">
        <span>🧤 Goalkeeper Appearances</span>
        <span class="small muted">${rows.length} player${rows.length === 1 ? '' : 's'}</span>
      </summary>
      <div style="overflow-x:auto; margin-top:10px;">
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
    </details>
  `;
}

const STATS_TABS = ['leaders', 'history', 'h2h', 'awards'];
const STATS_TAB_LABELS = { leaders: 'Leaders', history: 'History', h2h: 'Head-to-Head', awards: 'Awards' };

// Used to be one long scroll through Player of the Week, the Leaders
// table, Goalkeeper Appearances, History, and Head-to-Head all stacked on
// top of each other — a full season made that a lot of scrolling just to
// check one thing. Tabbed instead, same pattern as Training's Plan/
// Attendance/Groups/Matches; each tab renders into its own content div so
// switching doesn't re-run the other tabs' setup.
export function renderStats(app, tab = 'leaders') {
  if (!STATS_TABS.includes(tab)) tab = 'leaders';
  const { games, trainings } = getState();
  const completedCount = games.filter((g) => g.status === 'completed').length;
  const trainingsTrackedCount = (trainings || []).filter((t) => (t.presentIds || []).length > 0).length;

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Stats</h1>
        <div class="sub">${completedCount} match${completedCount === 1 ? '' : 'es'} played${trainingsTrackedCount ? ` · ${trainingsTrackedCount} training session${trainingsTrackedCount === 1 ? '' : 's'} tracked` : ''}</div>
      </div>
    </div>

    <div class="tabs">
      ${STATS_TABS.map((t) => `<a class="tab ${tab === t ? 'active' : ''}" href="#/stats/${t}">${STATS_TAB_LABELS[t]}</a>`).join('')}
    </div>

    <div id="stats-tab-content" style="margin-top:14px;"></div>
  `;

  const content = app.querySelector('#stats-tab-content');
  if (tab === 'history') renderHistoryTab(content);
  else if (tab === 'h2h') renderH2hTab(content);
  else if (tab === 'awards') renderAwardsTab(content, app);
  else renderLeadersTab(content);
}

function renderLeadersTab(container) {
  const { team } = getState();
  const rows = sortRows(computeLeaderRows());
  const baseColumns = keyStatColumns(team);
  const deepColumns = deepStatColumns(team);
  const activeDeepColumn = deepColumns.find((c) => c.key === sortKey);
  const columns = activeDeepColumn ? [...baseColumns, activeDeepColumn] : baseColumns;

  // Rank medals only mean something for an actual leaderboard ordering —
  // sorted by a stat, highest first. Alphabetical (or ascending) sort
  // isn't ranking anyone, so no medals then. Raw time-on-pitch isn't an
  // achievement either (it's often just who was available, or a fair-play
  // rotation) — Apps/Minutes/Avg Min get no medals even sorted desc.
  const NO_MEDAL_KEYS = new Set(['apps', 'minutes', 'avgMinutes']);
  const showMedals = sortKey !== 'name' && sortDir === 'desc' && !NO_MEDAL_KEYS.has(sortKey);
  const sortChips = [{ key: 'name', label: 'Player' }, ...columns];

  container.innerHTML = `
    <p class="muted small" style="margin:0 0 8px;">Tap a stat to sort by it, tap a player for their full stat breakdown.</p>
    ${team.minPlayingTimePercent != null ? `
      <p class="muted small" style="margin:0 0 8px;">⚠️ = below this team's ${team.minPlayingTimePercent}% playing-time standard (<a href="#/settings">Settings</a>).</p>
    ` : ''}
    <div class="row" style="gap:8px; margin-bottom:10px;">
      <select id="leader-deep-sort-select" style="flex:1;">
        <option value=""${activeDeepColumn ? '' : ' selected'}>More stats to sort by…</option>
        ${deepColumns.map((c) => `<option value="${c.key}"${sortKey === c.key ? ' selected' : ''}>${escapeHtml(STAT_FULL_LABELS[c.key] || c.label)}</option>`).join('')}
      </select>
    </div>
    <div class="chip-list" style="margin-bottom:12px;">
      ${sortChips.map((c) => `
        <button type="button" class="leader-sort-chip${sortKey === c.key ? ' active' : ''}" data-sort-col="${c.key}">
          ${escapeHtml(c.label)}${sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
        </button>
      `).join('')}
    </div>
    <div class="leader-list">
      ${rows.length ? rows.map((r, i) => leaderRowHtml(r, columns, team, showMedals ? i : -1)).join('') : '<div class="card empty">No players yet.</div>'}
    </div>

    ${goalkeeperStatsHtml()}
  `;

  trackDetailsToggle(container);

  container.querySelectorAll('[data-sort-col]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.sortCol;
      if (sortKey === key) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      // Alphabetical sort reads more naturally starting A→Z; every stat
      // column still starts highest-first, same as before.
      else { sortKey = key; sortDir = key === 'name' ? 'asc' : 'desc'; }
      renderLeadersTab(container);
    });
  });
  const deepSortSelect = container.querySelector('#leader-deep-sort-select');
  if (deepSortSelect) {
    deepSortSelect.addEventListener('change', () => {
      if (!deepSortSelect.value) return;
      sortKey = deepSortSelect.value;
      sortDir = 'desc';
      renderLeadersTab(container);
    });
  }
  container.querySelectorAll('[data-action="open-player-stats"]').forEach((row) => {
    row.addEventListener('click', () => {
      const r = rows.find((x) => x.player.id === row.dataset.playerId);
      if (r) openPlayerStatsModal(r, team);
    });
  });
}

function renderHistoryTab(container) {
  const history = sortByDateTime(getState().games).reverse();
  const months = historyByMonth(history);
  container.innerHTML = history.length ? months.map((m, i) => historyMonthHtml(m, i === 0)).join('') : '<div class="card empty">No games yet.</div>';
  trackDetailsToggle(container);
}

function renderH2hTab(container) {
  const h2h = headToHead();
  container.innerHTML = h2h.length ? h2h.map(h2hRowHtml).join('') : '<div class="card empty">No head-to-head history yet — play the same opponent twice to see it here.</div>';
  trackDetailsToggle(container);
}

function renderAwardsTab(container, app) {
  const weeks = weeksWithGames();
  // Only the most recent couple of weeks need to be visible right away —
  // older ones are still one tap away, just tucked behind a drop-down
  // instead of adding to how far a coach has to scroll every time.
  const recentWeeks = weeks.slice(0, 2);
  const earlierWeeks = weeks.slice(2);

  container.innerHTML = weeks.length ? `
    <div id="recent-weeks">${recentWeeks.map(weekRowHtml).join('')}</div>
    ${earlierWeeks.length ? `
      <details class="card" id="earlier-weeks" data-details-key="earlier-weeks" ${isDetailsOpen('earlier-weeks', false) ? 'open' : ''}>
        <summary style="cursor:pointer; font-weight:700;">${earlierWeeks.length} earlier week${earlierWeeks.length === 1 ? '' : 's'}</summary>
        <div class="stack" style="margin-top:10px;">${earlierWeeks.map(weekRowHtml).join('')}</div>
      </details>
    ` : ''}
  ` : '<div class="card empty">No completed match weeks yet.</div>';

  trackDetailsToggle(container);
  container.querySelectorAll('[data-action="set-week-award"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const week = weeks.find((w) => w.weekStart === btn.dataset.week);
      if (week) openWeekAwardModal(week, () => renderStats(app, 'awards'));
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
  const active = matchEligiblePlayers(players);
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

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

// A player "card" row — just the key-stat set (keyStatColumns above), with
// the whole row tappable to open the full breakdown (every other stat
// sortColumns(team) tracks) in a modal. Used to be a dense table row; a
// phone-width table left little room per stat and read as a spreadsheet,
// so each stat is now its own small tile instead of a table column, and
// the current sort's leader(s) get a medal.
function leaderRowHtml(row, columns, team, rank) {
  const belowStandard = team.minPlayingTimePercent != null && row.playingTimePercent != null
    && Math.round(row.playingTimePercent * 100) < team.minPlayingTimePercent;
  const avatarLabel = row.player.jerseyNumber != null ? row.player.jerseyNumber : row.player.name.charAt(0).toUpperCase();
  const medal = rank >= 0 && rank < RANK_MEDALS.length ? RANK_MEDALS[rank] : '';
  return `
    <div class="leader-row" data-action="open-player-stats" data-player-id="${row.player.id}">
      <div class="leader-avatar">
        ${escapeHtml(String(avatarLabel))}
        ${medal ? `<span class="leader-medal">${medal}</span>` : ''}
      </div>
      <div class="leader-main">
        <div class="leader-name" data-stat="name">${escapeHtml(row.player.name)}${belowStandard ? ` <span title="Below this team's ${team.minPlayingTimePercent}% minimum playing time standard (set in Settings)">⚠️</span>` : ''}</div>
        <div class="muted leader-pos">${formatPositions(row.player)}</div>
        <div class="leader-stats">
          ${columns.map((c) => `
            <div class="leader-stat${sortKey === c.key ? ' active' : ''}" data-stat="${c.key}">
              <span class="leader-stat-val">${statDisplayValue(row, c.key, team)}</span>
              <span class="leader-stat-lbl">${escapeHtml(c.label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// Matches the full-word STAT_FULL_LABELS above — a small icon in front of
// each row so the card reads less like a spreadsheet and more like a
// player card's stat line.
const STAT_ICONS = {
  apps: '📅',
  minutes: '⏱️',
  avgMinutes: '⏱️',
  goals: '⚽',
  assists: '🅰️',
  saves: '🧤',
  yellows: '🟨',
  reds: '🟥',
  playingTimePercent: '📊',
  potm: '⭐',
  captaincies: '🅲',
  weeklyAwards: '🏅',
  attendance: '✅',
  trainingAttendance: '🏃',
};

// Manual rounded-rect path — kept local rather than ctx.roundRect() since
// not every in-app-browser WebView a parent's phone might render this in
// supports it yet.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const CARD_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Draws the same card the modal shows onto a <canvas> and resolves to a
// PNG Blob — so it can be saved to the camera roll or handed to the
// native share sheet, rather than a parent only ever seeing it as a
// screenshot the coach happened to take.
function renderPlayerCardImage(row, team, columns) {
  const avatarLabel = row.player.jerseyNumber != null ? String(row.player.jerseyNumber) : row.player.name.charAt(0).toUpperCase();
  const sub = `${formatPositions(row.player)}${row.player.jerseyNumber != null ? ` · #${row.player.jerseyNumber}` : ''}`;
  const stats = columns.map((c) => ({
    icon: STAT_ICONS[c.key] || '',
    label: STAT_FULL_LABELS[c.key] || c.label,
    value: String(statDisplayValue(row, c.key, team)),
  }));

  const SCALE = 3;
  const W = 340;
  const MARGIN = 16;
  const HEADER_H = 172;
  const ROW_H = 34;
  const H = MARGIN * 2 + HEADER_H + 14 + stats.length * ROW_H;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const hx = MARGIN, hy = MARGIN, hw = W - MARGIN * 2, hh = HEADER_H;
  roundRectPath(ctx, hx, hy, hw, hh, 14);
  const grad = ctx.createLinearGradient(hx, hy, hx + hw * 0.4, hy + hh * 1.2);
  grad.addColorStop(0, '#0b3d38');
  grad.addColorStop(0.55, '#155e54');
  grad.addColorStop(1, '#c79a2e');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, hx, hy, hw, hh, 14);
  ctx.clip();
  const sheen = ctx.createRadialGradient(hx + hw * 0.25, hy + hh * 0.1, 0, hx + hw * 0.25, hy + hh * 0.1, hw * 0.65);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(hx, hy, hw, hh);
  ctx.restore();

  const cx = W / 2, cy = hy + 54, r = 34;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#d9ae3f';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.stroke();
  ctx.fillStyle = '#141414';
  ctx.font = `800 26px ${CARD_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(avatarLabel, cx, cy + 1);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 21px ${CARD_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(row.player.name, cx, cy + r + 30);

  ctx.globalAlpha = 0.88;
  ctx.font = `13px ${CARD_FONT}`;
  ctx.fillText(sub, cx, cy + r + 50);
  ctx.globalAlpha = 1;

  const listTop = hy + hh + 14;
  ctx.textAlign = 'left';
  stats.forEach((s, i) => {
    const rowTop = listTop + i * ROW_H;
    const textY = rowTop + ROW_H / 2 + 5;
    ctx.fillStyle = '#141414';
    ctx.font = `14px ${CARD_FONT}`;
    ctx.fillText(`${s.icon} ${s.label}`, MARGIN, textY);
    ctx.textAlign = 'right';
    ctx.font = `700 15px ${CARD_FONT}`;
    ctx.fillText(s.value, W - MARGIN, textY);
    ctx.textAlign = 'left';
    if (i < stats.length - 1) {
      ctx.strokeStyle = '#e8e6df';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN, rowTop + ROW_H);
      ctx.lineTo(W - MARGIN, rowTop + ROW_H);
      ctx.stroke();
    }
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'player';
}

function openPlayerStatsModal(row, team) {
  const columns = sortColumns(team);
  const avatarLabel = row.player.jerseyNumber != null ? row.player.jerseyNumber : row.player.name.charAt(0).toUpperCase();
  openModal({
    title: row.player.name,
    bodyHtml: `
      <div class="player-card">
        <div class="player-card-avatar">${escapeHtml(String(avatarLabel))}</div>
        <div class="player-card-name">${escapeHtml(row.player.name)}</div>
        <div class="player-card-sub">${formatPositions(row.player)}${row.player.jerseyNumber != null ? ` · #${row.player.jerseyNumber}` : ''}</div>
      </div>
      <div class="stack" style="gap:0;">
        ${columns.map((c) => `
          <div class="sublog-item player-card-stat-row">
            <span>${STAT_ICONS[c.key] || ''} ${escapeHtml(STAT_FULL_LABELS[c.key] || c.label)}</span>
            <strong>${statDisplayValue(row, c.key, team)}</strong>
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn secondary block" data-action="save-player-card" style="margin-top:14px;">💾 Save as Image</button>
      <button type="button" class="btn block" data-close-modal style="margin-top:10px;">Close</button>
    `,
    onMount: (modalEl) => {
      const saveBtn = modalEl.querySelector('[data-action="save-player-card"]');
      saveBtn.addEventListener('click', async () => {
        const originalLabel = saveBtn.textContent;
        saveBtn.disabled = true;
        try {
          const blob = await renderPlayerCardImage(row, team, columns);
          const filename = `${sanitizeFilename(row.player.name)}-card.png`;
          const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: `${row.player.name} — Player Card` });
              return;
            } catch {
              // User cancelled the share sheet, or it failed here — fall through to a plain save instead.
            }
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          saveBtn.textContent = '✅ Saved!';
          setTimeout(() => { saveBtn.textContent = originalLabel; }, 2000);
        } catch {
          alertDialog('Could not generate the image on this device — try again, or take a screenshot instead.');
        } finally {
          saveBtn.disabled = false;
        }
      });
    },
  });
}

// One drop-down per calendar month — the most recent starts open, every
// earlier one starts collapsed, so History reads as a handful of tappable
// headers instead of a scroll through every match the team's ever played.
function historyMonthHtml(month, isOpenByDefault) {
  const record = (month.w || month.d || month.l) ? ` — ${month.w}W ${month.d}D ${month.l}L` : '';
  const key = `month:${month.key}`;
  return `
    <details class="card" data-month="${month.key}" data-details-key="${key}" ${isDetailsOpen(key, isOpenByDefault) ? 'open' : ''}>
      <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:700;">
        <span>${escapeHtml(monthLabel(month.key))}</span>
        <span class="small muted" style="font-weight:400;">${month.games.length} match${month.games.length === 1 ? '' : 'es'}${record}</span>
      </summary>
      <div style="margin-top:8px;">
        ${month.games.map(historyRowHtml).join('')}
      </div>
    </details>
  `;
}

function historyRowHtml(game) {
  const result = game.status === 'completed' && game.live
    ? resultBadge(game.live.scoreUs, game.live.scoreThem)
    : '';
  const scoreText = game.status === 'completed' && game.live ? `${game.live.scoreUs}-${game.live.scoreThem}` : '';
  return `
    <a class="sublog-item" href="#/game/${game.id}" style="text-decoration:none; color:inherit;">
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
    </a>
  `;
}

function resultBadge(us, them) {
  const r = us > them ? 'W' : us < them ? 'L' : 'D';
  const cls = r === 'W' ? 'yes' : r === 'L' ? 'no' : 'maybe';
  return `<span class="badge ${cls}">${r}</span>`;
}

function h2hRowHtml(entry) {
  const key = `h2h:${entry.opponent}`;
  return `
    <details class="card" data-details-key="${key}" ${isDetailsOpen(key, false) ? 'open' : ''}>
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
