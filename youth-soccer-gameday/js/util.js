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

export function periodLabel(team, n) {
  if (team.numPeriods === 2) return n === 1 ? '1st Half' : '2nd Half';
  if (team.numPeriods === 4) return `${ORDINALS[n - 1] || n + 'th'} Quarter`;
  return `Period ${n}`;
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

export function streamBadgeHtml(stream) {
  if (!stream) return '<span class="badge stream-none">Unclassified</span>';
  return `<span class="badge stream-${stream.toLowerCase()}">Stream ${stream}</span>`;
}
