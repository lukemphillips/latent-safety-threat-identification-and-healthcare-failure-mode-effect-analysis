import { getState } from '../store.js';
import { escapeHtml, streamBadgeHtml, formatPositions } from '../util.js';

const STREAM_ORDER = ['A', 'B', 'C', 'D', null];

let includedIds = null;
let split = null;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function splitBalancedTeams(players) {
  const buckets = new Map(STREAM_ORDER.map((s) => [s, []]));
  players.forEach((p) => {
    const key = STREAM_ORDER.includes(p.skillStream) ? p.skillStream : null;
    buckets.get(key).push(p);
  });

  const team1 = [];
  const team2 = [];
  STREAM_ORDER.forEach((key) => {
    shuffle(buckets.get(key)).forEach((p) => {
      if (team1.length < team2.length) team1.push(p);
      else if (team2.length < team1.length) team2.push(p);
      else (Math.random() < 0.5 ? team1 : team2).push(p);
    });
  });
  return { team1, team2 };
}

function streamCounts(team) {
  const counts = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  team.forEach((p) => {
    counts[p.skillStream && counts[p.skillStream] !== undefined ? p.skillStream : 'none'] += 1;
  });
  return counts;
}

export function renderBalanceTeams(app) {
  const { players } = getState();
  const active = players.filter((p) => p.active);

  if (!includedIds) includedIds = new Set(active.map((p) => p.id));
  // Drop anyone no longer active/present in the roster.
  includedIds = new Set([...includedIds].filter((id) => active.some((p) => p.id === id)));

  const included = active.filter((p) => includedIds.has(p.id));

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Balance Teams</h1>
        <div class="sub">Randomly split a squad into two fair teams by streaming classification</div>
      </div>
    </div>

    <div class="banner info">Pick who's involved, then split. Each streaming classification is divided as evenly as possible between the two teams — not just the head count.</div>

    <div class="section-title" style="margin-top:0;">Squad (${included.length}/${active.length})</div>
    <div class="card">
      <div class="spread" style="margin-bottom:10px;">
        <button class="btn ghost sm" data-action="select-all">Select All</button>
        <button class="btn ghost sm" data-action="select-none">Select None</button>
      </div>
      <div class="chip-list">
        ${active.length ? active.map((p) => squadChipHtml(p, includedIds.has(p.id))).join('') : '<span class="muted small">No active players on the roster.</span>'}
      </div>
    </div>

    <button class="btn big block" data-action="split" style="margin:16px 0;" ${included.length < 2 ? 'disabled' : ''}>🎲 ${split ? 'Shuffle Again' : 'Random Split'}</button>

    ${split ? teamsHtml(split) : ''}
  `;

  app.querySelector('[data-action="select-all"]').addEventListener('click', () => {
    includedIds = new Set(active.map((p) => p.id));
    renderBalanceTeams(app);
  });
  app.querySelector('[data-action="select-none"]').addEventListener('click', () => {
    includedIds = new Set();
    split = null;
    renderBalanceTeams(app);
  });

  app.querySelectorAll('[data-squad-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.squadToggle;
      if (includedIds.has(id)) includedIds.delete(id);
      else includedIds.add(id);
      split = null;
      renderBalanceTeams(app);
    });
  });

  const splitBtn = app.querySelector('[data-action="split"]');
  if (splitBtn) {
    splitBtn.addEventListener('click', () => {
      split = splitBalancedTeams(active.filter((p) => includedIds.has(p.id)));
      renderBalanceTeams(app);
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

function teamsHtml({ team1, team2 }) {
  return `
    <div class="section-title">Teams</div>
    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
      ${teamCardHtml('Team 1', team1)}
      ${teamCardHtml('Team 2', team2)}
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
