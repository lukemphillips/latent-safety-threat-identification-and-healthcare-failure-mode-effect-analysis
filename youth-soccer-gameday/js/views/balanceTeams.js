import { getState, update, findGame } from '../store.js';
import { escapeHtml, streamBadgeHtml, formatPositions, copyToClipboard, formatDate, sortByDateTime, matchEligiblePlayers, STREAM_ORDER, comparePlayersBy, shuffleArray, usedTeamAllocationsInOrder } from '../util.js';
import { isJuniorAgeGroup } from '../ageFormats.js';
import { buildGroupsByStream } from '../trainingGroups.js';
import { formationFor, emptyLineupSlots } from '../formations.js';
import { autoFillLineup } from './gameDetail.js';
import { confirmDialog } from '../modal.js';
import { isMatchdayOnly } from '../cloudSync.js';

const MIN_TEAMS = 2;
const MAX_TEAMS = 4;

let includedIds = null;
let teamCount = 2;
let splitMode = 'mixed';
let split = null;
let lastGameId = null;
let targetGameId = null;
let importedSquad = null;
let importedTeams = {};
let squadSortKey = 'name';
let squadSortDir = 'asc';

// A single team-allocation value to show exclusively in the Squad list, or
// null for everyone — same idea and values as Roster's filter, so a coach
// running several named sub-teams (e.g. "9.4", "9.5") can narrow down to
// just theirs before picking who's involved. Doesn't touch `includedIds`
// — hiding a row here doesn't change whether that player is selected.
let squadTeamAllocFilter = null;

function resetImportStatus() {
  importedSquad = null;
  importedTeams = {};
}

function sortSquadPlayers(list) {
  const sorted = [...list];
  sorted.sort((a, b) => {
    const cmp = comparePlayersBy(squadSortKey, a, b);
    return squadSortDir === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

// Which team (by index into `split`) a player currently sits on, or null
// before a split exists / if they somehow aren't in any team.
function teamIndexOf(playerId) {
  if (!split) return null;
  const idx = split.findIndex((team) => team.some((p) => p.id === playerId));
  return idx === -1 ? null : idx;
}

// Coming from a specific game, default the squad to who's actually
// confirmed rather than the whole roster — RSVPs if any are in, otherwise
// attendance already marked on the Squad tab, otherwise everyone active.
function defaultIncludedIds(game, active) {
  if (game) {
    const rsvpYes = active.filter((p) => game.rsvps?.[p.id] === 'yes');
    if (rsvpYes.length) return new Set(rsvpYes.map((p) => p.id));
    if ((game.presentIds || []).length) return new Set(game.presentIds);
  }
  return new Set(active.map((p) => p.id));
}

function includedFromLabel(game, active) {
  const rsvpYesCount = active.filter((p) => game.rsvps?.[p.id] === 'yes').length;
  if (rsvpYesCount) return `who RSVP'd "In" (${rsvpYesCount})`;
  if ((game.presentIds || []).length) return `who's marked present on the Squad tab (${game.presentIds.length})`;
  return 'the full active roster';
}

// "Mixed ability" — spreads each skill stream evenly across every team, so
// each one gets a fair cross-section for a competitive match.
export function splitBalancedTeams(players, count) {
  const buckets = new Map(STREAM_ORDER.map((s) => [s, []]));
  players.forEach((p) => {
    const key = STREAM_ORDER.includes(p.skillStream) ? p.skillStream : null;
    buckets.get(key).push(p);
  });

  const teams = Array.from({ length: count }, () => []);
  STREAM_ORDER.forEach((key) => {
    shuffleArray(buckets.get(key)).forEach((p) => {
      const minLen = Math.min(...teams.map((t) => t.length));
      const smallest = teams.map((t, i) => i).filter((i) => teams[i].length === minLen);
      const idx = smallest[Math.floor(Math.random() * smallest.length)];
      teams[idx].push(p);
    });
  });
  return teams;
}

// "Same stream" — clusters players of similar ability onto the same team
// instead, for running side-by-side matches at different intensities.
// Reuses Training's grouping algorithm (balance:true keeps team sizes
// fair, same as "Mixed ability" above) and maps its {playerIds} groups
// back to player objects; pads with empty teams if fewer streams are
// present than `count` asks for, so the UI always shows `count` teams.
function splitSameStream(players, count) {
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const groups = buildGroupsByStream(shuffleArray(players), count, true);
  const teams = groups.map((g) => g.playerIds.map((id) => byId[id]).filter(Boolean));
  while (teams.length < count) teams.push([]);
  return teams;
}

function splitByMode(players, count, mode) {
  return mode === 'same' ? splitSameStream(players, count) : splitBalancedTeams(players, count);
}

function streamCounts(team) {
  const counts = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  team.forEach((p) => {
    counts[p.skillStream && counts[p.skillStream] !== undefined ? p.skillStream : 'none'] += 1;
  });
  return counts;
}

function formatSplitForShare(teams, teamName) {
  const lines = [`${teamName || 'Squad'} — Team Split`, ''];
  teams.forEach((team, i) => {
    lines.push(`Team ${i + 1} (${team.length}):`);
    team.forEach((p) => lines.push(`  #${p.jerseyNumber ?? '-'} ${p.name}`));
    lines.push('');
  });
  return lines.join('\n').trim();
}

// Sends a squad straight into a scheduled game: sets who's present and
// auto-fills a fresh starting lineup for them — the whole reason to
// randomise or hand-pick a squad here is to skip re-doing that on the
// Squad tab afterward.
function sendSquadToMatch(playerIds, gameId) {
  update((state) => {
    const g = state.games.find((x) => x.id === gameId);
    if (!g) return;
    // Respects a formation the coach already picked for this game (e.g. on
    // its Squad tab) rather than silently resetting it back to the default.
    const formation = formationFor(state.team.squadFormat, g.formationId, state.team.customFormations || []);
    g.presentIds = [...playerIds];
    const presentPlayers = state.players.filter((p) => playerIds.includes(p.id));
    g.lineup = { slots: autoFillLineup(formation, presentPlayers, emptyLineupSlots(formation)) };
  });
}

function confirmOverwrite(targetGame) {
  if (!(targetGame.presentIds || []).length) return Promise.resolve(true);
  return confirmDialog(`vs ${targetGame.opponent} already has ${targetGame.presentIds.length} player(s) marked present. Replace with this squad and auto-fill a fresh lineup?`, { okLabel: 'Replace' });
}

export function renderBalanceTeams(app, gameId) {
  const { players, team, games } = getState();
  const active = matchEligiblePlayers(players);
  const junior = isJuniorAgeGroup(team.ageGroup);
  const game = gameId ? findGame(gameId) : null;
  const upcoming = sortByDateTime(games.filter((g) => g.status === 'scheduled'));

  if (!includedIds || lastGameId !== (gameId || null)) {
    includedIds = defaultIncludedIds(game, active);
    split = null;
    resetImportStatus();
    lastGameId = gameId || null;
  }
  // Drop anyone no longer active/present in the roster.
  includedIds = new Set([...includedIds].filter((id) => active.some((p) => p.id === id)));

  if (!targetGameId || !upcoming.some((g) => g.id === targetGameId)) {
    targetGameId = (game && game.status === 'scheduled') ? game.id : (upcoming[0]?.id || null);
  }

  const included = active.filter((p) => includedIds.has(p.id));
  const canSplit = included.length >= teamCount * 2;

  const teamAllocValues = usedTeamAllocationsInOrder(active);
  // Drop a filter that no longer matches anyone (e.g. the last player with
  // that value was reassigned) instead of silently showing an empty list.
  if (squadTeamAllocFilter && !teamAllocValues.includes(squadTeamAllocFilter)) squadTeamAllocFilter = null;
  const squadRows = squadTeamAllocFilter ? active.filter((p) => p.teamAllocation === squadTeamAllocFilter) : active;

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Balance Teams</h1>
        <div class="sub">${game
          ? `For ${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)} · ${formatDate(game.date)}`
          : 'Randomly split a squad into teams, balanced by skill stream'}</div>
      </div>
    </div>

    ${game ? `<a class="btn ghost sm" href="#/game/${game.id}" style="margin-bottom:12px; display:inline-flex;">← Back to game</a>` : ''}

    <div class="banner info">
      ${game
        ? `Starting from ${includedFromLabel(game, active)} for this match — untick anyone who won't be involved before you split.`
        : ''}
      ${junior
        ? ' Junior squads (U9 and under) often split a training group into several small teams for parallel mini-soccer games rather than one team with subs. Choose how many teams below, and whether to balance by ability or stream.'
        : " Pick who's involved, then split — choose how many teams and whether to balance by ability or stream below."}
    </div>

    <div class="section-title" style="margin-top:0;">Number of teams</div>
    <div class="tabs" style="max-width:320px;">
      ${Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => i + MIN_TEAMS).map((n) => `
        <div class="tab ${n === teamCount ? 'active' : ''}" data-team-count="${n}">${n} teams</div>
      `).join('')}
    </div>

    <div class="section-title">Balance by</div>
    <div class="tabs" style="max-width:320px;">
      <div class="tab ${splitMode === 'mixed' ? 'active' : ''}" data-split-mode="mixed">Mixed ability</div>
      <div class="tab ${splitMode === 'same' ? 'active' : ''}" data-split-mode="same">Same stream</div>
    </div>
    <div class="muted small" style="margin-top:6px;">${splitMode === 'same'
      ? 'Clusters players of similar ability onto the same team — handy for running side-by-side matches at different intensities.'
      : 'Spreads each skill stream evenly across every team, for one fair, competitive match.'}</div>

    <div class="section-title">Squad (${included.length}/${active.length})</div>
    <div class="card" style="overflow-x:auto;">
      <div class="spread" style="margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        <button class="btn ghost sm" data-action="select-all">Select All</button>
        <button class="btn ghost sm" data-action="select-none">Select None</button>
      </div>
      ${isMatchdayOnly() ? `<p class="muted small" style="margin:-4px 0 10px;">Team allocation can only be changed from a Full Edit device — edits here wouldn't save to the shared team anyway.</p>` : ''}
      ${teamAllocValues.length ? `
        <div class="muted small" style="margin-bottom:4px;">Team allocation</div>
        <div class="chip-list" style="margin-bottom:12px;">
          ${teamAllocValues.map((v) => `<button type="button" class="bench-chip ${squadTeamAllocFilter === v ? 'picking' : ''}" data-team-alloc-filter="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('')}
          ${squadTeamAllocFilter ? '<button type="button" class="bench-chip" data-action="clear-team-alloc-filter">✕ Clear</button>' : ''}
        </div>
      ` : ''}
      ${active.length ? `
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr>
              <th style="padding:6px 8px;"></th>
              <th data-squad-sort="name" style="text-align:left; padding:6px 8px; cursor:pointer; white-space:nowrap;">
                Name${squadSortKey === 'name' ? (squadSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
              </th>
              <th data-squad-sort="stream" style="text-align:left; padding:6px 8px; cursor:pointer; white-space:nowrap;">
                Stream${squadSortKey === 'stream' ? (squadSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
              </th>
              <th data-squad-sort="teamAllocation" style="text-align:left; padding:6px 8px; cursor:pointer; white-space:nowrap;">
                Team Allocation${squadSortKey === 'teamAllocation' ? (squadSortDir === 'desc' ? ' ▼' : ' ▲') : ''}
              </th>
              <th style="text-align:left; padding:6px 8px; white-space:nowrap;">Team</th>
            </tr>
          </thead>
          <tbody>
            ${squadRows.length ? sortSquadPlayers(squadRows).map((p) => squadRowHtml(p, includedIds.has(p.id))).join('') : `<tr><td colspan="5" style="padding:6px 8px;"><span class="muted small">No players with this team allocation.</span></td></tr>`}
          </tbody>
        </table>
      ` : '<span class="muted small">No active players on the roster.</span>'}
    </div>

    <button class="btn big block" data-action="split" style="margin:16px 0;" ${canSplit ? '' : 'disabled'}>🎲 ${split ? 'Shuffle Again' : 'Random Split'}</button>
    ${!canSplit ? `<div class="muted small" style="margin-top:-10px; margin-bottom:16px;">Pick at least ${teamCount * 2} players to split into ${teamCount} teams.</div>` : ''}

    ${split ? `
      <div class="spread" style="margin-bottom:10px;">
        <div class="section-title" style="margin:0;">Teams</div>
        <div style="display:flex; gap:8px;">
          <button class="btn secondary sm" data-action="copy-split">📋 Copy to Share</button>
          <button class="btn secondary sm" data-action="share-split" hidden>📤 Text / Share…</button>
        </div>
      </div>
      <textarea id="split-fallback" readonly hidden style="width:100%; min-height:100px; font-family:monospace; font-size:12px; padding:8px; border:1px solid var(--line); border-radius:8px; margin-bottom:12px;">${escapeHtml(formatSplitForShare(split, team.name))}</textarea>
      <div class="muted small" style="margin-bottom:12px;">Not happy with the split? Move a player between teams — either from the Squad table above, or the dropdown next to their name below.</div>
    ` : ''}

    ${matchTargetHtml(upcoming)}

    ${split ? teamsHtml(split, upcoming) : (!upcoming.length ? '' : wholeSquadImportHtml(included))}
  `;

  app.querySelector('[data-action="select-all"]').addEventListener('click', () => {
    includedIds = new Set(active.map((p) => p.id));
    split = null;
    resetImportStatus();
    renderBalanceTeams(app, gameId);
  });
  app.querySelector('[data-action="select-none"]').addEventListener('click', () => {
    includedIds = new Set();
    split = null;
    resetImportStatus();
    renderBalanceTeams(app, gameId);
  });

  app.querySelectorAll('[data-team-count]').forEach((el) => {
    el.addEventListener('click', () => {
      teamCount = Number(el.dataset.teamCount);
      split = null;
      resetImportStatus();
      renderBalanceTeams(app, gameId);
    });
  });

  app.querySelectorAll('[data-split-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      splitMode = el.dataset.splitMode;
      split = null;
      resetImportStatus();
      renderBalanceTeams(app, gameId);
    });
  });

  app.querySelectorAll('[data-team-alloc-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.teamAllocFilter;
      squadTeamAllocFilter = squadTeamAllocFilter === value ? null : value;
      renderBalanceTeams(app, gameId);
    });
  });
  const clearFilterBtn = app.querySelector('[data-action="clear-team-alloc-filter"]');
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      squadTeamAllocFilter = null;
      renderBalanceTeams(app, gameId);
    });
  }

  app.querySelectorAll('[data-squad-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.squadSort;
      if (squadSortKey === key) squadSortDir = squadSortDir === 'desc' ? 'asc' : 'desc';
      else { squadSortKey = key; squadSortDir = 'asc'; }
      renderBalanceTeams(app, gameId);
    });
  });

  app.querySelectorAll('[data-squad-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.squadToggle;
      if (includedIds.has(id)) includedIds.delete(id);
      else includedIds.add(id);
      split = null;
      resetImportStatus();
      renderBalanceTeams(app, gameId);
    });
  });

  // Saved straight to the player's roster record — it's a persistent club-
  // team label (e.g. "9.4"), not part of this page's own included/split
  // state, so it doesn't touch `split` and only needs a re-render if the
  // table happens to be sorted by it right now.
  app.querySelectorAll('[data-team-alloc]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.teamAlloc;
      const value = el.value.trim();
      update((state) => {
        const player = state.players.find((pl) => pl.id === id);
        if (player) player.teamAllocation = value;
      });
      if (squadSortKey === 'teamAllocation') renderBalanceTeams(app, gameId);
    });
  });

  const splitBtn = app.querySelector('[data-action="split"]');
  if (splitBtn) {
    splitBtn.addEventListener('click', () => {
      split = splitByMode(active.filter((p) => includedIds.has(p.id)), teamCount, splitMode);
      resetImportStatus();
      renderBalanceTeams(app, gameId);
    });
  }

  app.querySelectorAll('[data-team-assign]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const playerId = sel.dataset.teamAssign;
      const targetIdx = Number(sel.value);
      const sourceIdx = teamIndexOf(playerId);
      if (!split || sourceIdx == null || sourceIdx === targetIdx) return;
      const sourceTeam = split[sourceIdx];
      const targetTeam = split[targetIdx];
      if (!sourceTeam || !targetTeam) return;
      const moved = sourceTeam.find((p) => p.id === playerId);
      if (!moved) return;
      split[sourceIdx] = sourceTeam.filter((p) => p.id !== playerId);
      targetTeam.push(moved);
      // Either team's roster just changed — a previous "✅ Sent to X" tag
      // would now be describing a squad that no longer matches, so drop
      // it and let the coach re-send once they're happy with the move.
      delete importedTeams[sourceIdx];
      delete importedTeams[targetIdx];
      renderBalanceTeams(app, gameId);
    });
  });

  const copyBtn = app.querySelector('[data-action="copy-split"]');
  const shareBtn = app.querySelector('[data-action="share-split"]');
  const fallbackEl = app.querySelector('#split-fallback');
  if (copyBtn) {
    if (typeof navigator.share === 'function') shareBtn.hidden = false;

    copyBtn.addEventListener('click', async () => {
      await copyToClipboard(formatSplitForShare(split, team.name), {
        onSuccess: () => { copyBtn.textContent = '✅ Copied!'; },
        onFallback: () => {
          fallbackEl.hidden = false;
          fallbackEl.focus();
          fallbackEl.select();
          copyBtn.textContent = 'Select the text below and copy it';
        },
      });
      setTimeout(() => { copyBtn.textContent = '📋 Copy to Share'; }, 2500);
    });

    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: `${team.name || 'Squad'} — Team Split`, text: formatSplitForShare(split, team.name) });
      } catch {
        // User cancelled the share sheet, or it's unsupported here — Copy above always works.
      }
    });
  }

  const targetSelect = app.querySelector('#target-game');
  if (targetSelect) {
    targetSelect.addEventListener('change', () => {
      targetGameId = targetSelect.value;
      renderBalanceTeams(app, gameId);
    });
  }

  const importSquadBtn = app.querySelector('[data-action="import-squad"]');
  if (importSquadBtn) {
    importSquadBtn.addEventListener('click', async () => {
      const targetGame = findGame(targetGameId);
      if (!targetGame) return;
      if (!(await confirmOverwrite(targetGame))) return;
      sendSquadToMatch(included.map((p) => p.id), targetGameId);
      importedSquad = { gameId: targetGameId, opponent: targetGame.opponent };
      renderBalanceTeams(app, gameId);
    });
  }

  app.querySelectorAll('[data-action="import-team"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.teamIndex);
      const teamPlayers = split?.[idx];
      const targetGame = findGame(targetGameId);
      if (!targetGame || !teamPlayers) return;
      if (!(await confirmOverwrite(targetGame))) return;
      sendSquadToMatch(teamPlayers.map((p) => p.id), targetGameId);
      importedTeams[idx] = { gameId: targetGameId, opponent: targetGame.opponent };
      renderBalanceTeams(app, gameId);
    });
  });
}

function matchTargetHtml(upcoming) {
  if (!upcoming.length) {
    return `<div class="banner info">No scheduled matches yet — <a href="#/schedule">add one</a> first, then come back to send a squad straight into it.</div>`;
  }
  return `
    <div class="section-title">Send to a scheduled match</div>
    <div class="card">
      <div class="field" style="margin-bottom:0;">
        <label>Match</label>
        <select id="target-game">
          ${upcoming.map((g) => `<option value="${g.id}" ${g.id === targetGameId ? 'selected' : ''}>${g.isHome ? 'vs' : '@'} ${escapeHtml(g.opponent)} · ${formatDate(g.date)}</option>`).join('')}
        </select>
      </div>
    </div>
  `;
}

function wholeSquadImportHtml(included) {
  return `
    <button class="btn secondary block" data-action="import-squad" style="margin:12px 0;" ${included.length ? '' : 'disabled'}>→ Set as Match Squad (${included.length})</button>
    ${importedSquad ? `<div class="banner info" style="margin-top:-4px;">✅ Sent to ${escapeHtml(importedSquad.opponent)} — <a href="#/game/${importedSquad.gameId}/lineup">open match</a></div>` : ''}
  `;
}

function squadRowHtml(p, isIncluded) {
  return `
    <tr style="border-top:1px solid var(--line);">
      <td style="padding:6px 8px;"><input type="checkbox" data-squad-toggle="${p.id}" ${isIncluded ? 'checked' : ''} /></td>
      <td style="padding:6px 8px; white-space:nowrap;"><span class="jersey" style="width:24px; height:24px; font-size:11px;">${p.jerseyNumber ?? '-'}</span> ${escapeHtml(p.name)}</td>
      <td style="padding:6px 8px;">${streamBadgeHtml(p.skillStream)}</td>
      <td style="padding:6px 8px;">
        <input type="text" data-team-alloc="${p.id}" value="${escapeHtml(p.teamAllocation || '')}" placeholder="e.g. 9.4" style="width:80px; padding:4px 6px;" ${isMatchdayOnly() ? 'disabled title="Team allocation can only be changed from a Full Edit device"' : ''} />
      </td>
      <td style="padding:6px 8px;">${splitTeamCellHtml(p, isIncluded)}</td>
    </tr>
  `;
}

function splitTeamCellHtml(p, isIncluded) {
  if (!split) return '<span class="muted small">Not split yet</span>';
  if (!isIncluded) return '<span class="muted small">—</span>';
  const idx = teamIndexOf(p.id);
  return `
    <select data-team-assign="${p.id}">
      ${split.map((_, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>Team ${i + 1}</option>`).join('')}
    </select>
  `;
}

function teamsHtml(teams, upcoming) {
  return `
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start; margin-top:12px;">
      ${teams.map((team, i) => teamCardHtml(`Team ${i + 1}`, team, i, upcoming)).join('')}
    </div>
  `;
}

function teamCardHtml(label, team, idx, upcoming) {
  const counts = streamCounts(team);
  const imported = importedTeams[idx];
  return `
    <div class="card" style="flex:1 1 260px;">
      <div style="font-weight:700; margin-bottom:6px;">${label} (${team.length})</div>
      <div class="muted small" style="margin-bottom:10px;">A:${counts.A} · B:${counts.B} · C:${counts.C} · D:${counts.D}${counts.none ? ` · Unclassified:${counts.none}` : ''}</div>
      <div class="stack">
        ${team.length ? team.map((p) => `
          <div class="player-row">
            <div class="jersey">${p.jerseyNumber ?? '-'}</div>
            <div class="player-meta">
              <div class="player-name">${escapeHtml(p.name)}</div>
              <div class="player-sub">${formatPositions(p)}</div>
            </div>
            ${streamBadgeHtml(p.skillStream)}
            ${splitTeamCellHtml(p, true)}
          </div>
        `).join('') : '<span class="muted small">No one on this team.</span>'}
      </div>
      ${upcoming.length ? `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--line);">
          ${imported
            ? `<div class="small" style="color:var(--green-600); font-weight:600;">✅ Sent to ${escapeHtml(imported.opponent)}</div>
               <a class="btn ghost sm" href="#/game/${imported.gameId}/lineup" style="margin-top:6px; display:inline-flex;">Open match →</a>`
            : `<button type="button" class="btn secondary sm block" data-action="import-team" data-team-index="${idx}" ${team.length ? '' : 'disabled'}>→ Set as Match Squad</button>`}
        </div>
      ` : ''}
    </div>
  `;
}
