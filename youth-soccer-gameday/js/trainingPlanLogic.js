// Pure timeline/rotation math for a training session's plan (js/views/
// training.js) — no DOM, no store access, no rendering. A rotation block
// runs the same activities as a normal grouped block, but instead of
// every group staying at its own activity for the whole block, groups
// rotate through every station in turn; everything here is about turning
// that idea (blocks, groups, stations, elapsed seconds) into "what's
// happening right now" and "how long does the whole plan take".

export function addMinutesToTime(hhmm, minutes) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// Stations are their own list (block.stations), independent of how many
// groups there are — a group is just whichever index the round-robin
// formula in rotationAssignment (training.js) points it at each leg.
// That's what lets fewer stations than groups happen at all: with 4
// groups and 3 stations, two groups always land on the same station
// index together, i.e. they run that rotation side by side. A rotate
// block saved before stations were their own list derived them from
// groupActivities instead — store.js's migrateTrainings() upgrades that
// on the way into state, so every block this reads already has a real
// stations array by the time it gets here.
export function resolveStations(block) {
  return block.stations || [];
}

// How many rotations (legs) actually run. An explicit, coach-set count
// when given — e.g. 4 groups sharing 3 stations might still only run 3
// rotations rather than continuing to cycle — otherwise one rotation per
// station, so everyone visits every station exactly once by default.
export function resolveRotationCount(block, groups) {
  const stations = resolveStations(block);
  const explicit = Number(block.rotationCount);
  return Math.max(1, explicit > 0 ? explicit : (stations.length || groups.length || 1));
}

export function blockEffectiveMinutes(block, groups) {
  if (block.mode === 'grouped' && block.rotate) {
    return (block.minutes || 0) * resolveRotationCount(block, groups);
  }
  return block.minutes || 0;
}

// Lays the plan out on a single timeline in seconds — each entry's
// start/end is where that block sits in the overall session once rotation
// blocks are expanded to their full (minutes × stations) length. The live
// timer derives "what's happening right now" purely from elapsed seconds
// against this timeline, rather than tracking a separate block pointer, so
// skipping/rewinding is just moving a number.
export function planTimeline(training) {
  const groups = training.groups || [];
  let cursor = 0;
  return (training.blocks || []).map((block) => {
    const effectiveSeconds = blockEffectiveMinutes(block, groups) * 60;
    const start = cursor;
    cursor += effectiveSeconds;
    return { block, startSeconds: start, endSeconds: cursor, effectiveSeconds };
  });
}

// Takes an already-computed timeline (not the training object) so callers
// that also need the array itself — for indexOf, length, etc. — get back
// an entry that's actually === one of its own elements, rather than a
// fresh object from a second, separate planTimeline() call.
export function currentTimelineEntry(timeline, elapsedSeconds) {
  if (!timeline.length) return null;
  return timeline.find((e) => elapsedSeconds < e.endSeconds) || timeline[timeline.length - 1];
}

// Within a rotation block, which "leg" (0-indexed rotation) is current and
// how much of it remains.
export function rotationLegInfo(block, groups, secondsIntoBlock) {
  const totalLegs = resolveRotationCount(block, groups);
  const legSeconds = Math.max(1, block.minutes || 1) * 60;
  const legIndex = Math.min(totalLegs - 1, Math.floor(secondsIntoBlock / legSeconds));
  const secondsIntoLeg = secondsIntoBlock - legIndex * legSeconds;
  return { legIndex, totalLegs, secondsIntoLeg, legSeconds };
}

// Ticks a live session forward by one second (called from main.js's global
// per-second ticker, same pattern as a live match's clock). Returns true
// exactly when this tick crosses into a new block, so the caller can fire
// an attention chime — never on the tick that finishes the whole plan,
// since there's nothing left to alert about.
export function advanceTrainingLive(training) {
  if (!training.live || !training.live.running) return false;
  const timeline = planTimeline(training);
  const total = timeline.length ? timeline[timeline.length - 1].endSeconds : 0;
  const before = currentTimelineEntry(timeline, training.live.elapsedSeconds);
  training.live.elapsedSeconds += 1;
  if (training.live.elapsedSeconds >= total) {
    training.live.running = false;
    training.live.elapsedSeconds = total;
    return false;
  }
  const after = currentTimelineEntry(timeline, training.live.elapsedSeconds);
  return !!(before && after && before.block.id !== after.block.id);
}
