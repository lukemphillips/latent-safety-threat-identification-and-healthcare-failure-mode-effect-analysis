// Formation templates by squad size (outfield + goalkeeper).
// x/y are percentages on a vertical pitch: y=0 is the attacking (opponent) end,
// y=100 is the defending (own goal) end.
//
// Each squad size offers a few common shapes as default suggestions
// (PRESET_FORMATIONS) — a coach isn't limited to just one. On top of
// those, a team can build its own with buildCustomFormation() (see
// Settings > Formations), which lays out a chosen number of defenders/
// midfielders/forwards evenly rather than needing pixel-perfect
// drag-and-drop placement.
export const PRESET_FORMATIONS = {
  5: [
    {
      id: '5-1-2-1', size: 5, label: '5-a-side · 1-2-1',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 30, y: 68 },
        { id: 'd2', role: 'DEF', x: 70, y: 68 },
        { id: 'm1', role: 'MID', x: 50, y: 45 },
        { id: 'f1', role: 'FWD', x: 50, y: 18 },
      ],
    },
    {
      id: '5-2-1-1', size: 5, label: '5-a-side · 2-1-1',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 30, y: 70 },
        { id: 'd2', role: 'DEF', x: 70, y: 70 },
        { id: 'm1', role: 'MID', x: 50, y: 45 },
        { id: 'f1', role: 'FWD', x: 50, y: 18 },
      ],
    },
    {
      id: '5-1-1-2', size: 5, label: '5-a-side · 1-1-2',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 50, y: 70 },
        { id: 'm1', role: 'MID', x: 50, y: 45 },
        { id: 'f1', role: 'FWD', x: 30, y: 18 },
        { id: 'f2', role: 'FWD', x: 70, y: 18 },
      ],
    },
  ],
  7: [
    {
      id: '7-2-3-1', size: 7, label: '7-a-side · 2-3-1',
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
    {
      id: '7-3-2-1', size: 7, label: '7-a-side · 3-2-1',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 20, y: 72 },
        { id: 'd2', role: 'DEF', x: 50, y: 75 },
        { id: 'd3', role: 'DEF', x: 80, y: 72 },
        { id: 'm1', role: 'MID', x: 30, y: 45 },
        { id: 'm2', role: 'MID', x: 70, y: 45 },
        { id: 'f1', role: 'FWD', x: 50, y: 16 },
      ],
    },
    {
      id: '7-2-2-2', size: 7, label: '7-a-side · 2-2-2',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 30, y: 70 },
        { id: 'd2', role: 'DEF', x: 70, y: 70 },
        { id: 'm1', role: 'MID', x: 30, y: 45 },
        { id: 'm2', role: 'MID', x: 70, y: 45 },
        { id: 'f1', role: 'FWD', x: 30, y: 16 },
        { id: 'f2', role: 'FWD', x: 70, y: 16 },
      ],
    },
  ],
  9: [
    {
      id: '9-3-3-2', size: 9, label: '9-a-side · 3-3-2',
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
    {
      id: '9-3-4-1', size: 9, label: '9-a-side · 3-4-1',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 18, y: 70 },
        { id: 'd2', role: 'DEF', x: 50, y: 73 },
        { id: 'd3', role: 'DEF', x: 82, y: 70 },
        { id: 'm1', role: 'MID', x: 15, y: 45 },
        { id: 'm2', role: 'MID', x: 38, y: 47 },
        { id: 'm3', role: 'MID', x: 62, y: 47 },
        { id: 'm4', role: 'MID', x: 85, y: 45 },
        { id: 'f1', role: 'FWD', x: 50, y: 14 },
      ],
    },
    {
      id: '9-4-3-1', size: 9, label: '9-a-side · 4-3-1',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 92 },
        { id: 'd1', role: 'DEF', x: 14, y: 72 },
        { id: 'd2', role: 'DEF', x: 38, y: 75 },
        { id: 'd3', role: 'DEF', x: 62, y: 75 },
        { id: 'd4', role: 'DEF', x: 86, y: 72 },
        { id: 'm1', role: 'MID', x: 20, y: 47 },
        { id: 'm2', role: 'MID', x: 50, y: 45 },
        { id: 'm3', role: 'MID', x: 80, y: 47 },
        { id: 'f1', role: 'FWD', x: 50, y: 16 },
      ],
    },
  ],
  11: [
    {
      id: '11-4-3-3', size: 11, label: '11-a-side · 4-3-3',
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
    {
      id: '11-4-4-2', size: 11, label: '11-a-side · 4-4-2',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 93 },
        { id: 'd1', role: 'DEF', x: 14, y: 74 },
        { id: 'd2', role: 'DEF', x: 38, y: 77 },
        { id: 'd3', role: 'DEF', x: 62, y: 77 },
        { id: 'd4', role: 'DEF', x: 86, y: 74 },
        { id: 'm1', role: 'MID', x: 16, y: 48 },
        { id: 'm2', role: 'MID', x: 40, y: 50 },
        { id: 'm3', role: 'MID', x: 60, y: 50 },
        { id: 'm4', role: 'MID', x: 84, y: 48 },
        { id: 'f1', role: 'FWD', x: 35, y: 16 },
        { id: 'f2', role: 'FWD', x: 65, y: 16 },
      ],
    },
    {
      id: '11-3-5-2', size: 11, label: '11-a-side · 3-5-2',
      slots: [
        { id: 'gk', role: 'GK', x: 50, y: 93 },
        { id: 'd1', role: 'DEF', x: 20, y: 75 },
        { id: 'd2', role: 'DEF', x: 50, y: 78 },
        { id: 'd3', role: 'DEF', x: 80, y: 75 },
        { id: 'm1', role: 'MID', x: 10, y: 48 },
        { id: 'm2', role: 'MID', x: 30, y: 50 },
        { id: 'm3', role: 'MID', x: 50, y: 45 },
        { id: 'm4', role: 'MID', x: 70, y: 50 },
        { id: 'm5', role: 'MID', x: 90, y: 48 },
        { id: 'f1', role: 'FWD', x: 35, y: 16 },
        { id: 'f2', role: 'FWD', x: 65, y: 16 },
      ],
    },
  ],
};

function slotIdsFor(count, prefix) {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

// Lays defenders/midfielders/forwards out as evenly spaced horizontal
// rows (same visual convention as the presets above) rather than needing
// a drag-and-drop editor — a coach who wants "3 at the back, 4 in
// midfield, 3 up top" just says so with numbers, and gets a usable pitch
// diagram immediately. Not as bespoke as hand-placed coordinates, but a
// perfectly normal way to describe a formation.
function evenRow(count, y, jitter = 0) {
  if (count === 0) return [];
  const margin = 16;
  return Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? 50 : margin + (i * (100 - margin * 2)) / (count - 1);
    const yy = count >= 3 && i % 2 === 1 ? y + jitter : y;
    return { x: Math.round(x), y: Math.round(yy) };
  });
}

function layoutSlots(size, def, mid, fwd) {
  const slots = [{ id: 'gk', role: 'GK', x: 50, y: size >= 11 ? 93 : 92 }];
  evenRow(def, 72, -3).forEach((pos, i) => slots.push({ id: `d${i + 1}`, role: 'DEF', ...pos }));
  evenRow(mid, 47, 3).forEach((pos, i) => slots.push({ id: `m${i + 1}`, role: 'MID', ...pos }));
  evenRow(fwd, 16, -3).forEach((pos, i) => slots.push({ id: `f${i + 1}`, role: 'FWD', ...pos }));
  return slots;
}

export function buildCustomFormation({ id, size, label, def, mid, fwd }) {
  const total = 1 + def + mid + fwd;
  if (total !== size) {
    throw new Error(`A ${size}-a-side formation needs ${size - 1} outfield players (GK + DEF + MID + FWD), got ${def + mid + fwd}.`);
  }
  return { id: id || `custom-${Date.now()}`, size, label, slots: layoutSlots(size, def, mid, fwd), custom: true, def, mid, fwd };
}

// A same-shape sibling of buildCustomFormation, but flagged as a built-in
// default suggestion (no `custom: true`) rather than something the coach
// made — used below to fill out PRESET_FORMATIONS for squad sizes that
// don't have hand-placed coordinates of their own.
function presetFormation(size, def, mid, fwd) {
  return { id: `${size}-${def}-${mid}-${fwd}`, size, label: `${size}-a-side · ${def}-${mid}-${fwd}`, slots: layoutSlots(size, def, mid, fwd) };
}

// Fills out the smaller/larger squad sizes a coach can pick for an
// individual match (see the Format field on the Game form) with a
// couple of sensible default shapes each, generated the same way as a
// coach's own custom formations rather than hand-placed like 5/7/9/11
// above.
PRESET_FORMATIONS[3] = [presetFormation(3, 1, 0, 1), presetFormation(3, 0, 1, 1)];
PRESET_FORMATIONS[4] = [presetFormation(4, 1, 1, 1), presetFormation(4, 1, 0, 2)];
PRESET_FORMATIONS[6] = [presetFormation(6, 2, 2, 1), presetFormation(6, 1, 3, 1)];
PRESET_FORMATIONS[8] = [presetFormation(8, 3, 3, 1), presetFormation(8, 2, 3, 2)];
PRESET_FORMATIONS[10] = [presetFormation(10, 3, 4, 2), presetFormation(10, 4, 4, 1)];

// Every squad size a match can be played at, smallest first — object keys
// that look like plain integers ("3", "11") are always iterated in
// ascending numeric order by JS regardless of insertion order, so this
// doesn't need its own manual sort.
export const SQUAD_FORMAT_SIZES = Object.keys(PRESET_FORMATIONS).map(Number);

// Every formation available for a squad size — the built-in suggestions
// plus whichever ones this team has created of their own, customs listed
// after the presets so "default suggestions" always come first.
export function formationOptionsFor(size, customFormations = []) {
  const presets = PRESET_FORMATIONS[size] || PRESET_FORMATIONS[7];
  return [...presets, ...customFormations.filter((f) => f.size === size)];
}

export function findFormationById(size, formationId, customFormations = []) {
  const options = formationOptionsFor(size, customFormations);
  return options.find((f) => f.id === formationId) || options[0];
}

// formationId is optional everywhere below — omit it and every function
// behaves exactly as it always has (falls back to the size's first
// default suggestion), so existing call sites that only know a squad
// size, not a specific chosen formation, keep working unchanged.
export function formationFor(squadFormat, formationId, customFormations = []) {
  return findFormationById(squadFormat, formationId, customFormations);
}

export function emptyLineupSlots(squadFormatOrFormation, formationId, customFormations = []) {
  const formation = typeof squadFormatOrFormation === 'object'
    ? squadFormatOrFormation
    : formationFor(squadFormatOrFormation, formationId, customFormations);
  const slots = {};
  formation.slots.forEach((s) => { slots[s.id] = null; });
  return slots;
}

// Outfield players only, i.e. the formation minus the goalkeeper slot.
export function outfieldTargetCount(squadFormatOrFormation, formationId, customFormations = []) {
  const formation = typeof squadFormatOrFormation === 'object'
    ? squadFormatOrFormation
    : formationFor(squadFormatOrFormation, formationId, customFormations);
  return formation.slots.filter((s) => s.role !== 'GK').length;
}

// Carries a lineup over to a different formation without losing anyone:
// slot ids that exist in both (e.g. gk, d1, m1) keep their player; anyone
// whose slot doesn't exist in the new one (e.g. m3 when moving from a
// 3-midfielder shape to a 2-midfielder one) simply falls back to the
// bench instead of being silently reset or left stranded in an orphaned
// slot. Accepts either a squad size (old behavior — remaps to that size's
// default formation) or a specific formation object.
export function remapLineupToFormat(oldSlots, squadFormatOrFormation, formationId, customFormations = []) {
  const newSlots = emptyLineupSlots(squadFormatOrFormation, formationId, customFormations);
  Object.keys(newSlots).forEach((slotId) => {
    if (oldSlots && oldSlots[slotId]) newSlots[slotId] = oldSlots[slotId];
  });
  return newSlots;
}
