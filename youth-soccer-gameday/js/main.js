import { initErrorLogging } from './errorLog.js';
import { getState, update, updateSilently, notifyListeners, subscribe } from './store.js';
import { isSubDue, matchEligiblePlayers } from './util.js';
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
import { renderTraining, renderTrainingDetail, advanceTrainingLive, patchLiveTimerClock } from './views/training.js';
import { renderDrillLibrary } from './views/drills.js';

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
  { match: (p) => p[0] === 'schedule' || p[0] === 'game', path: '#/schedule', label: 'Matchday', icon: '⚽' },
  { match: (p) => p[0] === 'stats', path: '#/stats', label: 'Stats', icon: '📊' },
  { match: (p) => p[0] === 'training' || p[0] === 'drills', path: '#/training', label: 'Training', icon: '🏃' },
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
  else if (parts[0] === 'training') {
    result = parts[1] ? renderTrainingDetail(app, parts[1], parts[2] || 'attendance') : renderTraining(app);
  }
  else if (parts[0] === 'drills') result = renderDrillLibrary(app);
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
  if (liveGame) {
    update((state) => {
      const g = state.games.find((x) => x.id === liveGame.id);
      if (!g || !g.live || !g.live.running) return;
      // elapsedSeconds and playingTime are already caught up by update()'s
      // own syncRunningClocks (store.js), which recomputes them from a
      // real timestamp rather than counting ticks — this tick's own job
      // is just the sub-due alert check below.
      const gk = g.live.gkByPeriod[g.live.currentPeriod];

      const presentIds = new Set(g.presentIds || []);
      const sentOffIds = new Set(g.live.sentOff || []);
      const benchIds = matchEligiblePlayers(state.players)
        .filter((p) => presentIds.has(p.id) && !sentOffIds.has(p.id)
          && !g.live.onField.includes(p.id) && p.id !== gk)
        .map((p) => p.id);
      const due = isSubDue(state.team, g.live, benchIds, g.live.onField);
      if (due && !subDueByGameId[g.id] && state.team.subAlertsEnabled !== false) {
        playSubDueAlert();
      }
      subDueByGameId[g.id] = due;
    });
  }

  // Same one-second ticker also drives any live training session's timer
  // (see training.js), independently of whether a match happens to be live
  // too — so it keeps counting down even while the coach is looking at a
  // different screen. This mutates silently (no full re-render) on an
  // ordinary tick: re-rendering the whole page every single second was
  // tearing down and rebuilding the live timer's buttons out from under a
  // tap on a phone often enough that "View Drill" (and Pause/Skip) could
  // simply fail to register. patchLiveTimerClock updates just the
  // countdown text directly when the timer is the thing on screen;
  // crossing into a new block (or the whole plan finishing) is a real
  // content change, so that case still gets a full render.
  const liveTraining = getState().trainings.find((t) => t.live && t.live.running);
  if (liveTraining) {
    let enteredNewBlock = false;
    let justFinished = false;
    updateSilently((state) => {
      const t = state.trainings.find((x) => x.id === liveTraining.id);
      if (!t) return;
      enteredNewBlock = advanceTrainingLive(t);
      justFinished = !t.live.running;
    });
    if (enteredNewBlock) playSubDueAlert();
    if (enteredNewBlock || justFinished) {
      notifyListeners();
    } else {
      const freshTraining = getState().trainings.find((t) => t.id === liveTraining.id);
      patchLiveTimerClock(freshTraining);
    }
  }
}, 1000);
