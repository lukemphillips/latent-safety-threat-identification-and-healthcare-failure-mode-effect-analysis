import { seedTeam, seedPlayers, seedGames, seedRules, emptyTeam } from './seed.js';
import { uid } from './util.js';

const STORAGE_KEY = 'ysg-data-v2';
// A second, independent key for automatic backups (see saveAutoBackup) —
// kept separate from STORAGE_KEY so a bad edit or accidental Clear All
// Data still has something to recover from, without touching the manual
// Backup/Restore flow in Settings.
const AUTO_BACKUP_KEY = 'ysg-auto-backups-v1';
const AUTO_BACKUP_DISMISS_KEY = 'ysg-auto-backup-dismissed-id';
const MAX_AUTO_BACKUPS = 5;

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

// Restores a previously-copied backup (see Settings > Data). Storage in
// this app is local-only by design, and some browser contexts (private
// windows, a device wiping site data, or a hosting environment's storage
// rules) can clear it out from under a coach with no warning — a manual
// backup/restore is the safety net for that, independent of whatever the
// underlying cause was.
export function restoreFromBackup(data) {
  if (!data || !data.team || !Array.isArray(data.players) || !Array.isArray(data.games)) {
    throw new Error('That doesn\'t look like a Boot Room backup — expected an object with team, players, and games.');
  }
  state = data;
  persist();
  listeners.forEach((fn) => fn(state));
}

const STATUS_RANK = { scheduled: 0, live: 1, completed: 2 };

// A rough "how far along is this" score for picking between two copies of
// the same game id — status first (a finished match always wins over a
// live or scheduled one), then how much has actually been logged, so an
// accidental duplicate id doesn't regress a completed match back to live.
function gameCompleteness(g) {
  return (STATUS_RANK[g.status] ?? 0) * 10000 + (g.live?.subLog?.length || 0);
}

// Combines another device's backup into what's already here, for two
// coaches each running a separate simultaneous match for the same team
// (see Settings > Data) — e.g. two 5-a-side games at once, each tracked on
// its own phone, brought back together afterward via a shared file. Unlike
// restoreFromBackup this never throws away local data: it only adds
// players/games/weekly awards the incoming file has that aren't already
// here, and for a game id that exists on both sides, keeps whichever copy
// is further along. Team-level settings are left exactly as they are
// locally — a merge shouldn't silently change your own device's config.
// Returns a summary of what changed, for the UI to report back.
export function mergeBackup(data) {
  if (!data || !data.team || !Array.isArray(data.players) || !Array.isArray(data.games)) {
    throw new Error('That doesn\'t look like a Boot Room backup — expected an object with team, players, and games.');
  }
  const s = getState();
  let playersAdded = 0, gamesAdded = 0, gamesUpdated = 0, awardsAdded = 0;

  const localPlayerIds = new Set(s.players.map((p) => p.id));
  data.players.forEach((p) => {
    if (!localPlayerIds.has(p.id)) {
      s.players.push(p);
      localPlayerIds.add(p.id);
      playersAdded += 1;
    }
  });

  const localGamesById = new Map(s.games.map((g) => [g.id, g]));
  data.games.forEach((incoming) => {
    const existing = localGamesById.get(incoming.id);
    if (!existing) {
      s.games.push(incoming);
      localGamesById.set(incoming.id, incoming);
      gamesAdded += 1;
    } else if (gameCompleteness(incoming) > gameCompleteness(existing)) {
      const idx = s.games.indexOf(existing);
      s.games[idx] = incoming;
      localGamesById.set(incoming.id, incoming);
      gamesUpdated += 1;
    }
  });

  const incomingAwards = data.team.weeklyAwards || [];
  if (incomingAwards.length) {
    s.team.weeklyAwards = s.team.weeklyAwards || [];
    const localAwardIds = new Set(s.team.weeklyAwards.map((a) => a.id));
    incomingAwards.forEach((a) => {
      if (!localAwardIds.has(a.id)) {
        s.team.weeklyAwards.push(a);
        localAwardIds.add(a.id);
        awardsAdded += 1;
      }
    });
  }

  persist();
  listeners.forEach((fn) => fn(state));
  // A merge combines two coaches' otherwise-separate work into something
  // that doesn't exist anywhere else yet — snapshot it immediately rather
  // than leaving it unprotected until the next match end or a manual
  // Backup Team Data tap.
  if (playersAdded || gamesAdded || gamesUpdated || awardsAdded) saveAutoBackup();
  return { playersAdded, gamesAdded, gamesUpdated, awardsAdded };
}

function loadAutoBackups() {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('Could not read automatic backups', e);
    return [];
  }
}

// Snapshots the full current state (same shape a manual backup uses) into
// a rolling local history, called whenever a match finishes (see
// liveGame.js) so a coach is never more than one completed match away
// from something to recover from. Keeps only the most recent few.
export function saveAutoBackup() {
  if (!state) return;
  try {
    const list = loadAutoBackups();
    list.push({ id: uid(), at: new Date().toISOString(), data: state });
    while (list.length > MAX_AUTO_BACKUPS) list.shift();
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Could not save automatic backup', e);
  }
}

// Most recent first, for listing in Settings.
export function getAutoBackups() {
  return loadAutoBackups().reverse();
}

export function restoreAutoBackupById(id) {
  const entry = loadAutoBackups().find((b) => b.id === id);
  if (!entry) throw new Error('That automatic backup could not be found.');
  restoreFromBackup(entry.data);
}

// Whether the Dashboard's "restore your last backup?" prompt should show:
// there's no team set up yet AND at least one automatic backup exists AND
// the coach hasn't already dismissed this exact one (so choosing to start
// fresh doesn't get nagged at on every reload after).
export function shouldOfferAutoBackupRestore() {
  const s = getState();
  const isEmpty = !s.team?.name && !s.players.length && !s.games.length;
  if (!isEmpty) return false;
  const backups = loadAutoBackups();
  if (!backups.length) return false;
  let dismissedId = null;
  try {
    dismissedId = localStorage.getItem(AUTO_BACKUP_DISMISS_KEY);
  } catch (e) {
    console.warn('Could not read auto-backup dismissal', e);
  }
  return dismissedId !== backups[backups.length - 1].id;
}

export function dismissAutoBackupPrompt() {
  const backups = loadAutoBackups();
  if (!backups.length) return;
  try {
    localStorage.setItem(AUTO_BACKUP_DISMISS_KEY, backups[backups.length - 1].id);
  } catch (e) {
    console.warn('Could not save auto-backup dismissal', e);
  }
}

export function findPlayer(id) {
  return getState().players.find((p) => p.id === id) || null;
}

export function findGame(id) {
  return getState().games.find((g) => g.id === id) || null;
}
