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

export function streamBadgeHtml(stream) {
  if (!stream) return '<span class="badge stream-none">Unclassified</span>';
  return `<span class="badge stream-${stream.toLowerCase()}">Stream ${stream}</span>`;
}

// Reads the new `positions` array, falling back to an older single
// `position` string for data saved before multi-position support existed.
export function playerPositions(p) {
  if (Array.isArray(p.positions) && p.positions.length) return p.positions;
  if (p.position) return [p.position];
  return [];
}

export function formatPositions(p) {
  return playerPositions(p).join('/');
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
