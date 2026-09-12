import { uid, todayIso } from './util.js';
import { emptyLineupSlots } from './formations.js';

export function seedTeam() {
  return {
    name: 'Thunder FC',
    ageGroup: 'U10',
    squadFormat: 7,
    periodMinutes: 25,
    numPeriods: 2,
    equalPlayingTimePolicy: true,
    minStintMinutes: 4,
    enableCards: false,
    rules: [],
  };
}

const NAMES = [
  ['Ava Martinez', 'DEF', 'A'], ['Liam Chen', 'GK', 'B'], ['Noah Patel', 'MID', 'C'],
  ['Mia Johnson', 'FWD', 'A'], ['Ethan Wright', 'DEF', 'B'], ['Sofia Rossi', 'MID', 'A'],
  ['Lucas Kim', 'FWD', 'B'], ['Zoe Nguyen', 'DEF', 'C'], ['Oliver Brooks', 'MID', 'D'],
  ['Isla Thompson', 'FWD', 'C'], ['Jack Ramirez', 'GK', 'D'], ['Emma Davies', 'DEF', 'D'],
];

export function seedPlayers() {
  return NAMES.map(([name, position, skillStream], i) => ({
    id: uid(),
    name,
    jerseyNumber: i + 1,
    position,
    skillStream,
    guardianName: '',
    guardianPhone: '',
    active: true,
  }));
}

export function seedRules(players) {
  if (players.length < 12) return [];
  return [{ id: uid(), playerAId: players[0].id, playerBId: players[11].id }];
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

  const [ava, liam, noah, mia, ethan, sofia, lucas, zoe, oliver, isla, jack, emma] = ids;

  const leagueEvent = (atSeconds, type, extra) => ({ atSeconds, type, ...extra });

  return [
    {
      id: uid(),
      opponent: 'Riverside Rovers',
      matchType: 'league',
      tournamentName: '',
      stage: '',
      date: addDays(today, 5),
      time: '10:00',
      location: 'Central Park Field 3',
      isHome: true,
      status: 'scheduled',
      rsvps: rsvpFor(ids, 'pending'),
      presentIds: [],
      captainId: null,
      playerOfMatchId: null,
      lineup: { slots: emptyLineupSlots(squadFormat) },
      live: null,
      notes: '',
    },
    {
      id: uid(),
      opponent: 'Eastside United',
      matchType: 'league',
      tournamentName: '',
      stage: '',
      date: addDays(today, -6),
      time: '09:30',
      location: 'Eastside Sports Complex',
      isHome: false,
      status: 'completed',
      rsvps: rsvpFor(ids, 'yes'),
      presentIds: ids.slice(),
      captainId: ava,
      playerOfMatchId: mia,
      lineup: { slots: { ...emptyLineupSlots(squadFormat), gk: liam, d1: ava, d2: ethan, m1: noah, m2: sofia, m3: oliver, f1: mia } },
      live: {
        running: false,
        currentPeriod: 2,
        elapsedSeconds: 3000,
        scoreUs: 3,
        scoreThem: 2,
        onField: [ava, sofia, lucas, emma, oliver, mia],
        gkByPeriod: { 1: liam, 2: jack },
        sentOff: [],
        playingTime: {
          [ava]: 3000, [liam]: 1500, [noah]: 700, [mia]: 3000, [ethan]: 1600,
          [sofia]: 3000, [lucas]: 2300, [zoe]: 0, [oliver]: 2300, [isla]: 0,
          [jack]: 1500, [emma]: 1400,
        },
        subLog: [
          leagueEvent(60, 'goal-us', { scorerId: mia, scorerName: nameOf(mia), assistId: ava, assistName: nameOf(ava) }),
          leagueEvent(300, 'save', { playerId: liam, name: nameOf(liam) }),
          leagueEvent(500, 'goal-them', {}),
          leagueEvent(700, 'sub', { inId: oliver, inName: nameOf(oliver), outId: noah, outName: nameOf(noah) }),
          leagueEvent(900, 'goal-us', { scorerId: lucas, scorerName: nameOf(lucas), assistId: sofia, assistName: nameOf(sofia) }),
          leagueEvent(1500, 'period-start', { period: 2 }),
          leagueEvent(1500, 'gk-change', { period: 2, inId: jack, inName: nameOf(jack), outId: liam, outName: nameOf(liam) }),
          leagueEvent(1600, 'sub', { inId: emma, inName: nameOf(emma), outId: ethan, outName: nameOf(ethan) }),
          leagueEvent(1800, 'goal-them', {}),
          leagueEvent(2200, 'goal-us', { scorerId: mia, scorerName: nameOf(mia), assistId: oliver, assistName: nameOf(oliver) }),
          leagueEvent(2400, 'save', { playerId: jack, name: nameOf(jack) }),
        ],
      },
      notes: 'Great team effort, tough second half.',
    },
    {
      id: uid(),
      opponent: 'Seaside Town',
      matchType: 'tournament',
      tournamentName: 'Summer Cup',
      stage: 'Group Stage',
      date: addDays(today, -12),
      time: '11:15',
      location: 'Summer Cup Grounds',
      isHome: true,
      status: 'completed',
      rsvps: rsvpFor(ids, 'yes'),
      presentIds: ids.slice(),
      captainId: zoe,
      playerOfMatchId: lucas,
      lineup: { slots: { ...emptyLineupSlots(squadFormat), gk: jack, d1: zoe, d2: emma, m1: isla, m2: oliver, m3: noah, f1: lucas } },
      live: {
        running: false,
        currentPeriod: 2,
        elapsedSeconds: 3000,
        scoreUs: 1,
        scoreThem: 1,
        onField: [zoe, emma, isla, oliver, noah, lucas],
        gkByPeriod: { 1: jack, 2: jack },
        sentOff: [],
        playingTime: Object.fromEntries(ids.map((id) => [id, 1500])),
        subLog: [
          leagueEvent(400, 'goal-them', {}),
          leagueEvent(1500, 'period-start', { period: 2 }),
          leagueEvent(2600, 'goal-us', { scorerId: lucas, scorerName: nameOf(lucas), assistId: isla, assistName: nameOf(isla) }),
        ],
      },
      notes: '',
    },
  ];
}
