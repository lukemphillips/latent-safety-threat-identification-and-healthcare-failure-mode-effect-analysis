import { seedTeam, seedPlayers, seedGames } from './seed.js';

const STORAGE_KEY = 'ysg-data-v1';

let state = null;
const listeners = new Set();

function freshData() {
  const team = seedTeam();
  const players = seedPlayers();
  const games = seedGames(players, team.squadFormat);
  return { team, players, games };
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
  return freshData();
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
  state = freshData();
  persist();
  listeners.forEach((fn) => fn(state));
}

export function clearAllData() {
  state = { team: seedTeam(), players: [], games: [] };
  persist();
  listeners.forEach((fn) => fn(state));
}

export function findPlayer(id) {
  return getState().players.find((p) => p.id === id) || null;
}

export function findGame(id) {
  return getState().games.find((g) => g.id === id) || null;
}
