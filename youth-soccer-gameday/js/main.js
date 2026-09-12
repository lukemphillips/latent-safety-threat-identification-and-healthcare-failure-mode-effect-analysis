import { initErrorLogging } from './errorLog.js';
import { getState, update, subscribe } from './store.js';
import { isSubDue } from './util.js';
import { playSubDueAlert } from './subAlert.js';
import { renderDashboard } from './views/dashboard.js';
import { renderRoster } from './views/roster.js';
import { renderSchedule } from './views/schedule.js';
import { renderGameDetail } from './views/gameDetail.js';
import { renderLiveGame } from './views/liveGame.js';
import { renderSettings } from './views/settings.js';
import { renderStats } from './views/stats.js';
import { renderBalanceTeams } from './views/balanceTeams.js';
import { renderHelp } from './views/help.js';

initErrorLogging();

const app = document.getElementById('app');
const navEl = document.getElementById('nav');
const brandNameEl = document.getElementById('brand-team-name');
const brandBadgeEl = document.getElementById('brand-badge');
const defaultBadgeHtml = brandBadgeEl.innerHTML;
let brandLogoUrl = null;

const NAV_ITEMS = [
  { match: (p) => p.length === 0, path: '#/', label: 'Home', icon: '🏠' },
  { match: (p) => p[0] === 'roster' || p[0] === 'balance', path: '#/roster', label: 'Roster', icon: '👥' },
  { match: (p) => p[0] === 'schedule' || p[0] === 'game', path: '#/schedule', label: 'Schedule', icon: '📅' },
  { match: (p) => p[0] === 'stats', path: '#/stats', label: 'Stats', icon: '📊' },
  { match: (p) => p[0] === 'settings', path: '#/settings', label: 'Settings', icon: '⚙️' },
];

function currentParts() {
  const hash = location.hash || '#/';
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

function renderNav() {
  const parts = currentParts();
  navEl.innerHTML = NAV_ITEMS.map((item) => {
    const active = item.match(parts);
    return `<a href="${item.path}" class="nav-item ${active ? 'active' : ''}">` +
      `<span class="nav-icon">${item.icon}</span><span>${item.label}</span></a>`;
  }).join('');
}

function renderBrand() {
  const { team } = getState();
  brandNameEl.textContent = team.name ? `${team.name} · Boot Room` : 'Boot Room';

  const logoUrl = team.logoDataUrl || null;
  if (logoUrl !== brandLogoUrl) {
    brandLogoUrl = logoUrl;
    brandBadgeEl.innerHTML = logoUrl
      ? `<img src="${logoUrl}" alt="" style="width:100%; height:100%; object-fit:contain;" />`
      : defaultBadgeHtml;
  }
}

let viewCleanup = null;

function route() {
  if (viewCleanup) {
    viewCleanup();
    viewCleanup = null;
  }

  renderBrand();
  renderNav();
  const parts = currentParts();

  let result;
  if (parts.length === 0) result = renderDashboard(app);
  else if (parts[0] === 'roster') result = renderRoster(app);
  else if (parts[0] === 'balance') result = renderBalanceTeams(app, parts[1] || null);
  else if (parts[0] === 'schedule') result = renderSchedule(app);
  else if (parts[0] === 'stats') result = renderStats(app);
  else if (parts[0] === 'settings') result = renderSettings(app);
  else if (parts[0] === 'help') result = renderHelp(app);
  else if (parts[0] === 'game' && parts[1]) {
    result = parts[2] === 'live'
      ? renderLiveGame(app, parts[1])
      : renderGameDetail(app, parts[1], parts[2] || 'rsvp');
  } else {
    app.innerHTML = '<p class="empty">Page not found.</p>';
  }

  if (typeof result === 'function') viewCleanup = result;
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
subscribe(route);

if (document.readyState !== 'loading') route();

// Ticks any running live match once a second, regardless of which screen is
// showing — so the clock (and playing time) keeps moving while the coach
// steps away to the Squad tab to add a late arrival, check the roster, etc.
//
// Also watches for a substitution newly becoming "due" (same rule as the
// live view's fair-play banner) and fires a vibrate+chime alert — tracked
// per game so it only fires once when the state flips from balanced to
// due, not every second it stays that way.
const subDueByGameId = {};

setInterval(() => {
  const liveGame = getState().games.find((g) => g.status === 'live' && g.live && g.live.running);
  if (!liveGame) return;
  update((state) => {
    const g = state.games.find((x) => x.id === liveGame.id);
    if (!g || !g.live || !g.live.running) return;
    g.live.elapsedSeconds += 1;
    const gk = g.live.gkByPeriod[g.live.currentPeriod];
    g.live.onField.forEach((pid) => {
      g.live.playingTime[pid] = (g.live.playingTime[pid] || 0) + 1;
    });
    if (gk) g.live.playingTime[gk] = (g.live.playingTime[gk] || 0) + 1;

    const presentIds = new Set(g.presentIds || []);
    const sentOffIds = new Set(g.live.sentOff || []);
    const benchIds = state.players
      .filter((p) => p.active && presentIds.has(p.id) && !sentOffIds.has(p.id)
        && !g.live.onField.includes(p.id) && p.id !== gk)
      .map((p) => p.id);
    const due = isSubDue(state.team, g.live, benchIds, g.live.onField);
    if (due && !subDueByGameId[g.id] && state.team.subAlertsEnabled !== false) {
      playSubDueAlert();
    }
    subDueByGameId[g.id] = due;
  });
}, 1000);
