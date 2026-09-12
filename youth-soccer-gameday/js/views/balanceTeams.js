import { getState, findGame } from '../store.js';
import { escapeHtml, streamBadgeHtml, formatPositions, copyToClipboard, formatDate } from '../util.js';
import { isJuniorAgeGroup } from '../ageFormats.js';

const STREAM_ORDER = ['A', 'B', 'C', 'D', null];
const MIN_TEAMS = 2;
const MAX_TEAMS = 4;

let includedIds = null;
let teamCount = 2;
let split = null;
let lastGameId = null;

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

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function splitBalancedTeams(players, count) {
  const buckets = new Map(STREAM_ORDER.map((s) => [s, []]));
  players.forEach((p) => {
    const key = STREAM_ORDER.includes(p.skillStream) ? p.skillStream : null;
    buckets.get(key).push(p);
  });

  const teams = Array.from({ length: count }, () => []);
  STREAM_ORDER.forEach((key) => {
    shuffle(buckets.get(key)).forEach((p) => {
      const minLen = Math.min(...teams.map((t) => t.length));
      const smallest = teams.map((t, i) => i).filter((i) => teams[i].length === minLen);
      const idx = smallest[Math.floor(Math.random() * smallest.length)];
      teams[idx].push(p);
    });
  });
  return teams;
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

export function renderBalanceTeams(app, gameId) {
  const { players, team } = getState();
  const active = players.filter((p) => p.active);
  const junior = isJuniorAgeGroup(team.ageGroup);
  const game = gameId ? findGame(gameId) : null;

  if (lastGameId !== (gameId || null)) {
    includedIds = defaultIncludedIds(game, active);
    split = null;
    lastGameId = gameId || null;
  }
  // Drop anyone no longer active/present in the roster.
  includedIds = new Set([...includedIds].filter((id) => active.some((p) => p.id === id)));

  const included = active.filter((p) => includedIds.has(p.id));
  const canSplit = included.length >= teamCount * 2;

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Balance Teams</h1>
        <div class="sub">${game
          ? `For ${game.isHome ? 'vs' : '@'} ${escapeHtml(game.opponent)} · ${formatDate(game.date)}`
          : 'Randomly split a squad into fair teams by streaming classification'}</div>
      </div>
    </div>

    ${game ? `<a class="btn ghost sm" href="#/game/${game.id}" style="margin-bottom:12px; display:inline-flex;">← Back to game</a>` : ''}

    <div class="banner info">
      ${game
        ? `Starting from ${includedFromLabel(game, active)} for this match — untick anyone who won't be involved before you split.`
        : ''}
      ${junior
        ? ' Junior squads (U9 and under) often split a training group into several small teams for parallel mini-soccer games rather than one team with subs. Choose how many teams below — each streaming classification is divided as evenly as possible across all of them.'
        : " Pick who's involved, then split. Each streaming classification is divided as evenly as possible between the teams — not just the head count."}
    </div>

    <div class="section-title" style="margin-top:0;">Number of teams</div>
    <div class="tabs" style="max-width:320px;">
      ${Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => i + MIN_TEAMS).map((n) => `
        <div class="tab ${n === teamCount ? 'active' : ''}" data-team-count="${n}">${n} teams</div>
      `).join('')}
    </div>

    <div class="section-title">Squad (${included.length}/${active.length})</div>
    <div class="card">
      <div class="spread" style="margin-bottom:10px;">
        <button class="btn ghost sm" data-action="select-all">Select All</button>
        <button class="btn ghost sm" data-action="select-none">Select None</button>
      </div>
      <div class="chip-list">
        ${active.length ? active.map((p) => squadChipHtml(p, includedIds.has(p.id))).join('') : '<span class="muted small">No active players on the roster.</span>'}
      </div>
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
      ${teamsHtml(split)}
    ` : ''}
  `;

  app.querySelector('[data-action="select-all"]').addEventListener('click', () => {
    includedIds = new Set(active.map((p) => p.id));
    renderBalanceTeams(app, gameId);
  });
  app.querySelector('[data-action="select-none"]').addEventListener('click', () => {
    includedIds = new Set();
    split = null;
    renderBalanceTeams(app, gameId);
  });

  app.querySelectorAll('[data-team-count]').forEach((el) => {
    el.addEventListener('click', () => {
      teamCount = Number(el.dataset.teamCount);
      split = null;
      renderBalanceTeams(app, gameId);
    });
  });

  app.querySelectorAll('[data-squad-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.squadToggle;
      if (includedIds.has(id)) includedIds.delete(id);
      else includedIds.add(id);
      split = null;
      renderBalanceTeams(app, gameId);
    });
  });

  const splitBtn = app.querySelector('[data-action="split"]');
  if (splitBtn) {
    splitBtn.addEventListener('click', () => {
      split = splitBalancedTeams(active.filter((p) => includedIds.has(p.id)), teamCount);
      renderBalanceTeams(app, gameId);
    });
  }

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
}

function squadChipHtml(p, isIncluded) {
  return `
    <button type="button" class="bench-chip ${isIncluded ? 'picking' : ''}" data-squad-toggle="${p.id}">
      <span class="jersey">${p.jerseyNumber ?? '-'}</span>
      ${escapeHtml(p.name)} ${streamBadgeHtml(p.skillStream)}
    </button>
  `;
}

function teamsHtml(teams) {
  return `
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
      ${teams.map((team, i) => teamCardHtml(`Team ${i + 1}`, team)).join('')}
    </div>
  `;
}

function teamCardHtml(label, team) {
  const counts = streamCounts(team);
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
          </div>
        `).join('') : '<span class="muted small">No one on this team.</span>'}
      </div>
    </div>
  `;
}
