// "Keep at least one on the pitch" pair rules: for each configured pair of
// player ids, they should not both be off the field (bench or absent) at
// the same time. These are advisory only — the coach can always override.

export function violatedRules(team, benchedIdSet, byId) {
  const rules = team.rules || [];
  return rules
    .filter((r) => benchedIdSet.has(r.playerAId) && benchedIdSet.has(r.playerBId))
    .map((r) => ({
      rule: r,
      nameA: byId[r.playerAId]?.name || 'Unknown',
      nameB: byId[r.playerBId]?.name || 'Unknown',
    }));
}
