// Formation templates by squad size (outfield + goalkeeper).
// x/y are percentages on a vertical pitch: y=0 is the attacking (opponent) end,
// y=100 is the defending (own goal) end.
export const FORMATIONS = {
  5: {
    size: 5,
    label: '5-a-side · 1-2-1',
    slots: [
      { id: 'gk', role: 'GK', x: 50, y: 92 },
      { id: 'd1', role: 'DEF', x: 30, y: 68 },
      { id: 'd2', role: 'DEF', x: 70, y: 68 },
      { id: 'm1', role: 'MID', x: 50, y: 45 },
      { id: 'f1', role: 'FWD', x: 50, y: 18 },
    ],
  },
  7: {
    size: 7,
    label: '7-a-side · 2-3-1',
    slots: [
      { id: 'gk', role: 'GK', x: 50, y: 92 },
      { id: 'd1', role: 'DEF', x: 28, y: 70 },
      { id: 'd2', role: 'DEF', x: 72, y: 70 },
      { id: 'm1', role: 'MID', x: 18, y: 45 },
      { id: 'm2', role: 'MID', x: 50, y: 45 },
      { id: 'm3', role: 'MID', x: 82, y: 45 },
      { id: 'f1', role: 'FWD', x: 50, y: 16 },
    ],
  },
  9: {
    size: 9,
    label: '9-a-side · 3-3-2',
    slots: [
      { id: 'gk', role: 'GK', x: 50, y: 92 },
      { id: 'd1', role: 'DEF', x: 18, y: 70 },
      { id: 'd2', role: 'DEF', x: 50, y: 73 },
      { id: 'd3', role: 'DEF', x: 82, y: 70 },
      { id: 'm1', role: 'MID', x: 18, y: 45 },
      { id: 'm2', role: 'MID', x: 50, y: 45 },
      { id: 'm3', role: 'MID', x: 82, y: 45 },
      { id: 'f1', role: 'FWD', x: 34, y: 16 },
      { id: 'f2', role: 'FWD', x: 66, y: 16 },
    ],
  },
  11: {
    size: 11,
    label: '11-a-side · 4-3-3',
    slots: [
      { id: 'gk', role: 'GK', x: 50, y: 93 },
      { id: 'd1', role: 'DEF', x: 14, y: 74 },
      { id: 'd2', role: 'DEF', x: 38, y: 77 },
      { id: 'd3', role: 'DEF', x: 62, y: 77 },
      { id: 'd4', role: 'DEF', x: 86, y: 74 },
      { id: 'm1', role: 'MID', x: 24, y: 48 },
      { id: 'm2', role: 'MID', x: 50, y: 45 },
      { id: 'm3', role: 'MID', x: 76, y: 48 },
      { id: 'f1', role: 'FWD', x: 20, y: 16 },
      { id: 'f2', role: 'FWD', x: 50, y: 12 },
      { id: 'f3', role: 'FWD', x: 80, y: 16 },
    ],
  },
};

export function formationFor(squadFormat) {
  return FORMATIONS[squadFormat] || FORMATIONS[7];
}

export function emptyLineupSlots(squadFormat) {
  const f = formationFor(squadFormat);
  const slots = {};
  f.slots.forEach((s) => { slots[s.id] = null; });
  return slots;
}
