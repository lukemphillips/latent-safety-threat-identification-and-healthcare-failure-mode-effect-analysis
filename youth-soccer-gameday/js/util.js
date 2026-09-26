export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Monday-anchored week start for a given ISO date, as an ISO date string —
// used to group games into "match weeks" for the Player of the Week award,
// so a Saturday and Sunday fixture the same weekend land in the same week.
export function startOfWeekIso(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function weekLabel(weekStartIso) {
  return `Week of ${formatDate(weekStartIso)}`;
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function sortByDateTime(games) {
  return [...games].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

// Fisher-Yates, returning a new array — shared by Balance Teams and
// Training's random-split features so "shuffle before splitting" behaves
// identically everywhere it's used.
export function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

// numPeriods is the resolved value for a specific game — game.numPeriods
// if that game overrode the team default, else the team's own numPeriods.
export function periodLabel(numPeriods, n) {
  if (numPeriods === 2) return n === 1 ? '1st Half' : '2nd Half';
  if (numPeriods === 4) return `${ORDINALS[n - 1] || n + 'th'} Quarter`;
  return `Period ${n}`;
}

export function gameNumPeriods(game, team) {
  return game.numPeriods ?? team.numPeriods;
}

export function gamePeriodMinutes(game, team) {
  return game.periodMinutes ?? team.periodMinutes;
}

// squadFormat is the resolved value for a specific game — game.squadFormat
// if that game overrode the team default (e.g. a friendly played 5-a-side
// while the team's usual league format is 7-a-side), else the team's own.
export function gameSquadFormat(game, team) {
  return game.squadFormat ?? team.squadFormat;
}

export function formatPercent(fraction) {
  if (!Number.isFinite(fraction)) return '—';
  return `${Math.round(fraction * 100)}%`;
}

export function formatMinutes(totalSeconds) {
  return `${Math.round((totalSeconds || 0) / 60)}′`;
}

const MATCH_TYPE_LABELS = { league: 'League', friendly: 'Friendly', tournament: 'Tournament' };

export function matchTypeLabel(type) {
  return MATCH_TYPE_LABELS[type] || 'League';
}

export function matchTypeBadgeHtml(game) {
  const type = game.matchType || 'league';
  return `<span class="badge ${type}">${matchTypeLabel(type)}</span>`;
}

// Tries the Clipboard API; falls back to a manual-select textarea (calling
// onFallback) when it's unavailable or denied — e.g. non-HTTPS contexts,
// some in-app browsers, or a viewer who hasn't granted permission.
export async function copyToClipboard(text, { onSuccess, onFallback } = {}) {
  try {
    await navigator.clipboard.writeText(text);
    if (onSuccess) onSuccess();
  } catch {
    if (onFallback) onFallback();
  }
}

// Best-effort: triggers a browser download of `text` as a named file —
// used for the automatic post-match backup (see liveGame.js) and the
// Roster import CSV template. Works on a normal page, but a sandboxed
// embedding (like the Claude Artifact viewer) blocks a page from starting
// its own downloads, so this silently does nothing there — callers that
// need to know (e.g. to show a fallback) can check the boolean it
// returns. The automatic localStorage snapshot (store.js) and the manual
// Backup button in Settings are the mechanisms guaranteed to work for a
// backup in that context; this is a bonus when it's not blocked, not the
// only safety net.
export function tryDownloadFile(filename, text, mimeType = 'application/json') {
  try {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    console.warn('File download not available here', e);
    return false;
  }
}

// Resizes an uploaded image (a club logo) down to fit within maxDim x
// maxDim, preserving aspect ratio, and returns it as a PNG data URL — a
// photo taken straight off a phone can be several MB, which would bloat
// localStorage badly for what's only ever shown as a small header badge.
export function resizeImageFile(file, maxDim = 160, { mimeType = 'image/png', quality } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image file."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(mimeType, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Human-readable file size for showing an attachment's footprint before a
// coach commits to saving it — everything here lives in localStorage, which
// has much less headroom than a normal file system.
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function streamBadgeHtml(stream) {
  if (!stream) return '<span class="badge stream-none">Unclassified</span>';
  return `<span class="badge stream-${stream.toLowerCase()}">Stream ${stream}</span>`;
}

// Shared skill-classification order for sorting and for splitting players
// into balanced groups — unclassified always sorts/groups last.
export const STREAM_ORDER = ['A', 'B', 'C', 'D', null];

function streamSortIndex(stream) {
  return STREAM_ORDER.indexOf(STREAM_ORDER.includes(stream) ? stream : null);
}

// Compares two players by name, stream, or team allocation — shared by the
// Roster and Balance Teams sortable columns so both sort identically.
// Ties always fall back to name. Team allocation compares numeric-aware,
// so "9.4" sorts before "9.5" and "10.1" rather than lexicographically.
export function comparePlayersBy(key, a, b) {
  if (key === 'stream') {
    return (streamSortIndex(a.skillStream) - streamSortIndex(b.skillStream)) || a.name.localeCompare(b.name);
  }
  if (key === 'teamAllocation') {
    return (a.teamAllocation || '').localeCompare(b.teamAllocation || '', undefined, { numeric: true }) || a.name.localeCompare(b.name);
  }
  return a.name.localeCompare(b.name);
}

// Every distinct team-allocation value actually in use, numeric-aware (so
// "9.4" comes before "9.5" and "10.1") — shared by Roster and Balance
// Teams' filter chips, so neither ever offers a chip nothing is set to.
export function usedTeamAllocationsInOrder(players) {
  const used = new Set();
  players.forEach((p) => { if (p.teamAllocation) used.add(p.teamAllocation); });
  return [...used].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// A player saved before multi-position support existed had a single
// `position` string rather than this `positions` array — store.js's
// migratePlayers() upgrades that on the way into state, so every player
// this reads has the array by the time it gets here.
export function playerPositions(p) {
  return Array.isArray(p.positions) ? p.positions : [];
}

export function formatPositions(p) {
  return playerPositions(p).join('/');
}

// The roster of players eligible for real fixtures — active players minus
// any guests. Guests (visiting from another team for a joint training
// session) are meant to show up in Training's Attendance, Groups, and
// small-sided Matches tabs, but never in Matchday/RSVP, a game's Squad or
// Lineup, Live Game, the squad-rule editor, Balance Teams, or Stats, since
// they're never actually part of this team's real matches. Everywhere
// training-related keeps using a plain `p.active` filter instead.
export function matchEligiblePlayers(players) {
  return players.filter((p) => p.active && !p.isGuest);
}

// Same "is a substitution worth suggesting right now" rule the live view's
// fair-play banner shows, but as a plain boolean over ids/seconds — shared
// so the global sub-due alert (main.js) and the banner (liveGame.js) never
// drift apart on what counts as "due".
export function isSubDue(team, live, benchIds, onFieldOutfieldIds) {
  if (!team.equalPlayingTimePolicy) return false;
  if (!benchIds.length || !onFieldOutfieldIds.length) return false;

  const minStintSeconds = (team.minStintMinutes ?? 4) * 60;
  const stintOf = (id) => Math.max(0, live.elapsedSeconds - ((live.stintStart || {})[id] ?? 0));
  const restEligible = onFieldOutfieldIds.filter((id) => stintOf(id) >= minStintSeconds);
  if (!restEligible.length) return false;

  const timeOf = (id) => live.playingTime[id] || 0;
  const leastBenchTime = Math.min(...benchIds.map(timeOf));
  const mostFieldTime = Math.max(...restEligible.map(timeOf));
  return (mostFieldTime - leastBenchTime) > 60;
}

// Given a specific outgoing player, chooses the best incoming candidate
// from the still-available bench pool: a same-skill-stream match ("like
// for like") where the bench has one, falling back to whoever's rested
// longest otherwise. Removes its pick from `availableBenchIds` so a caller
// matching several swaps in one pass never offers the same player twice.
export function pickIncoming(outId, availableBenchIds, timeOf, streamOf) {
  if (!availableBenchIds.length) return null;
  availableBenchIds.sort((a, b) => timeOf(a) - timeOf(b));
  const outStream = streamOf(outId);
  let idx = 0;
  if (outStream) {
    const sameStreamIdx = availableBenchIds.findIndex((id) => streamOf(id) === outStream);
    if (sameStreamIdx !== -1) idx = sameStreamIdx;
  }
  return availableBenchIds.splice(idx, 1)[0];
}

// Among several on-field players who could equally be named as the one
// due for a rest, prefers one whose skill stream ISN'T already resting on
// the bench — so a suggestion doesn't quietly leave two players from the
// same stream (most visibly, two "A"s) off the pitch together. Best-effort:
// falls back to the most-rested candidate regardless of stream when every
// eligible player would clash with someone already benched.
export function pickOutgoing(restEligibleIds, benchIds, timeOf, streamOf) {
  const benchStreams = new Set(benchIds.map(streamOf).filter(Boolean));
  const sorted = [...restEligibleIds].sort((a, b) => timeOf(b) - timeOf(a));
  const safe = sorted.find((id) => {
    const s = streamOf(id);
    return !(s && benchStreams.has(s));
  });
  return safe ?? sorted[0];
}

// A forward-looking preview of isSubDue(), for a "coming up" bar so a coach
// can give players a heads-up before a swap is actually due (rather than
// only finding out the moment it fires). For each on-field outfield player,
// projects how many seconds until they'd trip the same ">60s ahead of the
// least-rested bench player" threshold isSubDue uses, assuming nobody else
// gets subbed in the meantime — a running estimate, not a promise. Also
// pairs each one with a specific bench player to bring on, preferring a
// same-skill-stream match (see pickIncoming) and never offering the same
// bench player twice across the list.
export function upcomingSubs(team, live, benchIds, onFieldOutfieldIds, count = 3, streamOf = () => null) {
  if (!team.equalPlayingTimePolicy) return [];
  if (!benchIds.length || !onFieldOutfieldIds.length) return [];

  const minStintSeconds = (team.minStintMinutes ?? 4) * 60;
  const stintOf = (id) => Math.max(0, live.elapsedSeconds - ((live.stintStart || {})[id] ?? 0));
  const timeOf = (id) => live.playingTime[id] || 0;
  const leastBenchTime = Math.min(...benchIds.map(timeOf));

  const dueList = onFieldOutfieldIds
    .map((outId) => {
      // Seconds until this player clears the minimum-stint gate...
      const untilEligible = Math.max(0, minStintSeconds - stintOf(outId));
      // ...plus, if the fair-play gap wouldn't yet be past 60s by then,
      // however many more seconds of play (at 1s of gap per 1s on the
      // pitch, since the bench player they'd be compared against isn't
      // gaining any) it'd take to get there.
      const gapAtEligible = (timeOf(outId) - leastBenchTime) + untilEligible;
      const dueInSeconds = untilEligible + Math.max(0, 61 - gapAtEligible);
      return { outId, dueInSeconds };
    })
    .sort((a, b) => a.dueInSeconds - b.dueInSeconds)
    .slice(0, count);

  const available = [...benchIds];
  return dueList.map((entry) => ({ ...entry, inId: pickIncoming(entry.outId, available, timeOf, streamOf) }));
}
