import { uid } from './util.js';

const STREAM_ORDER = ['A', 'B', 'C', 'D', null];
const STREAM_LABEL = { A: 'A', B: 'B', C: 'C', D: 'D', null: 'Unclassified' };

// Clusters players by skill stream into `targetCount` groups (or one group
// per stream present, if targetCount is omitted/falsy) — the opposite goal
// from Balance Teams' even spread: training groups put similar-ability
// players together so each group can be coached at its own level, rather
// than splitting every stream evenly across every group.
//
// If the target is fewer than the number of streams present, the smallest
// adjacent pair of groups (by combined size) is merged, repeatedly, so
// merges combine neighbouring ability levels (A+B, say) rather than
// jumbling everything together. If the target is more, the largest group
// is split roughly in half, repeatedly, so a single oversized stream can
// still be broken into coachable sub-groups.
//
// `balance`, when true, runs a final pass that evens out group sizes —
// repeatedly moving one player from the current largest group into
// whichever group tied for smallest sits closest to it (in stream order),
// until no group has more than one extra player over any other. This can
// mix a player into a neighbouring stream, trading a little of the
// same-ability clustering for fairer numbers.
export function buildGroupsByStream(players, targetCount = null, balance = false) {
  let buckets = STREAM_ORDER
    .map((stream) => ({ streams: [stream], players: players.filter((p) => (p.skillStream || null) === stream) }))
    .filter((b) => b.players.length);

  if (!buckets.length) return [];

  const target = targetCount && targetCount > 0 ? targetCount : buckets.length;

  while (buckets.length > target) {
    let bestIdx = 0;
    let bestSize = Infinity;
    for (let i = 0; i < buckets.length - 1; i++) {
      const size = buckets[i].players.length + buckets[i + 1].players.length;
      if (size < bestSize) { bestSize = size; bestIdx = i; }
    }
    const merged = {
      streams: [...buckets[bestIdx].streams, ...buckets[bestIdx + 1].streams],
      players: [...buckets[bestIdx].players, ...buckets[bestIdx + 1].players],
    };
    buckets.splice(bestIdx, 2, merged);
  }

  while (buckets.length < target) {
    let bestIdx = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].players.length > buckets[bestIdx].players.length) bestIdx = i;
    }
    const big = buckets[bestIdx];
    if (big.players.length < 2) break; // nothing left worth splitting further
    const mid = Math.ceil(big.players.length / 2);
    buckets.splice(bestIdx, 1,
      { streams: big.streams, players: big.players.slice(0, mid) },
      { streams: big.streams, players: big.players.slice(mid) });
  }

  if (balance) buckets = balanceBucketSizes(buckets);

  const labelOf = (b) => b.streams.map((s) => STREAM_LABEL[s]).join('+');
  const countByLabel = {};
  buckets.forEach((b) => { const l = labelOf(b); countByLabel[l] = (countByLabel[l] || 0) + 1; });
  const seen = {};
  return buckets.map((b) => {
    const label = labelOf(b);
    seen[label] = (seen[label] || 0) + 1;
    const name = countByLabel[label] > 1 ? `${label} (${seen[label]})` : label;
    return { id: uid(), name, playerIds: b.players.map((p) => p.id) };
  });
}

function balanceBucketSizes(buckets) {
  const work = buckets.map((b) => ({ ...b, players: [...b.players] }));
  for (let guard = 0; guard < 1000; guard++) {
    let maxIdx = 0;
    work.forEach((b, i) => { if (b.players.length > work[maxIdx].players.length) maxIdx = i; });
    const minSize = Math.min(...work.map((b) => b.players.length));
    if (work[maxIdx].players.length - minSize <= 1) break;

    let minIdx = -1;
    work.forEach((b, i) => {
      if (b.players.length !== minSize) return;
      if (minIdx === -1 || Math.abs(i - maxIdx) < Math.abs(minIdx - maxIdx)) minIdx = i;
    });
    work[minIdx].players.push(work[maxIdx].players.pop());
  }
  return work;
}
