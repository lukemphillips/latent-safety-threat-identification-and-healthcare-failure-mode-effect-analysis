import { uid, todayIso } from './util.js';
import { emptyLineupSlots } from './formations.js';

export function seedTeam() {
  return {
    name: 'Thunder FC',
    ageGroup: 'U10',
    squadFormat: 7,
    periodMinutes: 25,
    numPeriods: 2,
  };
}

const NAMES = [
  ['Ava Martinez', 'DEF'], ['Liam Chen', 'GK'], ['Noah Patel', 'MID'],
  ['Mia Johnson', 'FWD'], ['Ethan Wright', 'DEF'], ['Sofia Rossi', 'MID'],
  ['Lucas Kim', 'FWD'], ['Zoe Nguyen', 'DEF'], ['Oliver Brooks', 'MID'],
  ['Isla Thompson', 'FWD'], ['Jack Ramirez', 'GK'], ['Emma Davies', 'DEF'],
];

export function seedPlayers() {
  return NAMES.map(([name, position], i) => ({
    id: uid(),
    name,
    jerseyNumber: i + 1,
    position,
    guardianName: '',
    guardianPhone: '',
    active: true,
  }));
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function seedGames(players = [], squadFormat = 7) {
  const today = todayIso();
  const ids = players.map((p) => p.id);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || '';
  const rsvpFor = (list, val) => {
    const r = {};
    list.forEach((id) => { r[id] = val; });
    return r;
  };

  return [
    {
      id: uid(),
      opponent: 'Riverside Rovers',
      date: addDays(today, 5),
      time: '10:00',
      location: 'Central Park Field 3',
      isHome: true,
      status: 'scheduled',
      rsvps: rsvpFor(ids, 'pending'),
      lineup: { slots: emptyLineupSlots(squadFormat) },
      live: null,
      notes: '',
    },
    {
      id: uid(),
      opponent: 'Eastside United',
      date: addDays(today, -6),
      time: '09:30',
      location: 'Eastside Sports Complex',
      isHome: false,
      status: 'completed',
      rsvps: rsvpFor(ids, 'yes'),
      lineup: { slots: emptyLineupSlots(squadFormat) },
      live: {
        running: false,
        elapsedSeconds: 3000,
        scoreUs: 3,
        scoreThem: 2,
        onField: ids.slice(0, squadFormat),
        playingTime: Object.fromEntries(ids.map((id, i) => [id, i % 3 === 0 ? 1800 : 2100])),
        subLog: ids.slice(squadFormat).flatMap((inId, i) => ([
          { atSeconds: 900 + i * 400, type: 'out', playerId: ids[i], name: nameOf(ids[i]) },
          { atSeconds: 900 + i * 400, type: 'in', playerId: inId, name: nameOf(inId) },
        ])),
        startedAt: null,
      },
      notes: 'Great team effort, tough second half.',
    },
  ];
}
