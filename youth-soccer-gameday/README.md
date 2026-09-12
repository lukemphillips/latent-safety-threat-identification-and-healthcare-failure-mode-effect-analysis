# Youth Soccer Game Day

A game-day manager for a youth soccer team: roster, fixtures, match-day
squad selection, a formation/lineup builder, and a live in-game tracker for
goals, saves, substitutions, sent-offs, and per-player playing time.

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
roster, a couple of completed matches, and one upcoming fixture, so you can
see everything working immediately. Reset or clear that data any time from
**Settings**.

## Features

- **Roster** — players with jersey number, position, guardian contact, and
  active/inactive status.
- **Schedule** — League / Friendly / Tournament fixtures (tournament games
  carry a tournament name + stage, e.g. "Summer Cup · Final").
- **RSVP** — optional advance-availability tracker (In/Maybe/Out), for teams
  that want it. If your club already collects RSVPs elsewhere, skip it —
  match-day squad selection works independently of this tab.
- **Squad tab** — fast, on-the-fly match-day squad building: tap players
  present today (or "Mark All Present" in one tap), then place them on a
  pitch formation (5/7/9/11-a-side based on your team's settings). The GK
  spot sets your 1st-half keeper.
- **Live game day**:
  - Running match clock with period/half tracking (labelled Half, Quarter,
    or Period depending on your settings).
  - Goals logged with scorer + optional assist; opponent goals logged with
    one tap.
  - GK saves logged per player (or "open play"), with an editable minute.
  - Paired substitutions — tap the player coming on, then the player coming
    off — plus an "add to pitch" option when there's a spare spot.
  - Send-off tracking (player is removed from selection for the rest of the
    match).
  - The goalkeeper is selected per period and kept out of the normal
    substitution rotation; confirm or change it when a new period starts.
  - Fair-play suggestions (optional, see Settings) that flag which bench
    player has the least playing time and which on-field player has the
    most — a nudge, not an enforced rule.
  - Squad rules — configure pairs of players who should never both be on
    the bench at once (e.g. your only two keeper-capable defenders); the
    app warns (but never blocks) a substitution that would break this.
- **Stats** — a sortable leaderboard (appearances, minutes, goals, assists,
  saves, attendance %), full match history, and head-to-head records per
  opponent.
- **Settings** — team name, age group, squad format, match length, the
  equal-playing-time toggle, and squad rules.

## Project structure

```
index.html
css/styles.css
js/
  main.js          entry point + hash router
  store.js         in-memory state + localStorage persistence + pub/sub
  seed.js          sample data
  formations.js    pitch formation templates per squad size
  rules.js         "keep at least one on the pitch" pair-rule checking
  modal.js         small <dialog>-based modal helper
  util.js          formatting/id helpers
  views/
    dashboard.js
    roster.js
    schedule.js
    gameDetail.js  RSVP tab + Squad (attendance + lineup) tab
    liveGame.js    live match tracker (and read-only summary once completed)
    stats.js       leaderboard, history, head-to-head
    settings.js
```

## Notes / next steps

- No accounts or multi-device sync yet — it's single-browser, single-team.
  If you want coaches/parents to share live data, the next step is swapping
  `store.js` for a real backend (Supabase is a natural fit: Postgres +
  auth + realtime).
- The live match clock only runs while the Live Game screen is open (it's a
  manual stopwatch, not a wall-clock timer), so pause/resume as needed.
- Fair-play suggestions and squad rules are both advisory only — the coach
  can always override them.
