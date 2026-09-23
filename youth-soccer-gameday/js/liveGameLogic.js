// Pure calculations used by the live match view (js/views/liveGame.js) —
// no DOM, no store access, no rendering. Split out so this logic can be
// read and reasoned about (and, if it ever needs it, tested) on its own,
// separate from the ~1500 lines of rendering/event-handling that make up
// the live view itself.
import { remapLineupToFormat } from './formations.js';

// Remaps a formation change made mid-match: same-shaped slots keep their
// player, the goalkeeper's own slot is preserved if the new formation has
// one, and anyone left over from the old formation fills whatever empty
// slots remain — so switching shapes live never silently drops someone
// who was already on the pitch.
export function remapLiveFormation(oldSlots, onFieldIds, gkId, newFormation) {
  const slots = remapLineupToFormat(oldSlots, newFormation);
  const assigned = new Set(Object.values(slots).filter(Boolean));
  const emptySlotIds = newFormation.slots.map((s) => s.id).filter((sid) => !slots[sid]);

  if (gkId && !assigned.has(gkId)) {
    const gkIdx = emptySlotIds.indexOf('gk');
    if (gkIdx !== -1) {
      slots.gk = gkId;
      emptySlotIds.splice(gkIdx, 1);
      assigned.add(gkId);
    }
  }
  onFieldIds.filter((id) => !assigned.has(id)).forEach((id) => {
    const nextSlotId = emptySlotIds.shift();
    if (nextSlotId) slots[nextSlotId] = id;
  });
  return slots;
}

// How long a player has been in their current stint (since their last sub
// on, or since kickoff if they've been on the whole time).
export function stintSeconds(live, playerId) {
  const startedAt = (live.stintStart || {})[playerId] ?? 0;
  return Math.max(0, live.elapsedSeconds - startedAt);
}

// Tallies goals/assists/saves/cards straight out of the match event log —
// the Match Summary card's data source.
export function computeMatchSummary(live) {
  const scorers = new Map();
  const saves = new Map();
  const cards = new Map();
  let openPlaySaves = 0;

  (live.subLog || []).forEach((e) => {
    if (e.type === 'goal-us' && e.scorerId) {
      const rec = scorers.get(e.scorerId) || { name: e.scorerName, goals: 0, assists: 0 };
      rec.goals += 1;
      scorers.set(e.scorerId, rec);
      if (e.assistId) {
        const arec = scorers.get(e.assistId) || { name: e.assistName, goals: 0, assists: 0 };
        arec.assists += 1;
        scorers.set(e.assistId, arec);
      }
    } else if (e.type === 'save') {
      if (e.playerId) {
        const rec = saves.get(e.playerId) || { name: e.name, count: 0 };
        rec.count += 1;
        saves.set(e.playerId, rec);
      } else {
        openPlaySaves += 1;
      }
    } else if (e.type === 'card') {
      const rec = cards.get(e.playerId) || { name: e.name, yellow: 0, red: 0 };
      if (e.cardType === 'red') rec.red += 1; else rec.yellow += 1;
      cards.set(e.playerId, rec);
    }
  });

  return {
    scorers: [...scorers.values()].filter((r) => r.goals || r.assists).sort((a, b) => b.goals - a.goals),
    saves: [...saves.values()].sort((a, b) => b.count - a.count),
    openPlaySaves,
    cards: [...cards.values()],
  };
}

// Finds whichever subLog entries actually put this player into sentOff,
// searching back from the most recent — a straight red is one 'card'
// entry; a second-yellow send-off is that 'send-off' entry plus the
// specific 'card'/yellow entry right before it (not their first, valid
// yellow); an injury/other removal is just its own 'send-off' entry. Used
// by the "Recover" modal to know exactly what to undo.
export function findRemovalReason(subLog, playerId) {
  for (let i = subLog.length - 1; i >= 0; i--) {
    const e = subLog[i];
    if (e.playerId !== playerId) continue;
    if (e.type === 'card' && e.cardType === 'red') return { reason: 'red card', indexes: [i] };
    if (e.type === 'send-off' && e.reason === 'second yellow') {
      // The specific yellow that triggered this: the *last* yellow logged
      // for this player before this send-off, found by scanning backward.
      let secondYellowIdx = -1;
      for (let k = i - 1; k >= 0; k--) {
        if (subLog[k].type === 'card' && subLog[k].cardType === 'yellow' && subLog[k].playerId === playerId) { secondYellowIdx = k; break; }
      }
      return { reason: 'second yellow card', indexes: secondYellowIdx !== -1 ? [secondYellowIdx, i] : [i] };
    }
    if (e.type === 'send-off') return { reason: e.reason === 'injury' ? 'injury' : 'other reason', indexes: [i] };
  }
  return { reason: 'unknown reason', indexes: [] };
}
