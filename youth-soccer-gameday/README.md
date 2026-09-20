# Boot Room

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

- **Home** — the next game (with an RSVP summary) and the last result up
  top, then a Quick Links grid to every other section — Roster, Schedule,
  Training, Stats, Settings, and Help & How-To.
- **Roster** — players with jersey number, one or more preferred positions
  (a versatile player can be both DEF and MID, say), guardian contact, a
  free-text **notes** field (allergies, pickup arrangements, an injury —
  anything worth remembering that doesn't fit another field; shows as a
  📝 preview line on the roster row when set), active/inactive status,
  and a streaming classification (A/B/C/D) you assign per player to keep
  team-building fair. **Import** lets you bulk-add
  players from a .csv or .xlsx file instead of typing each one in — the
  first row should be headers, and common variants (Name/Player, Jersey/
  Number/#, Position/Pos, Stream/Group/Classification, Guardian/Parent,
  Phone/Mobile/Contact) are matched automatically. Only "Name" is required.
  It previews every row before importing, skips rows with no name, flags
  values it doesn't recognize (an odd position or stream) instead of
  guessing, and defaults to skipping any name that's already on the roster
  (you can still check it to import anyway). A player can also be marked
  **👥 Guest** (with an optional "visiting from" team name) — meant for
  combining with another team for a joint training session. A guest shows
  up for Training's Attendance, Groups, and small-sided Matches tabs (so
  numbers work out for drills and scrimmages), but is excluded everywhere
  match-related: Schedule/RSVP, a game's Squad and Lineup, Live Game, the
  squad-rule editor, Balance Teams, and Stats — since they're not actually
  part of your team for real fixtures. The Roster header splits out the
  guest count separately from "active players" for that reason. The
  Import dialog has a matching "Import this whole list as guest players"
  checkbox — tick it (with an optional shared team name) to bring a whole
  visiting team's roster in as guests in one go, instead of adding each
  one by hand and flipping the Guest switch every time.
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
  share sheet directly. Not happy with the random result? Tap a player on
  one team, then tap "Move here →" on another team to move them across by
  hand — the same tap-to-select pattern used for Training groups — without
  needing to reshuffle everyone.
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
- **Training** — a separate section from Schedule for practices rather than
  matches. "+ Add Training" creates a session with a date, time, and
  location; each session has four tabs:
  - **Attendance** — tap players to mark who's actually shown up, same
    interaction as a game's Squad tab.
  - **Groups** — two modes, same as Matches below. **Same stream**
    (default) clusters players of similar skill stream together, so each
    group can be coached at its own level. Leave "Number of groups" blank
    for one group per stream present, or set a specific number — fewer
    than the streams present merges the smallest adjacent pair, more
    splits the largest group roughly in half. "⚖️ Balance numbers across
    groups" (checked by default in this mode) runs a follow-up pass that
    repeatedly moves one player from the largest group into whichever
    smallest group sits closest to it in ability, until no group has more
    than one extra player over any other — trading a little clustering
    purity for fairer numbers, automatically. **Mixed ability** is the
    opposite: every skill stream is spread evenly across however many
    groups you set (reusing Balance Teams' even-spread algorithm), so each
    group gets a fair cross-section instead of similar players together —
    useful for stations built around mixed-ability play, or just to vary
    things up; numbers are inherently balanced in this mode, so there's no
    separate checkbox for it. Tap "🎲 Auto-Build Groups" to build (or
    rebuild) in whichever mode is selected. If a group still ends up too
    big, too small, or otherwise wrong for what you want, tap a player to
    select them, then tap "Move here" on a different group's card to move
    them across by hand.
  - **Matches** — sets up small-sided scrimmage teams, a separate concept
    from coaching Groups. Pick a number of teams and tap "Build Match
    Teams"; "Randomize Again" re-rolls it. The most teams offered scales
    with who's actually present (at least 2 players per team), rather than
    a fixed cap. **Same stream** clusters similar ability onto the same
    team (good for two matches at different intensities, reusing the
    Groups clustering algorithm); **Mixed ability** spreads every stream
    evenly across teams instead, for one fair match (reusing Balance
    Teams' even-spread algorithm). Match teams are independent of Groups
    and the Plan, and show up in Copy to Share.
  - **Plan** — a session planner: an ordered list of timed blocks (warm-up,
    a drill, a scrimmage, cool-down, etc.), each either one activity for
    the whole squad or a different activity per group running in parallel.
    A grouped block can also be set to **rotate**: instead of every group
    staying at one activity for the block's whole duration, groups cycle
    through stations in turn (a circuit). Stations are their own list
    (`block.stations`, each `{id, activity, drillId}`) — add/remove them
    with "+ Add Station"/🗑, independent of how many groups there are —
    and a **Number of rotations** field (`block.rotationCount`) sets how
    many legs actually run, defaulting to the station count so everyone
    visits each one once. Having fewer stations than groups is exactly
    what makes two or more groups share a station at the same time —
    group `i` sits at station `(i + legIndex) mod stations.length` each
    leg (`rotationAssignment` in `training.js`), so 4 groups over 3
    stations always puts two of them on the same station together, no
    separate "pairing" step needed. A block saved before stations were
    decoupled from groups (or the sample seed data) still works exactly
    as it did — `resolveStations`/`resolveRotationCount` fall back to one
    station per group with an activity set, matching the old station
    count precisely, and opening it for editing seeds the new stations
    list from that automatically. The minutes field is "per rotation" —
    the block's total time, the session running total, and the estimated
    finish time all scale to minutes × number of rotations. A block can also be marked
    as a **break** (water/rest stop) — shown with a ☕ marker, skipping the
    activity-type and group fields entirely, just a duration and an
    optional note. Each activity field has a "📚 Fill from Drill Library…"
    dropdown to pull in a saved drill instead of retyping it, and "+ Add
    Drill" is reachable from the Training list and every session's page
    too, not just the library itself. Filling from the library also keeps
    a link back to that drill (`block.activityDrillId` for a whole-team
    activity, `block.groupActivityDrillIds` per group) — a "📚 View Drill"
    button next to the activity text reopens its full description, image,
    PDF/link, and tags in a read-only modal, both on the static Plan tab
    and on the live timer below, so a coach never has to leave Training
    mid-session to remember what a drill actually involves. Typing over
    the activity text by hand clears that link, since it may no longer
    describe the linked drill — but any activity whose text exactly
    matches a saved drill's name (case/whitespace-insensitive) still gets
    a "View Drill" button even without an explicit link, so blocks typed
    by hand, or created before this feature existed (including the
    sample seed data), aren't stuck with no way back to their drill.
    Reorder, edit, or delete blocks.
    "▶ Start Session" turns the static plan into a **live countdown
    timer**: a big clock counts down the current block, an order-of-play
    list shows done/current/upcoming blocks, and ⏸ Pause / ▶ Resume, ⏮
    Previous, and ⏭ Skip controls adjust it on the fly — pausing genuinely
    freezes the clock (driven by the same global one-second ticker as a
    live match's clock, so it keeps running even off-screen, and a pause
    is just `live.running = false` rather than stopping the ticker). A
    chime/vibration (the same alert used for substitution reminders) fires
    whenever the timer crosses into a new block. A rotation block's live
    view shows exactly which station each group is on and counts down that
    specific leg, with its own "View Drill" button per station where one's
    linked. "⏹ End Session" stops the timer without touching the saved
    plan; a live session shows a 🔴 LIVE tag on the Training list. Ending
    a session marks it `completedAt` and moves it into the Past list
    right away (rather than waiting for its date to pass), tagged
    ✅ Completed; restarting it clears that and moves it back to Upcoming.
  - **Copy to Share / native share** — at the top of any session's page
    (same pattern as Balance Teams' team split), "📋 Copy to Share" copies
    the whole session — attendance, groups, match teams, and the full plan
    with timings — as plain text, ready to paste into a WhatsApp message
    or text to another coach. Where the browser supports it, "📤 Text /
    Share…" opens the native share sheet directly instead of copy/paste.
- **Drill Library** — a reusable repository of drills, separate from any
  one session (linked from the top of the Training page, and reachable
  from any Training screen via "+ Add Drill"). "📚 Load Starter Drill Pack"
  adds a curated set of about 45 real drills in one tap — spanning
  warm-ups, passing, dribbling, shooting, defending, possession, small-sided
  games, fitness, goalkeeping, set pieces, cool-downs and fun games, each
  linking to a genuine coaching video (see `js/starterDrills.js`). A dozen
  of them also ship with a small original diagram — a cone/player layout
  drawn as inline SVG, so it stays plain text in the source file and costs
  nothing to load — covering the drills where a simple picture of the setup
  is genuinely more useful than the video alone (rondo grids, cone
  patterns, corner-kick runs, and the like); most rely on the video link by
  itself. It's dedup'd by name, so clicking it again only adds whatever's
  still missing — safe to press repeatedly.
  Each drill (starter-pack or hand-added) has a name, an optional
  description, age groups, tags, an optional weblink (a video or article),
  and an optional attached PDF or image (a diagram, say). Age groups reuse
  the same six FAI-based bands as the rest of the app (U7, U8-U9, U10-U11,
  U12, U13, U14+ — see `js/ageFormats.js`), shown as one-tap chips, so a
  coach can filter the whole library down to drills that suit a specific
  squad's age. Tags are a curated set of common categories (Warm-up,
  Passing, Dribbling & Ball Control, Shooting, Defending, Possession /
  Rondo, Small-Sided Games, Fitness & Conditioning, Goalkeeping, Set
  Pieces, Cool-down, Fun / Game-based) shown the same way, plus a free-text
  "+ Add Tag" for anything else — a used custom tag then shows up as its
  own filter chip in the library too. Age group and category filters
  combine (both narrow the list at once), and the search box also matches
  age-group text, so typing "U10" surfaces anything tagged for that band
  without needing to tap a chip. Images are resized
  automatically; PDFs are capped at roughly 1.5MB, since everything here
  is stored on-device in the same `localStorage` as the rest of the team's
  data, which has far less headroom than a normal file system — a weblink
  is unlimited and costs nothing, so it's the better choice for anything
  large or already hosted somewhere. Before saving, Boot Room does a real
  test write to confirm the drill (attachment included) actually fits in
  storage, and tells the coach plainly if it doesn't rather than silently
  failing or risking other data. Deleting a drill never breaks a session's
  plan, since a plan block only ever copies a drill's name in at the
  moment it's picked — it's not a live link back to the drill. Tapping a
  drill's attachment name opens it in a new tab (via a same-origin blob:
  URL rather than linking the stored data: URL directly, since browsers
  block a data: URL as a direct new-tab target — the earlier version of
  this link silently failed to open anything). A drill with an attachment
  also gets a "📤 Share / Download" button: where the browser supports
  sharing files (most current Android/iOS), it opens the native share
  sheet with the actual image or PDF attached, ready to send straight into
  WhatsApp or Messages; everywhere else (most desktop browsers, older iOS)
  it downloads the file instead. "📦 Export ZIP" bundles every drill —
  attachments included, each as a real file under an `attachments/`
  folder rather than embedded as text — into one .zip to hand to another
  coach; they use "📦 Import ZIP" on their own device to load them
  straight into their library, always as new drills with fresh ids (never
  overwriting anything already there), applying the same size caps and a
  per-drill storage-quota check as adding one by hand — an attachment
  that won't fit is left out (the drill still imports with its text) and
  the after-import summary says what happened. Needs an internet
  connection the first time, since it lazy-loads a small ZIP library
  (JSZip, from cdnjs) the same way Excel import lazy-loads SheetJS.
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
  Present" in one tap), then place them on a pitch formation — or tap
  "⚡ Auto-Fill" to place everyone present by their preferred position in
  one go (goalkeeper slot filled from GK-tagged players first) and just
  adjust from there; it only fills empty spots, so it's also a quick way
  to plug remaining gaps after placing a few players yourself. The GK spot
  sets your 1st-half keeper.
  - **Formations** — a **Formation** dropdown above the pitch offers a
    few common default shapes for your squad size (e.g. 7-a-side gets
    2-3-1, 3-2-1, and 2-2-2) plus anything you've built yourself (see
    below), labeled "(yours)" to tell them apart. Switching formations
    mid-setup remaps your current lineup rather than clearing it — slots
    that exist in both shapes (matched by id, e.g. `d1`, `m2`) keep their
    player; anyone whose slot doesn't exist in the new shape just moves to
    the bench. **Create your own** from Settings' "Formations" section:
    name it and choose how many defenders/midfielders/forwards you want
    (must add up to one less than your squad size, to leave room for the
    goalkeeper) — the app lays them out on the pitch as evenly spaced rows
    rather than needing pixel-precise drag-and-drop placement. It then
    shows up as an option for every game using that squad size, and can be
    edited or deleted from Settings at any time (a game using a deleted
    formation falls back to a default suggestion automatically).
  - **Positions carry through the live match**, not just the pre-match
    setup: substituting a player on takes over the exact pitch slot the
    player coming off held, shown as a role label (DEF/MID/FWD) on their
    live match-day card instead of just "On field" — so "who's playing
    where" stays meaningful for the whole match, not only at kickoff.
    Sending a player off or recovering one frees or re-fills their slot
    the same way.
  Once the match is live, the Squad tab itself switches to a quick "add a
  late arrival" view — mark them present and they show up on the live
  bench immediately, no need to touch the pitch again.
- **Live game day**:
  - A match clock that keeps running in real time no matter what screen
    you're on — step away to the Squad tab, Roster, wherever, and it's
    still accurate when you come back.
  - Rolling substitutions: unlimited subs, paired ("who's on, then who's
    off") with an "add to pitch" option when there's a spare spot.
  - **Live pitch + tap-to-substitute** — the same visual pitch from the
    pre-match Squad tab carries into the live match, kept in sync with
    who's actually on the field (including subs and send-offs as they
    happen). Tap any on-field player on the pitch to open a small
    "Substitute" dropdown of bench players — pick one and the swap runs
    through the normal sub flow (min-stint and squad-rule warnings still
    apply) — no need to scroll down to the bench section first. An **empty
    spot** works the same way: tap it to open a "Bring On" dropdown and
    place a bench player straight into that exact position, no separate
    outgoing player needed. Tapping the empty goalkeeper spot opens the
    dedicated Assign Goalkeeper dialog instead of a plain add, since that's
    the only place a keeper's stint tracking and gk-change logging are set
    up correctly. The
    **Formation** dropdown also works mid-match: switching shapes remaps
    everyone's position onto the new layout without touching who's
    actually on the field, and any on-field player whose old slot id
    doesn't exist in the new formation is placed into whatever slot is
    left over rather than being left without a visible position.
  - Minimum-stint protection (default 4 min, adjustable in Settings) — subbing
    a player off before they've had a fair block of time on the pitch shows
    a warning naming them and how long they've actually played; you can
    always override it.
  - Goals logged with scorer + optional assist; opponent goals logged with
    one tap.
  - GK saves logged per player (or "open play"), with an editable minute.
  - Removing a player from the match — every on-field player has a small,
    deliberately understated "⋯" icon tucked in the corner of their card
    (not a full-width red button, so it can't easily be caught by
    accident while tapping the card itself to complete a substitution)
    and the goalkeeper has an equivalent "Card"/"Remove" button, that
    opens a short "What happened?" menu instead of one ambiguous action: 🟨 Yellow (stays on),
    🟥 Red, 🚑 Injury, or Other reason (with Cards off, just Injury/Other,
    since there's no card to log). Anything other than a first yellow —
    red, injury, other, or a second yellow — removes the player from the
    pitch, clears any goalkeeper slot they held, and drops them into
    `sentOff`, so they can never be selected for a sub again this match;
    the match event log records which of those it was. A **second yellow
    card is applied automatically**: logging it immediately sends the
    player off with a clear alert explaining why, rather than leaving the
    coach to separately notice the accumulation and remove them by hand.
    Both yellows still count individually toward that player's card
    totals in Stats (a second-yellow send-off is not also counted as a
    red — the FAI/DDSL send-off outcome is the same either way, but it's
    recorded distinctly from a straight red in the log).
  - **Recover** — every name in the "Sent Off" list gets a "↩️ Recover"
    button, for the two situations a send-off isn't actually final: an
    injury that turns out fine, or a card logged against the wrong
    player. It looks up why they're out (searching backward through the
    event log for the specific card/send-off entry that put them there —
    for a second-yellow send-off, that's the second yellow itself, not
    their legitimate first one) and shows it in the dialog. Recovering
    always clears `sentOff` so they're selectable for a sub again;
    leaving "This was logged by mistake" unticked (the default) also
    logs a "Back available" event and keeps the original card/send-off
    on the record, for a real injury that's since cleared up. Ticking it
    instead deletes the specific entry (or entries — a corrected second
    yellow removes just that card and the auto-send-off, not the
    player's genuine first yellow) so the log reads as if it never
    happened, correcting a data-entry mistake without leaving a phantom
    card or inflated stat behind. Either way, recovering only restores
    bench eligibility — it never puts the player back on the pitch
    itself; that's still a normal sub.
  - The goalkeeper is selected per period and kept out of the normal
    substitution rotation, with their own stint tracked separately; confirm
    or change who's in goal at any point, or when a new period starts.
    Goalkeeping time counts toward that player's overall playing time.
    Promoting an outfield player to keeper cleanly moves them off whatever
    outfield slot they were holding, so the pitch never shows the same
    player twice at once (once in goal, once still in their old spot).
  - **Match Summary** — once a game is completed, "View Summary" on its
    page (or the live screen itself once the match has ended) opens with a
    distilled Match Summary card: ⚽ scorers (with assist tallies), 🧤
    saves, and 🟨 cards, so you can see who did what at a glance instead of
    reading back through the whole chronological log. That raw log is
    still there — under a collapsed "Match Events" section — along with a
    collapsed "Playing Time" breakdown; both are one tap away, kept out of
    the way by default so a completed match's page doesn't read as a wall
    of text.
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
  - **Substitution Plan** — a manual, coach-written rotation schedule
    (`js/subPlan.js`), separate from the automatic fair-play suggestions
    above: entries of "this player on for that player, at minute X,"
    edited from a section on either the pre-match Squad tab or the live
    match tracker (the same plan either way — anything set up before
    kickoff carries straight into the live match). Live, each entry shows
    a live "due in…" countdown (or "⏰ Due now" once its minute arrives)
    and a one-tap "✅ Sub Now" button that runs the actual substitution
    through the normal sub flow (same min-stint and squad-rule warnings
    apply) and then drops that entry from the plan — but only once the
    swap has actually happened; declining a warning leaves the entry in
    place to try again. It's advisory only, exactly like everything else
    here — nothing in the plan ever subs a player on its own. Each bench
    player's own card also shows a "🕐 due" line — a static planned
    minute pre-match, or a live countdown — for whichever plan entry has
    them coming on next, so "how long until they're on" is visible at a
    glance without opening the plan itself.
- **Cards** — an opt-in Settings toggle (aimed at older age groups) that adds
  yellow/red card logging alongside send-offs; card counts show up in Stats.
- **Stats** — a sortable leaderboard (appearances, minutes, goals, assists,
  saves, cards when enabled, Player-of-the-Match awards, times captained,
  match attendance %), full match history, and head-to-head records per
  opponent. On a match day with more than one game, each player's minutes
  and appearances count only what they actually played in that specific
  game — the running day-total that the live fair-play banner shows (so it
  can balance minutes across a whole match day, not just one game) is not
  re-summed on top of it, so a player's season minutes don't double-count
  a match day, and a player who sat out the second match of a day doesn't
  pick up a phantom appearance just because their minutes carried over.
  The leaderboard also includes a **Trn Att%** column — the share of
  training sessions each player has attended, out of every session where
  attendance was actually taken (separate from match attendance, since a
  player can miss training but make every game, or vice versa). When a
  **minimum playing time standard** is set (Settings, see below), a **PT%**
  column appears too: each player's share of the total match minutes they
  were actually available for (summed across every completed match they
  were present at, whatever that match's own length), with a ⚠️ next to
  anyone currently under the team's standard — the only place in the app
  that actively checks a player's playing time against a target rather
  than just reporting the raw minutes. A separate "🧤 Goalkeeper
  Appearances" table breaks down how many times each player has gone in
  goal, one column per half (or quarter, etc. — labelled off the team's
  current period format) plus a season total, tallied from every completed
  game's per-period keeper assignment. Only shows up once someone's
  actually played in goal, and only lists players who have.
- **Club logo** — upload an image in Settings (Team section) to replace the
  default Boot Room crest in the header with your own club badge. Resized
  automatically to a small header-sized image before saving, so a full-size
  photo straight off a phone doesn't bloat local storage; stays on this
  device like everything else. Remove it any time to go back to the
  default crest.
- **Settings** — team name, age group, squad format, default match length
  (minutes per period + number of periods — each game can still set its
  own when scheduled), minimum stint length, a **minimum playing time
  standard** (% of match minutes every player should get at minimum, over
  the season — surfaced in Stats' PT% column, see above), the
  equal-playing-time toggle, cards toggle, squad rules, and a collapsible
  age-group format guide (see below) with a one-tap "Suggest format &
  playing-time standard" button that reads your age group and fills in
  the squad format, match length, *and* the minimum playing time standard
  for you — the guide table's own "Min Play%" column shows what each band
  gets. Changing squad format (e.g.
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
  - **Automatic backups** — on top of the manual button, Boot Room snapshots a
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
    (e.g. `bootroom-backup.json` in Documents) and Boot Room silently overwrites
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
- **Help & How-To** — an in-app guide (❓ icon on the Dashboard, or the link
  at the top of Settings) covering getting started, running a live match,
  fair play, keeping data safe, and troubleshooting, so a coach doesn't
  need to read this README to use the app day-to-day.

## Age-group formats (DDSL / FAI Player Development Plan)

Settings includes a reference table of playing formats by age group, based
on the FAI Player Development Plan that DDSL and most Irish schoolboy/
schoolgirl leagues build their own rules on: 4v4 (no keeper) at U7, 5-a-side
at U8–U9, 7-a-side at U10–U11, 9-a-side at U12, and 11-a-side from U13 up,
each with its own match length, pitch size, and minimum playing time
standard (the table's "Min Play%" column). The U13/U14+ figures come
directly from the FAI's own published minimum-minutes guidance for those
bands, converted to a percentage of that band's total match length; U7–U12
(the FAI's development phase, where the guidance is that younger players
need *more* guaranteed time, not less) carries the ~50% figure that's the
common general benchmark for equal playing time at that age.

Worth knowing: this session's network policy blocked direct access to
ddsl.ie, so the table is sourced from the public FAI plan and reporting
about DDSL rather than DDSL's own rule book (which is linked from
[ddsl.ie](https://ddsl.ie/) if you want to check the current one directly)
— DDSL has in the past run U11/U12 differently from the standard FAI
format, so it's worth confirming your age group's exact rules (including
its exact playing-time policy) with your league before relying on the
suggestion.

## Project structure

```
index.html
css/styles.css
js/
  main.js          entry point + hash router
  store.js         in-memory state + localStorage persistence + pub/sub
  seed.js          sample data
  formations.js    default formation shapes per squad size + custom-
                   formation builder (evenly-laid-out DEF/MID/FWD counts)
  ageFormats.js    DDSL/FAI age-group format reference + suggestion logic
  starterDrills.js ~45 curated real drills (name/description/link/tags/
                   ageGroups, a dozen with an inline-SVG diagram) loaded
                   in one tap via the Drill Library's "📚 Load Starter
                   Drill Pack" button
  importRoster.js  CSV/Excel parsing + header-alias mapping for bulk import
  errorLog.js      on-device uncaught-error capture for Settings > Diagnostics
  rules.js         "keep at least one on the pitch" pair-rule checking
  subPlan.js       manual Substitution Plan — shared list/form UI used by
                   both the pre-match Squad tab and the live match tracker
  trainingGroups.js clusters players by skill stream into training groups
                   (opposite goal from balanceTeams.js's even spread)
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
    training.js    Training list/detail: attendance, groups, session planner
    drills.js      Drill Library: CRUD + weblink/PDF/image attachments,
                   with a storage-quota pre-check before saving
    stats.js       leaderboard, history, head-to-head
    settings.js
    help.js
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
