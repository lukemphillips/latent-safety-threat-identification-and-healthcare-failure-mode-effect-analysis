// Reference formats from the FAI Player Development Plan, the framework
// DDSL (and most Irish schoolboy/schoolgirl leagues) build their own rules
// on. Ireland's egress policy for this app's build session blocked direct
// access to ddsl.ie, so this is sourced from the FAI plan and public
// reporting about DDSL rather than the current DDSL rule book directly —
// always confirm against your league's own rules before relying on it.
export const AGE_FORMATS = [
  {
    minAge: 7, maxAge: 7, label: 'U7',
    squadFormat: null, periodMinutes: 10, numPeriods: 4, pitch: '30–35m x 20m',
    notes: 'FAI format is 4v4 with no goalkeeper. This app always includes a keeper, so there’s no exact match — 5-a-side is the closest fit if you need to track it here.',
  },
  {
    minAge: 8, maxAge: 9, label: 'U8–U9',
    squadFormat: 5, periodMinutes: 12, numPeriods: 4, pitch: '40–45m x 25m',
    notes: '',
  },
  {
    minAge: 10, maxAge: 11, label: 'U10–U11',
    squadFormat: 7, periodMinutes: 25, numPeriods: 2, pitch: '60–65m x 35–40m',
    notes: '',
  },
  {
    minAge: 12, maxAge: 12, label: 'U12',
    squadFormat: 9, periodMinutes: 30, numPeriods: 2, pitch: 'Box-to-box',
    notes: 'DDSL has at times run U11/U12 differently from the standard FAI plan — worth double-checking your current age group’s rules with your league.',
  },
  {
    minAge: 13, maxAge: 13, label: 'U13',
    squadFormat: 11, periodMinutes: 30, numPeriods: 2, pitch: 'Full pitch',
    notes: 'Introduces a retreat line. FAI guidance: every player should get a minimum of 15, ideally 30+, minutes.',
  },
  {
    minAge: 14, maxAge: 99, label: 'U14+',
    squadFormat: 11, periodMinutes: 35, numPeriods: 2, pitch: 'Full pitch',
    notes: 'FAI guidance for U14 is minimum 20, ideally 35+, minutes played. Durations for U15 and up vary by league — confirm locally.',
  },
];

export function suggestFormatForAgeGroup(ageGroupText) {
  const match = String(ageGroupText || '').match(/(\d{1,2})/);
  if (!match) return null;
  const age = Number(match[1]);
  return AGE_FORMATS.find((band) => age >= band.minAge && age <= band.maxAge) || null;
}

// U7–U9 play 4v4/5v5 mini-soccer, so a training squad is often split into
// several small teams to play in parallel rather than rotated through subs
// on one team — Balance Teams uses this to steer its default guidance.
export function isJuniorAgeGroup(ageGroupText) {
  const match = String(ageGroupText || '').match(/(\d{1,2})/);
  if (!match) return false;
  return Number(match[1]) <= 9;
}
