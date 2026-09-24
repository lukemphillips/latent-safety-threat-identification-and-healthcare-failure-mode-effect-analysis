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

// One-time upgrades for data shapes this app used to save before a later
// feature replaced them — applied to every array of players/trainings that
// enters the app (a fresh load, a restored/merged backup, or an incoming
// Cloud Sync payload), so the rest of the codebase can assume the current
// shape everywhere else rather than every reader carrying its own
// fallback. There's no "migration version" to track: each check is cheap
// and a no-op once the data's already current, so it's safe to just run
// on every entry unconditionally.
function migratePlayers(players) {
  return players.map((p) => {
    if ((!Array.isArray(p.positions) || !p.positions.length) && p.position) {
      const { position, ...rest } = p;
      return { ...rest, positions: [position] };
    }
    return p;
  });
}

// A rotation block used to derive its stations from groupActivities at
// render time (one station per group with an activity set) rather than
// storing its own explicit stations array — upgrades any block saved that
// way to have a real `stations` array, matching what saving the block
// through the current form has always produced since.
function migrateTrainings(trainings) {
  return trainings.map((t) => {
    const groups = t.groups || [];
    const blocks = (t.blocks || []).map((b) => {
      if (b.mode !== 'grouped' || !b.rotate || (b.stations && b.stations.length)) return b;
      const stations = groups
        .filter((g) => ((b.groupActivities || {})[g.id] || '').trim())
        .map((g) => ({ id: g.id, activity: (b.groupActivities || {})[g.id], drillId: (b.groupActivityDrillIds || {})[g.id] || null }));
      return stations.length ? { ...b, stations } : b;
    });
    return { ...t, blocks };
  });
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
        parsed.players = migratePlayers(parsed.players);
        parsed.trainings = migrateTrainings(parsed.trainings);
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
  data.players = migratePlayers(data.players);
  data.trainings = migrateTrainings(data.trainings);
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

// Two snapshots of a game that's still scheduled (or otherwise hasn't
// logged anything new) tie at equal completeness — nothing in that score
// distinguishes "an edited kickoff time" from "the exact same game
// untouched". updatedAt (stamped on every pre-match edit — see touchGame
// in gameDetail.js/schedule.js) breaks that tie, so a genuine edit still
// wins even when it hasn't changed the game's status or event log.
function gameIsNewer(incoming, existing) {
  const c1 = gameCompleteness(incoming);
  const c2 = gameCompleteness(existing);
  if (c1 !== c2) return c1 > c2;
  return (incoming.updatedAt || 0) > (existing.updatedAt || 0);
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

  data.players = migratePlayers(data.players);
  data.trainings = migrateTrainings(data.trainings || []);

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
    } else if (gameIsNewer(incoming, existing)) {
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

function playersEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Folds in data just pulled from Cloud Sync (see cloudSync.js) — distinct
// from mergeBackup above because the two have different trust models.
// mergeBackup combines two coaches' separately-run matches and
// deliberately never touches local team settings, since either side could
// be the "right" one. Cloud Sync data only ever reaches the shared sheet
// through a valid Cloud Sync token (the Apps Script itself enforces that —
// see cloudSync.js's buildAppsScript), so once it's here it IS the
// authoritative copy of team settings and the roster.
//
// `lastSyncedPlayers` (this device's own player list as of its last
// successful sync, kept by cloudSync.js) is what makes that adoption safe
// rather than destructive: syncNow() pulls before it pushes, so it can
// reach here moments after a local roster edit that hasn't been pushed
// yet — adopting the cloud's (still-stale) copy of that player wholesale
// would silently erase the edit, and then the push right after would send
// the now-erased data, losing it everywhere. So a player is only adopted
// from the cloud if the local copy still matches what was last synced;
// one that's since diverged locally is kept as-is, and reaches the cloud
// via the push that follows this call. A player added locally but not yet
// pushed (e.g. a late-arrival on a Matchday device) is kept alongside the
// cloud's roster rather than dropped either way. Training sessions and
// drills are NOT part of Cloud Sync at all — each coach's device keeps its
// own, entirely local; the payload from cloudData never even carries them
// (see cloudSync.js's pushToCloud), so there's nothing to merge here.
// Games still use the same "most complete wins" comparison as mergeBackup,
// since whichever device is actually running a live match right now may be
// ahead of what was last pushed.
export function applyCloudSync(cloudData, lastSyncedPlayers) {
  if (!cloudData || !cloudData.team || !Array.isArray(cloudData.players) || !Array.isArray(cloudData.games)) return null;
  const s = getState();
  let gamesAdded = 0, gamesUpdated = 0;

  s.team = cloudData.team;

  cloudData.players = migratePlayers(cloudData.players);
  const localById = new Map(s.players.map((p) => [p.id, p]));
  const lastSyncedById = new Map((lastSyncedPlayers || []).map((p) => [p.id, p]));
  const cloudPlayerIds = new Set(cloudData.players.map((p) => p.id));
  const mergedCloudPlayers = cloudData.players
    // A player this device knew about as of its last sync, but no longer
    // has locally, was deleted here since — the same staleness problem
    // as an unsynced edit above, just the other direction: don't let the
    // cloud's not-yet-caught-up copy resurrect it. The push that follows
    // this call carries the deletion to the cloud for real. A player
    // that's simply new to this device (never in lastSyncedPlayers) isn't
    // touched by this and is adopted normally below.
    .filter((incoming) => !(lastSyncedById.has(incoming.id) && !localById.has(incoming.id)))
    .map((incoming) => {
      const local = localById.get(incoming.id);
      if (!local) return incoming;
      const lastSynced = lastSyncedById.get(incoming.id);
      if (lastSynced && !playersEqual(local, lastSynced)) return local;
      return incoming;
    });
  const localOnlyPlayers = s.players.filter((p) => !cloudPlayerIds.has(p.id));
  s.players = [...mergedCloudPlayers, ...localOnlyPlayers];

  const localGamesById = new Map(s.games.map((g) => [g.id, g]));
  cloudData.games.forEach((incoming) => {
    const existing = localGamesById.get(incoming.id);
    if (!existing) {
      s.games.push(incoming);
      localGamesById.set(incoming.id, incoming);
      gamesAdded += 1;
    } else if (gameIsNewer(incoming, existing)) {
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
//
// Tests against the real STORAGE_KEY itself, not a separate scratch key —
// persist() always *replaces* what's under STORAGE_KEY rather than adding
// to it, so testing via a second key alongside the untouched original would
// need roughly double the space actually required (the existing save, plus
// a full duplicate of the candidate), and could reject a candidate that
// would genuinely have fit once the old save was overwritten. Removing the
// existing entry before testing, and restoring it if the candidate doesn't
// fit, measures the real constraint instead — and if it DOES fit, the data
// is already saved for real, exactly like persist() would have done.
export function hasStorageRoomFor(candidateState) {
  let previousRaw = null;
  try {
    previousRaw = localStorage.getItem(STORAGE_KEY);
    if (previousRaw !== null) localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidateState));
    return true;
  } catch (e) {
    if (previousRaw !== null) {
      try {
        localStorage.setItem(STORAGE_KEY, previousRaw);
      } catch (restoreErr) {
        console.warn('Could not restore saved data after a failed storage-room check', restoreErr);
      }
    }
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
// a rolling local history — called whenever a match finishes (liveGame.js),
// a training session is created/edited or ended (training.js), or a drill
// is created/edited (drills.js) — so a coach is never more than one saved
// checkpoint away from something to recover from. Keeps only the most
// recent few.
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

// Season archiving (Settings > Data): a completed match or a training
// session, older than a coach-chosen cutoff date, can be exported and
// removed from this device — keeping Stats/History and every future auto-
// backup snapshot from growing forever across seasons. Deliberately never
// touches a scheduled or still-live match, or a currently-live training
// session, no matter how old its date is — only things that are actually
// finished are ever eligible, so a wrong cutoff date can't wipe out
// something still in progress or upcoming.
function isArchivableGame(g, cutoffDate) {
  return g.status === 'completed' && g.date < cutoffDate;
}

function isArchivableTraining(t, cutoffDate) {
  return !t.live && t.date < cutoffDate;
}

// Counts only — used to show "this will archive N matches and M sessions"
// before committing to anything.
export function archivableCounts(cutoffDate) {
  const { games, trainings } = getState();
  return {
    games: games.filter((g) => isArchivableGame(g, cutoffDate)).length,
    trainings: trainings.filter((t) => isArchivableTraining(t, cutoffDate)).length,
  };
}

// Read-only: the exact payload the coach should save a copy of before
// archiving — same idea as a manual backup, but scoped to just what's
// about to be removed.
export function buildArchivePayload(cutoffDate) {
  const { games, trainings } = getState();
  return {
    archivedAt: new Date().toISOString(),
    cutoffDate,
    games: games.filter((g) => isArchivableGame(g, cutoffDate)),
    trainings: trainings.filter((t) => isArchivableTraining(t, cutoffDate)),
  };
}

// Actually removes the archived games/trainings from this device. Callers
// are expected to have already gotten the coach a copy via
// buildArchivePayload — this doesn't return one, on purpose, so it can't
// be used as a substitute for actually saving that copy first.
export function removeArchivedData(cutoffDate) {
  const s = getState();
  const gamesBefore = s.games.length;
  const trainingsBefore = s.trainings.length;
  s.games = s.games.filter((g) => !isArchivableGame(g, cutoffDate));
  s.trainings = s.trainings.filter((t) => !isArchivableTraining(t, cutoffDate));
  const removed = {
    games: gamesBefore - s.games.length,
    trainings: trainingsBefore - s.trainings.length,
  };
  persist();
  listeners.forEach((fn) => fn(state));
  return removed;
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
