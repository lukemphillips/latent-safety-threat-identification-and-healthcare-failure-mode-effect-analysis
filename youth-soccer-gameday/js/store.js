import { seedTeam, seedPlayers, seedGames, seedRules, seedTrainings, seedDrills, emptyTeam } from './seed.js';
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
  const trainings = seedTrainings(players);
  const drills = seedDrills();
  return { team, players, games, trainings, drills };
}

// A genuinely blank slate — what a coach sees the first time they open the
// app, and what "Clear All Data" resets to.
function emptyData() {
  return { team: emptyTeam(), players: [], games: [], trainings: [], drills: [] };
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
        // trainings/drills are newer than the rest of the shape — default
        // them in for data saved before they existed, rather than rejecting
        // the save.
        if (!Array.isArray(parsed.trainings)) parsed.trainings = [];
        if (!Array.isArray(parsed.drills)) parsed.drills = [];
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

// A live match's clock used to advance purely by counting +1 ticks from
// main.js's once-a-second setInterval — which mobile browsers throttle or
// fully suspend while the screen is locked or the tab is backgrounded, so
// the whole locked/backgrounded stretch was simply never counted and the
// clock fell behind real time. live.runStartedAt (a real Date.now()
// timestamp) and live.elapsedAtRunStart (the seconds banked before this
// run began) are set once, when the clock is started; every update()
// after that recomputes elapsedSeconds from the actual wall-clock gap
// instead of a tick count, so it always catches up in one jump the moment
// anything touches state again — a ticker firing late, or just the coach
// tapping a button — no matter how long the screen was locked.
function syncRunningClocks(s) {
  const now = Date.now();
  (s.games || []).forEach((g) => {
    if (g.status !== 'live' || !g.live || !g.live.running || !g.live.runStartedAt) return;
    const wallElapsed = (g.live.elapsedAtRunStart || 0) + Math.floor((now - g.live.runStartedAt) / 1000);
    const delta = wallElapsed - g.live.elapsedSeconds;
    if (delta <= 0) return;
    g.live.elapsedSeconds = wallElapsed;
    const gk = g.live.gkByPeriod[g.live.currentPeriod];
    g.live.playingTime = g.live.playingTime || {};
    (g.live.onField || []).forEach((pid) => {
      g.live.playingTime[pid] = (g.live.playingTime[pid] || 0) + delta;
    });
    if (gk) g.live.playingTime[gk] = (g.live.playingTime[gk] || 0) + delta;
  });
}

export function getState() {
  if (!state) state = load();
  return state;
}

export function update(mutator) {
  syncRunningClocks(getState());
  mutator(getState());
  persist();
  listeners.forEach((fn) => fn(state));
}

// Same as update() — mutates state and persists it — but skips notifying
// subscribers, so it doesn't trigger the full-page re-render that
// subscribe(route) normally does. Meant only for the once-a-second
// clock ticks that just bump elapsedSeconds: notifying on every one of
// those tears down and rebuilds whatever's currently on screen every
// single second, which on a phone can cancel a tap that lands right as
// the DOM node it's on gets replaced out from under it (a genuine
// substitution or block change is the one case that still warrants a
// real render — call notifyListeners() for those).
export function updateSilently(mutator) {
  mutator(getState());
  persist();
}

export function notifyListeners() {
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
  // trainings/drills are newer than the rest of the backup shape — default
  // them in for a backup taken before they existed, rather than rejecting it.
  if (!Array.isArray(data.trainings)) data.trainings = [];
  if (!Array.isArray(data.drills)) data.drills = [];
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
  let playersAdded = 0, gamesAdded = 0, gamesUpdated = 0, awardsAdded = 0, trainingsAdded = 0, drillsAdded = 0;

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

  // Training sessions aren't co-edited the way a live match can be (there's
  // no "further along" to compare), so this is a plain union by id: add
  // whatever the incoming side has that isn't already here, and otherwise
  // leave the local copy alone.
  const incomingTrainings = data.trainings || [];
  if (incomingTrainings.length) {
    s.trainings = s.trainings || [];
    const localTrainingIds = new Set(s.trainings.map((t) => t.id));
    incomingTrainings.forEach((t) => {
      if (!localTrainingIds.has(t.id)) {
        s.trainings.push(t);
        localTrainingIds.add(t.id);
        trainingsAdded += 1;
      }
    });
  }

  // Drills are a shared reference library rather than per-match data, but
  // the same "add whatever's missing, never overwrite" union still applies
  // — a coach's own edits to a drill already on this device shouldn't be
  // clobbered by a merge.
  const incomingDrills = data.drills || [];
  if (incomingDrills.length) {
    s.drills = s.drills || [];
    const localDrillIds = new Set(s.drills.map((d) => d.id));
    incomingDrills.forEach((d) => {
      if (!localDrillIds.has(d.id)) {
        s.drills.push(d);
        localDrillIds.add(d.id);
        drillsAdded += 1;
      }
    });
  }

  persist();
  listeners.forEach((fn) => fn(state));
  // A merge combines two coaches' otherwise-separate work into something
  // that doesn't exist anywhere else yet — snapshot it immediately rather
  // than leaving it unprotected until the next match end or a manual
  // Backup Team Data tap.
  if (playersAdded || gamesAdded || gamesUpdated || awardsAdded || trainingsAdded || drillsAdded) saveAutoBackup();
  return { playersAdded, gamesAdded, gamesUpdated, awardsAdded, trainingsAdded, drillsAdded };
}

// Adds whatever entries `incoming` has that aren't already in `local`
// (matched by id), leaving every existing local entry untouched. Used for
// training sessions and the Drill Library, which — unlike team settings or
// the roster — are each coach's own content rather than one shared,
// Full-Edit-owned list: every coach can create their own plans/drills, and
// syncing is purely additive so nobody's device silently loses or
// overwrites what it already has.
function mergeById(local, incoming) {
  const localIds = new Set(local.map((x) => x.id));
  const newOnes = incoming.filter((x) => !localIds.has(x.id));
  return newOnes.length ? [...local, ...newOnes] : local;
}

// Folds in data just pulled from Cloud Sync (see cloudSync.js) — distinct
// from mergeBackup above because the two have different trust models.
// mergeBackup combines two coaches' separately-run matches and
// deliberately never touches local team settings, since either side could
// be the "right" one. Cloud Sync data only ever reaches the shared sheet
// through a valid Cloud Sync token (the Apps Script itself enforces that —
// see cloudSync.js's buildAppsScript), so once it's here it IS the
// authoritative copy of team settings and the roster: they're adopted
// wholesale rather than reconciled field by field. A player added locally
// but not yet pushed (e.g. a late-arrival on a Matchday device) is kept
// alongside the cloud's roster rather than dropped. Training sessions and
// drills are different — every coach contributes their own, so they merge
// additively (mergeById) instead of one side's copy replacing the other's.
// Games still use the same "most complete wins" comparison as mergeBackup,
// since whichever device is actually running a live match right now may be
// ahead of what was last pushed.
export function applyCloudSync(cloudData) {
  if (!cloudData || !cloudData.team || !Array.isArray(cloudData.players) || !Array.isArray(cloudData.games)) return null;
  const s = getState();
  let gamesAdded = 0, gamesUpdated = 0;

  s.team = cloudData.team;
  s.trainings = mergeById(s.trainings || [], cloudData.trainings || []);
  s.drills = mergeById(s.drills || [], cloudData.drills || []);

  const cloudPlayerIds = new Set(cloudData.players.map((p) => p.id));
  const localOnlyPlayers = s.players.filter((p) => !cloudPlayerIds.has(p.id));
  s.players = [...cloudData.players, ...localOnlyPlayers];

  const localGamesById = new Map(s.games.map((g) => [g.id, g]));
  cloudData.games.forEach((incoming) => {
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

  persist();
  listeners.forEach((fn) => fn(state));
  return { gamesAdded, gamesUpdated };
}

// Best-effort check for whether a candidate state would actually fit in
// localStorage before committing to it — used before saving a drill with an
// attachment, since a PDF/image (unlike the rest of this app's data) can be
// large enough to hit the browser's per-origin storage quota on its own.
// Writes to a scratch key rather than trusting JSON.stringify succeeding,
// since stringify can't fail from quota — only the actual write can.
export function hasStorageRoomFor(candidateState) {
  const TEST_KEY = '__ysg_quota_test__';
  try {
    localStorage.setItem(TEST_KEY, JSON.stringify(candidateState));
    localStorage.removeItem(TEST_KEY);
    return true;
  } catch (e) {
    return false;
  }
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

export function findTraining(id) {
  return getState().trainings.find((t) => t.id === id) || null;
}

export function findDrill(id) {
  return getState().drills.find((d) => d.id === id) || null;
}
