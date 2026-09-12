import { seedTeam, seedPlayers, seedGames, seedRules, emptyTeam } from './seed.js';

const STORAGE_KEY = 'ysg-data-v2';

let state = null;
const listeners = new Set();

// The "Thunder FC" demo squad — only loaded on request (Reload Sample Data).
function sampleData() {
  const team = seedTeam();
  const players = seedPlayers();
  team.rules = seedRules(players);
  const games = seedGames(players, team.squadFormat);
  return { team, players, games };
}

// A genuinely blank slate — what a coach sees the first time they open the
// app, and what "Clear All Data" resets to.
function emptyData() {
  return { team: emptyTeam(), players: [], games: [] };
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn('localStorage unavailable', e);
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.team && Array.isArray(parsed.players) && Array.isArray(parsed.games)) {
        return parsed;
      }
    } catch (e) {
      console.warn('Corrupt saved data, reseeding.', e);
    }
  }
  return emptyData();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save to localStorage', e);
  }
}

export function getState() {
  if (!state) state = load();
  return state;
}

export function update(mutator) {
  mutator(getState());
  persist();
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetToSample() {
  state = sampleData();
  persist();
  listeners.forEach((fn) => fn(state));
}

export function clearAllData() {
  state = emptyData();
  persist();
  listeners.forEach((fn) => fn(state));
}

export function findPlayer(id) {
  return getState().players.find((p) => p.id === id) || null;
}

export function findGame(id) {
  return getState().games.find((g) => g.id === id) || null;
}
