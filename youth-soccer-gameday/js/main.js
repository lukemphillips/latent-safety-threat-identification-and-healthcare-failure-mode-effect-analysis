import { getState, subscribe } from './store.js';
import { renderDashboard } from './views/dashboard.js';
import { renderRoster } from './views/roster.js';
import { renderSchedule } from './views/schedule.js';
import { renderGameDetail } from './views/gameDetail.js';
import { renderLiveGame } from './views/liveGame.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');
const navEl = document.getElementById('nav');
const brandNameEl = document.getElementById('brand-team-name');

const NAV_ITEMS = [
  { match: (p) => p.length === 0, path: '#/', label: 'Home', icon: '🏠' },
  { match: (p) => p[0] === 'roster', path: '#/roster', label: 'Roster', icon: '👥' },
  { match: (p) => p[0] === 'schedule' || p[0] === 'game', path: '#/schedule', label: 'Schedule', icon: '📅' },
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
  brandNameEl.textContent = team.name ? `${team.name} · Game Day` : 'Game Day';
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
  else if (parts[0] === 'schedule') result = renderSchedule(app);
  else if (parts[0] === 'settings') result = renderSettings(app);
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
