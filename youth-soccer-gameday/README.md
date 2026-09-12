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

- **Roster** — players with jersey number, preferred position, guardian
  contact, active/inactive status, and a streaming classification (A/B/C/D)
  you assign per player to keep team-building fair.
- **Balance Teams** — pick who's involved (defaults to the whole active
  roster), then randomly split them into two teams. The split balances each
  streaming classification separately (so it's not just an even head count
  but an even mix of A/B/C/D on both sides), and "Shuffle Again" re-rolls
  without losing your squad selection.
- **Schedule** — League / Friendly / Tournament fixtures (tournament games
  carry a tournament name + stage, e.g. "Summer Cup · Final").
- **RSVP** — optional advance-availability tracker (In/Maybe/Out), for teams
  that want it. If your club already collects RSVPs elsewhere, skip it —
  match-day squad selection works independently of this tab.
- **Squad tab** — fast, on-the-fly match-day squad building: tap players
  present today (or "Mark All Present" in one tap), then place them on a
  pitch formation (5/7/9/11-a-side based on your team's settings). The GK
  spot sets your 1st-half keeper. Once the match is live, this tab switches
  to a quick "add a late arrival" view — mark them present and they show up
  on the live bench immediately, no need to touch the pitch again.
- **Live game day**:
  - A match clock that keeps running in real time no matter what screen
    you're on — step away to the Squad tab, Roster, wherever, and it's
    still accurate when you come back.
  - Rolling substitutions: unlimited subs, paired ("who's on, then who's
    off") with an "add to pitch" option when there's a spare spot.
  - Minimum-stint protection (default 4 min, adjustable in Settings) — subbing
    a player off before they've had a fair block of time on the pitch shows
    a warning naming them and how long they've actually played; you can
    always override it.
  - Goals logged with scorer + optional assist; opponent goals logged with
    one tap.
  - GK saves logged per player (or "open play"), with an editable minute.
  - Send-off (and, if your team logs cards, yellow/red cards) — a red card
    or send-off removes the player from selection for the rest of the match.
  - The goalkeeper is selected per period and kept out of the normal
    substitution rotation, with their own stint tracked separately; confirm
    or change who's in goal at any point, or when a new period starts.
    Goalkeeping time counts toward that player's overall playing time.
  - Fair-play suggestions (optional, see Settings) that flag which bench
    player has the least playing time and which eligible on-field player has
    the most (respecting the minimum-stint rule) — a nudge, not an enforced
    rule.
  - Squad rules — configure pairs of players who should never both be on
    the bench at once (e.g. your only two keeper-capable defenders); the
    app warns (but never blocks) a substitution that would break this.
- **Cards** — an opt-in Settings toggle (aimed at older age groups) that adds
  yellow/red card logging alongside send-offs; card counts show up in Stats.
- **Stats** — a sortable leaderboard (appearances, minutes, goals, assists,
  saves, cards when enabled, attendance %), full match history, and
  head-to-head records per opponent.
- **Settings** — team name, age group, squad format, match length, minimum
  stint length, the equal-playing-time toggle, cards toggle, and squad
  rules.

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
    balanceTeams.js random 2-team split, balanced by streaming classification
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
- The clock runs as long as the app is open in your browser (any tab of it),
  driven by a one-second ticker in `main.js` rather than the Live Game view
  itself — so it survives you navigating elsewhere. It does *not* survive
  closing the browser tab entirely; reopening picks up wherever the clock
  was left.
- Fair-play suggestions, minimum-stint warnings, and squad rules are all
  advisory only — the coach can always override them. Subs are rolling
  (no limit on how many you make).
