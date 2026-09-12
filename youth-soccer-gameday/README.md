# Youth Soccer Game Day

A lightweight game-day manager for a youth soccer team: roster, fixtures, RSVPs,
a formation/lineup builder, and a live in-game tracker for substitutions,
score, and per-player playing time.

Built as a dependency-free static app (plain HTML/CSS/JS, ES modules) — no
build step, no install, no backend. All data is stored in the browser via
`localStorage`. That makes it easy to run and deploy anywhere, and easy to
wire up to a real backend later (e.g. Supabase) if you want multi-device
sync or multiple coaches.

## Run it

Any static file server works:

```bash
npx http-server .        # or
python3 -m http.server 8000
```

Then open the printed URL. Or just open `index.html` directly in a browser.

On first load it seeds a sample team ("Thunder FC", U10, 7-a-side) with a
roster and two games so you can see everything working immediately. Reset
or clear that data any time from **Settings**.

## Features

- **Roster** — players with jersey number, position, guardian contact, and
  active/inactive status.
- **Schedule** — upcoming and past fixtures (opponent, date/time, location,
  home/away).
- **RSVP** — mark each player In / Maybe / Out per game, with live counts.
- **Lineup builder** — a formation template (5/7/9/11-a-side, based on your
  team's settings) rendered on a pitch. Tap an open spot, then tap a player
  to place them; tap a filled spot to send that player back to the bench.
- **Live game day** — a running match clock, score tracker, one-tap
  field/bench toggling (with a substitution log), and a per-player playing
  time tracker with fairness bars — handy for youth leagues with equal
  playing-time expectations.
- **Settings** — team name, age group, squad format, and match length.

## Project structure

```
index.html
css/styles.css
js/
  main.js          entry point + hash router
  store.js         in-memory state + localStorage persistence + pub/sub
  seed.js          sample data
  formations.js    pitch formation templates per squad size
  modal.js         small <dialog>-based modal helper
  util.js          formatting/id helpers
  views/
    dashboard.js
    roster.js
    schedule.js
    gameDetail.js  RSVP + lineup tabs for a single game
    liveGame.js    live match tracker (and read-only summary once completed)
    settings.js
```

## Notes / next steps

- No accounts or multi-device sync yet — it's single-browser, single-team.
  If you want coaches/parents to share live data, the next step is swapping
  `store.js` for a real backend (Supabase is a natural fit: Postgres +
  auth + realtime).
- The live match clock only runs while the Live Game screen is open (it's a
  manual stopwatch, not a wall-clock timer), so pause/resume as needed.
