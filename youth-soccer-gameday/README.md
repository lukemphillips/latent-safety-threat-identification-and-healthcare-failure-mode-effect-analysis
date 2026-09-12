# Gaffer

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

- **Roster** — players with jersey number, one or more preferred positions
  (a versatile player can be both DEF and MID, say), guardian contact,
  active/inactive status, and a streaming classification (A/B/C/D) you
  assign per player to keep team-building fair. **Import** lets you bulk-add
  players from a .csv or .xlsx file instead of typing each one in — the
  first row should be headers, and common variants (Name/Player, Jersey/
  Number/#, Position/Pos, Stream/Group/Classification, Guardian/Parent,
  Phone/Mobile/Contact) are matched automatically. Only "Name" is required.
  It previews every row before importing, skips rows with no name, flags
  values it doesn't recognize (an odd position or stream) instead of
  guessing, and defaults to skipping any name that's already on the roster
  (you can still check it to import anyway).
- **Balance Teams** — pick who's involved (defaults to the whole active
  roster), then randomly split them into 2–4 teams. The split balances each
  streaming classification separately (so it's not just an even head count
  but an even mix of A/B/C/D across every team), and "Shuffle Again" re-rolls
  without losing your squad selection. For junior squads (U9 and under),
  where DDSL/FAI mini-soccer is 4v4/5v5, it nudges you toward splitting into
  several small teams for parallel games rather than one team with subs.
  Launching it from a game's RSVP or Squad tab ("🎲 Balance Teams from
  RSVPs" / "…from today's squad") starts you off with just that game's
  confirmed players instead of the whole roster — untick anyone before you
  split. Once split, "Copy to Share" copies a plain-text team list you can
  paste into a text/WhatsApp message to other coaches, and on phones that
  support it there's also a native "Text / Share…" button that opens the
  share sheet directly.
  "Send to a scheduled match" turns a selection (or one of the split teams)
  into the real thing in one tap: pick a scheduled match from the dropdown,
  hit "→ Set as Match Squad", and it sets who's present for that game and
  auto-fills their starting lineup — no re-entering attendance by hand. Since
  it writes straight into that match, it's what to use for the common junior
  case of splitting one squad into two teams playing two different matches
  at once: split, send Team 1 to match A, switch the dropdown to match B,
  send Team 2 there. This is also the fix for an earlier rough edge where
  a shuffled split could vanish if you navigated away before doing anything
  with it — now the split itself is safe to leave and come back to, and
  once you send a team to a match, that choice is saved for good.
- **Schedule** — League / Friendly / Tournament fixtures (tournament games
  carry a tournament name + stage, e.g. "Summer Cup · Final"), each with its
  own match length: "+ Add Game" pre-fills minutes-per-period and number of
  periods from your team's defaults (set in Settings), but either can be
  changed for that one match — handy for a tournament running short
  periods, or a friendly with a different format than your league games.
  Games on the same date are grouped under a "Match Day" heading, and
  "+ Add Game" also has an "⚡ Also add a second match this day" option
  that creates both matches — same date, location and format, a second
  opponent and kickoff time you set — in one go, rather than adding the
  first, saving, then coming back to add the second. A game's page also
  has its own one-tap "+ Add Match Day Opponent" for adding a second match
  after the first is already set up (still very common at junior ages) —
  it carries over the date/location/match type/format, you just add the
  opponent and (if different) a time. Once one exists, the game's page
  lists it under "Also on this date" with its current status, and the
  button relabels itself "+ Add Another Match Day Opponent" — so adding
  one is never in doubt.
  During a live game, if a same-date game is still scheduled, an
  "🏁 End & Next" button ends the current match and jumps straight into
  setting up the next one — score and clock start fresh, but each player's
  fair-play minutes carry over from the earlier match(es) that day, so
  playing-time suggestions in match two stay honest about the whole day, not
  just what's happened since kickoff. If that button isn't showing up, the
  live view explains why: no second game on that date yet (with a link to
  "+ Add Match Day Opponent", on the game's own page, not the live view),
  or one exists but is already live or finished (with a link straight to
  it) — either way it never just goes quiet as if nothing had been added.
  A scheduled game (one that hasn't
  started yet) also gets a 🗑 icon next to Edit on its page for a quick,
  one-tap delete — handy for a fixture added by mistake or a cancelled
  match. Once a game is live or completed, deleting it moves to Edit
  Game's Delete button instead, so match history and stats aren't one
  accidental tap away.
- **Captain & Player of the Match** — set per game from that game's page
  (pulled from whoever's marked present, or the full roster if attendance
  isn't set yet). Both show up as season totals in Stats.
- **Player of the Week** — a separate award from Player of the Match, set
  from Stats once a Monday-to-Sunday week's matches are done (it groups
  completed games into weeks and gives each one a Set/Change button —
  handles a weekend with two fixtures the same as a single midweek game).
  Pick one player or several (a checklist, not an either/or) from whoever
  was marked present across that week's games; season totals show up in
  the Stats leaderboard's 🏅 column alongside Player of the Match and
  captaincies.
- **RSVP** — optional advance-availability tracker (In/Maybe/Out), for teams
  that want it. If your club already collects RSVPs elsewhere, skip it —
  the Squad tab's attendance still works on its own without it. Where the
  two connect: the Squad tab's "✅ Use RSVP List" adds everyone who RSVP'd
  In to today's attendance in one tap (it adds to whoever's already marked
  present rather than replacing them, so a walk-in you added by hand isn't
  lost), each attendance chip shows a small RSVP badge for anyone who
  responded Maybe or Out so a "maybe" or "no" showing up as present stands
  out, and the RSVP tab itself notes who's already been marked present.
  RSVP and attendance are still tracked separately on purpose, so you can
  see who actually showed up versus who said they would.
- **Squad tab** — fast, on-the-fly match-day squad building: tap players
  present today ("✅ Use RSVP List" if you're using RSVPs, or "Mark All
  Present" in one tap), then place them on a pitch formation (5/7/9/11-a-side
  based on your team's settings) — or tap "⚡ Auto-Fill" to place everyone
  present by their preferred position in one go (goalkeeper slot filled
  from GK-tagged players first) and just adjust from there; it only fills
  empty spots, so it's also a quick way to plug remaining gaps after
  placing a few players yourself. The GK spot
  sets your 1st-half keeper. Once the match is live, this tab switches to a
  quick "add a late arrival" view — mark them present and they show up on
  the live bench immediately, no need to touch the pitch again.
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
    rule. Where the roster has skill streams (A/B/C/D) set, the suggested
    incoming player matches the outgoing one's stream where the bench has a
    like-for-like option, and the outgoing player itself is chosen to avoid
    leaving two players from the same stream (most visibly, two "A"s)
    resting on the bench together when a fairness-comparable alternative
    exists — both best-effort, not guaranteed when the bench doesn't allow
    it. A substitution newly becoming due also triggers a vibrate + two-tone
    chime (🔔 toggle in Settings, on by default) — driven by the same global
    ticker as the clock, so it fires even if you've stepped away to another
    tab, and only once per time it becomes due rather than repeating every
    second. Vibration only works on browsers that support it (notably not
    iOS Safari); the on-screen banner is always there either way.
  - A "🔜 Coming up" bar previews the next couple of specific swaps
    approaching — naming who's coming on as well as who's coming off (e.g.
    "Bob on for Alice"), not just the one that's due right now — so you can
    tell both players to get ready before the swap actually comes up. It's
    a forward projection off the same rule as the suggestion above (updates live as
    the clock ticks), so it stays consistent with what actually fires.
  - Squad rules — configure pairs of players who should never both be on
    the bench at once (e.g. your only two keeper-capable defenders); the
    app warns (but never blocks) a substitution that would break this.
- **Cards** — an opt-in Settings toggle (aimed at older age groups) that adds
  yellow/red card logging alongside send-offs; card counts show up in Stats.
- **Stats** — a sortable leaderboard (appearances, minutes, goals, assists,
  saves, cards when enabled, Player-of-the-Match awards, times captained,
  attendance %), full match history, and head-to-head records per opponent.
  On a match day with more than one game, each player's minutes and
  appearances count only what they actually played in that specific game —
  the running day-total that the live fair-play banner shows (so it can
  balance minutes across a whole match day, not just one game) is not
  re-summed on top of it, so a player's season minutes don't double-count
  a match day, and a player who sat out the second match of a day doesn't
  pick up a phantom appearance just because their minutes carried over.
- **Settings** — team name, age group, squad format, default match length
  (minutes per period + number of periods — each game can still set its
  own when scheduled), minimum stint length, the equal-playing-time
  toggle, cards toggle, squad rules, and a collapsible age-group format
  guide (see below) with a one-tap "Suggest format" button that reads your
  age group and fills in the squad format + match length for you.
  Changing squad format (e.g.
  7-a-side to 5-a-side) reshapes every upcoming lineup to fit — spots the
  new formation still has keep their player, anyone whose spot no longer
  exists just moves to the bench, so nobody's silently dropped and nothing
  else on the form is lost in the process. It can't be changed while a
  match is live, since the players actually on the pitch don't resize
  themselves — finish or end that match first.
- **Diagnostics** — since there's no server to phone home to, uncaught
  errors are captured automatically into a small on-device log (Settings)
  instead of just vanishing. If the app misbehaves for you or another
  coach, "Copy Error Log" grabs the details (what broke, when, on which
  screen) to paste into a message to whoever maintains the app.
- **Backup / Restore** — since everything lives only in this browser's
  `localStorage`, a private/incognito window, a device clearing site data,
  or an embedding environment enforcing its own storage limits can wipe a
  team's data with no warning, independent of anything the app itself does.
  Settings > Data has a "Backup Team Data" button that copies the entire
  team (roster, games, settings) as JSON to the clipboard (falling back to
  a select-and-copy text box if clipboard access is blocked), and a
  "Restore from Backup" button that pastes it back in, validates the shape
  before touching anything, and asks for confirmation since it replaces
  everything currently on the device. Get in the habit of backing up before
  a big change, and any time you're not sure the data will still be there
  next time you open the app.
  - **Automatic backups** — on top of the manual button, Gaffer snapshots a
    backup by itself every time a match finishes (End Game or End & Next),
    with no action needed. It's kept as a second, independent copy on the
    same device (not sent anywhere — everything here stays local), so a bad
    edit or an accidental Clear All Data still has something to fall back
    to; the 5 most recent are listed in Settings > Data with a one-tap
    Restore each. If the app is ever opened and finds no team set up but an
    automatic backup exists on that device, the Dashboard offers to restore
    it before you start from scratch. Where the page isn't sandboxed (a
    normal hosted tab, not the embedded Claude Artifact viewer), it also
    tries to save the same backup as a downloaded file for an extra, fully
    offline copy — inside the Artifact viewer that part is silently skipped
    (the sandbox blocks a page from starting its own downloads), so the
    automatic on-device snapshot and the manual Backup button are what's
    guaranteed to work there.
  - **A single self-updating backup file** — the downloaded file above is a
    new dated file every match, which adds up over a season. On a
    desktop/laptop, in Chrome or Edge (this needs the File System Access
    API), Settings also offers "Choose File Location": pick a file once
    (e.g. `gaffer-backup.json` in Documents) and Gaffer silently overwrites
    that same file after every match from then on, so there's always
    exactly one current file rather than a growing pile. It's independent
    of the dated downloads — use one, the other, both, or neither.
    **Doesn't work on iPhone or iPad, in any browser** — Apple requires
    every browser on iOS to use the same underlying engine (Safari's),
    which has never implemented this API, so "Chrome" on an iPhone doesn't
    get it either. That's a platform restriction, not a bug; the dated
    download above is the one that works everywhere, phones included.
  - **Merging in another coach's backup** — for one team split across two
    simultaneous matches (e.g. two 5-a-side games at once, each tracked on
    a different coach's phone), Settings > Data also has "Merge in Another
    Coach's Backup". The other coach sends their Backup (any way — a
    shared cloud folder, AirDrop, a message); pasting it in here adds their
    game(s) and any players not already present, without touching anything
    already on this device. Where "Restore" replaces everything, "Merge"
    only adds — if a game id somehow exists on both sides, it keeps
    whichever copy is further along (a completed match always wins over a
    live or scheduled one) rather than picking either one blindly. This is
    a periodic, bring-it-together-after-the-fact join, not live sync —
    there's no server in the middle, so nothing updates on the other
    coach's phone until someone shares a file again. A successful merge
    (one that actually added or updated something) immediately snapshots
    an automatic on-device backup of the combined result, same as a match
    ending would — the merged data is protected right away rather than
    waiting on the next match or a manual Backup Team Data tap.

## Age-group formats (DDSL / FAI Player Development Plan)

Settings includes a reference table of playing formats by age group, based
on the FAI Player Development Plan that DDSL and most Irish schoolboy/
schoolgirl leagues build their own rules on: 4v4 (no keeper) at U7, 5-a-side
at U8–U9, 7-a-side at U10–U11, 9-a-side at U12, and 11-a-side from U13 up,
each with its own match length and pitch size.

Worth knowing: this session's network policy blocked direct access to
ddsl.ie, so the table is sourced from the public FAI plan and reporting
about DDSL rather than DDSL's own rule book (which is linked from
[ddsl.ie](https://ddsl.ie/) if you want to check the current one directly)
— DDSL has in the past run U11/U12 differently from the standard FAI
format, so it's worth confirming your age group's exact rules with your
league before relying on the suggestion.

## Project structure

```
index.html
css/styles.css
js/
  main.js          entry point + hash router
  store.js         in-memory state + localStorage persistence + pub/sub
  seed.js          sample data
  formations.js    pitch formation templates per squad size
  ageFormats.js    DDSL/FAI age-group format reference + suggestion logic
  importRoster.js  CSV/Excel parsing + header-alias mapping for bulk import
  errorLog.js      on-device uncaught-error capture for Settings > Diagnostics
  rules.js         "keep at least one on the pitch" pair-rule checking
  modal.js         small <dialog>-based modal helper, plus confirmDialog()/
                   alertDialog() — used everywhere instead of window.confirm()/
                   alert(), since a page embedded in an iframe (e.g. this app's
                   Claude Artifact deployment) can't rely on those being
                   permitted by the embedder
  util.js          formatting/id helpers, isSubDue() (shared fair-play
                   "due now" rule used by both the live-view banner and
                   the sub-due alert)
  subAlert.js      vibrate + Web Audio chime for "a substitution is due"
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
- Roster import: CSV parsing is hand-rolled with no dependency. Excel
  (.xlsx/.xls) parsing lazy-loads [SheetJS](https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js)
  from cdnjs the first time you pick an Excel file, so it needs an internet
  connection at that moment (CSV never does). This session's network
  policy blocked cdnjs from the sandbox, so the Excel path is implemented
  against SheetJS's well-established API but wasn't executable here to
  verify live — it's the CSV path that's been thoroughly tested. If an
  .xlsx import doesn't behave, try re-saving as CSV, or tell me and I'll fix it.
