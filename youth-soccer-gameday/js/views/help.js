export function renderHelp(app) {
  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Help &amp; How-To</h1>
        <div class="sub">A quick guide to running a season with Boot Room</div>
      </div>
    </div>

    ${section('🚀 Getting started', `
      <ol class="stack" style="margin:0; padding-left:18px;">
        <li><a href="#/settings">Settings</a> — set your team name, age group, and format. "Suggest format &amp; playing-time standard for this age group" fills in a sensible squad size, match length, and minimum playing time standard for you, based on the FAI/DDSL guide below it.</li>
        <li><a href="#/roster">Roster</a> — add players one at a time, or use <strong>Import</strong> to bulk-add from a spreadsheet (a template is offered in the import dialog; tick "Import this whole list as guest players" to bring in a visiting team's roster in one go, with a shared team name). Marking a player as a <strong>👥 Guest</strong> (in their Add/Edit form, or via Import) is for combining with another team for a joint training session — a guest shows up for Training attendance, groups, and small-sided matches, but never in Schedule, RSVP, a game's Squad/Lineup, Live Game, squad rules, Balance Teams, or Stats, since they're not actually part of your team for real fixtures.</li>
        <li><a href="#/schedule">Schedule</a> — add your first game. Each game can override the team's default match length, or you can add a same-day second match right from this form.</li>
      </ol>
    `)}

    ${section('📋 Before a match', `
      <p class="muted small mt-0">On a game's page:</p>
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>RSVP tab</strong> — optional. Track who's said they're In/Maybe/Out ahead of time, if you collect that. Skip it entirely if you don't need it.</li>
        <li><strong>Squad tab</strong> — the fast path on match day: tap players to mark them present, then build the lineup by tapping a pitch position and a player. "Use RSVP List" marks everyone who said they're In as present in one tap.</li>
        <li>Playing two matches back-to-back or at once? Use <strong>+ Add Match Day Opponent</strong> on the game page to set up the second one, prefilled with the same match length.</li>
        <li>Want to plan your rotations ahead of kickoff rather than deciding on the fly? The <strong>📋 Substitution Plan</strong> at the bottom of the Squad tab lets you write out "this player on for that player at minute X" as many times as you like before the match even starts — it carries straight over into the live match once you start the game.</li>
      </ul>
    `)}

    ${section('⚽ Running a live match', `
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li>Tap <strong>▶ Start Game</strong> from the game page, then <strong>▶ Start Clock</strong> when kickoff happens. The clock keeps running even if you switch screens.</li>
        <li>Log goals and GK saves with the buttons on the live screen. Every on-field player (and the goalkeeper) also has a removal button — "Card / Remove" if Cards are enabled in Settings, or "Remove from Match" if not — that opens a short "What happened?" menu instead of a single ambiguous "Send Off": 🟨 Yellow (stays on), 🟥 Red, 🚑 Injury, or Other reason (Cards off just offers Injury/Other, since there's nothing to log). Anything other than a first yellow takes them off the pitch and out of the bench pool immediately — they can never be picked for a sub again this match. A <strong>second yellow card for the same player is applied automatically</strong> as a send-off the moment you log it, with a clear heads-up message, rather than leaving you to notice and remove them yourself.</li>
        <li>Sent someone off by mistake, or an injured player is actually fine to keep going? A <strong>↩️ Recover</strong> button sits next to every name in the "Sent Off" list. It tells you why they're currently out (injury, red card, second yellow, etc.) and always makes them available for subs again — tick "This was logged by mistake" to also erase the wrong card/send-off from the record entirely (a bad second yellow removes just that one card, leaving a genuine first yellow in place), or leave it unticked for a real injury that's since cleared up, which keeps the original entry and just adds a "Back available" note.</li>
        <li>To sub a player, tap someone on the bench, then tap who they're swapping with on the pitch (or "Add to Pitch" if there's a spare spot).</li>
        <li>If <strong>Equal playing time policy</strong> is on (Settings), a fair-play banner suggests who to bring on/off, and a "🔜 Coming up" bar previews the next couple of swaps before they're actually due — so you can tell a player to get ready.</li>
        <li>The <strong>📋 Substitution Plan</strong> — your own manual rotation schedule, either set up before kickoff or built as you go — shows every planned swap with a "due in…" countdown (or "⏰ Due now" once its minute arrives) and a one-tap <strong>✅ Sub Now</strong> button that makes the actual substitution for you. It never subs anyone on its own — it's purely a reminder of your own plan, so you can add, edit, or delete entries any time, live or not. Each bench player also shows their own "🕐 due" line under their card when they're next up in the plan.</li>
        <li><strong>End Game</strong> finishes the match (works fine mid-period too, for an early end). <strong>End & Next</strong> appears once a same-day second match exists, and carries fair-play minutes over so the whole day stays balanced, not just one match.</li>
      </ul>
    `)}

    ${section('⚖️ Fair play &amp; substitutions', `
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>Equal playing time policy</strong> (Settings) turns on the fair-play banner and suggestions during live games — a nudge, never an enforced rule.</li>
        <li><strong>Minimum stint</strong> (Settings, default 4 min) stops a suggestion from firing before a player's had a fair block of time on, and warns if you try to sub someone off early anyway.</li>
        <li><strong>Squad Rules</strong> (Settings) let you flag pairs of players who shouldn't both be on the bench at once (e.g. your only two keeper-capable defenders) — advisory, you can always override.</li>
        <li>If your roster has <strong>skill streams</strong> (A/B/C/D, set per player in Roster), swap suggestions prefer a like-for-like replacement where the bench allows it, and try not to leave two players from the same stream resting at once.</li>
      </ul>
    `)}

    ${section('🏆 After the match', `
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li>Set <strong>Captain</strong> and <strong>Player of the Match</strong> from the game's page, any time.</li>
        <li><strong>Player of the Week</strong> (Stats page) groups completed games into Monday-to-Sunday weeks and lets you pick one or more standout players once that week's matches are done.</li>
        <li><strong>Stats</strong> has a sortable leaderboard, full match history, and head-to-head records per opponent — tap a column heading to sort by it. Alongside match attendance ("Match Att%"), the leaderboard also shows <strong>Trn Att%</strong> — the share of training sessions each player has actually attended, out of every session where attendance was taken. If a minimum playing time standard is set in Settings, a <strong>PT%</strong> column also appears: each player's share of the total match minutes available to them (across matches they were present for), with a ⚠️ next to anyone currently below that standard. A separate "🧤 Goalkeeper Appearances" table breaks down how many times each player has gone in goal, by which half (or quarter, etc.) they kept for, plus a season total — it only shows up once someone's actually played in goal.</li>
      </ul>
    `)}

    ${section('🏃 Training sessions', `
      <p class="muted small mt-0">The <a href="#/training">Training</a> tab is separate from match day — use it to plan practices.</p>
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>+ Add Training</strong> creates a session with a date, time, and location.</li>
        <li><strong>Attendance tab</strong> — tap players to mark who's actually shown up, same as a game's Squad tab.</li>
        <li><strong>Groups tab</strong> — <strong>Same stream</strong> mode clusters players of similar skill stream together, so each group can be coached at its own level; leave "Number of groups" blank for one group per stream present, or set a number to merge or split streams to fit, and "⚖️ Balance numbers across groups" (on by default) evens out sizes afterward, moving a player to a neighboring group where needed. <strong>Mixed ability</strong> mode does the opposite — same as Balance Teams, it spreads every skill stream evenly across however many groups you set, so each one gets a fair cross-section rather than similar players together; useful for stations built around mixed-ability play (older players helping younger ones, say), or just to vary things up. Tap <strong>Auto-Build Groups</strong> to build (or rebuild) either way. If a group still ends up wrong for what you want, tap a player to select them, then tap "Move here" on another group to move them across by hand.</li>
        <li><strong>Plan tab</strong> — build a running order of blocks (warm-up, drills, scrimmage, etc.), each with a duration. A block can be one activity for the whole squad, or a different activity per group, run in parallel. Each activity field has a "📚 Fill from Drill Library…" dropdown to pull in a saved drill by name instead of typing it fresh every time. The tab shows a running total time and an estimated finish time. This is a static plan to work from — there's no live countdown clock.</li>
        <li><strong>Rotating stations</strong> — tick "Rotate groups through each activity" on a grouped block to run it as a circuit: every group works through every station in turn rather than staying on just one. The minutes field becomes "per rotation," and the block's total time (and the session's running total) automatically scales up to minutes × number of stations, since that's how long it actually takes for every group to get through all of them.</li>
        <li><strong>Breaks</strong> — tick "This is a break" on a block for a water/rest stop; it shows a ☕ marker and skips the activity-type/groups fields, just a duration and an optional note.</li>
        <li><strong>+ Add Drill</strong> is reachable from the Training list and from any training session's page (not just the Drill Library itself), so a drill idea that comes up mid-planning can be saved without losing your place.</li>
        <li><strong>▶ Start Session</strong> (Plan tab) turns the static plan into a live countdown timer: a big clock counts down the current block, an order-of-play list shows what's done/current/upcoming, and ⏸ Pause / ▶ Resume, ⏮ Previous, and ⏭ Skip controls let you adjust on the fly (a pause genuinely stops the clock — nothing ticks while paused). A chime/vibration fires whenever the timer rolls into a new block, same alert used for substitution reminders in a live match, so you get a heads-up even if you're not staring at the screen. Moving into a rotation block shows exactly which station each group is on right now and counts down that leg specifically. ⏹ End Session stops the timer without touching the saved plan — start it again any time. A session that's live shows a 🔴 LIVE tag on the Training list.</li>
        <li><strong>📋 Copy to Share</strong> (top of any training session's page) copies the whole session — attendance, groups, match teams, and the full plan — as plain text, ready to paste into a WhatsApp message or text to another coach. On a phone that supports it, "📤 Text / Share…" opens the native share sheet directly instead.</li>
      </ul>
    `)}

    ${section('⚽ Small-sided matches', `
      <p class="muted small mt-0">The <strong>Matches</strong> tab on a training session sets up who plays who for a scrimmage — a different concept from the Groups tab's coaching stations.</p>
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li>Pick a number of teams and tap <strong>Build Match Teams</strong>. <strong>Randomize Again</strong> re-rolls the split. The most teams you can make is set by who's actually here — enough for every team to have at least 2 players.</li>
        <li><strong>Same stream</strong> clusters similar-ability players onto the same team — handy for running two matches side by side at different intensities. <strong>Mixed ability</strong> spreads every skill stream evenly across all teams instead, for one fair, competitive match.</li>
        <li>Match teams are separate from coaching Groups and from the Plan — set them up independently, and they show up in Copy to Share alongside everything else.</li>
      </ul>
    `)}

    ${section('📚 Drill Library', `
      <p class="muted small mt-0">A reusable collection of drills, separate from any one session — linked from the top of the Training page.</p>
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>📚 Load Starter Drill Pack</strong> — one tap adds around 45 ready-made drills covering warm-ups, passing, dribbling, shooting, defending, possession, small-sided games, fitness, goalkeeping, set pieces and fun games, each with a real coaching video link and an age-group tag already set. A dozen of them also come with a simple built-in diagram (cone/player layout) — not every drill needs one, so most rely on the video alone. Safe to click more than once — anything already in your library (matched by name) is skipped, so it only ever adds what's missing.</li>
        <li><strong>+ Add Drill</strong> — a name, an optional description, age groups, tags, an optional weblink (a video or article), and an optional attached PDF or image (a diagram, say).</li>
        <li><strong>Age groups</strong> — tap one or more of the six standard bands (U7, U8-U9, U10-U11, U12, U13, U14+, matching the age-format reference on the Team Settings page) so a drill can be filtered to just the ages it suits.</li>
        <li><strong>Tags</strong> — a set of common categories (Warm-up, Passing, Shooting, Defending, Small-Sided Games, and more) to tap on, plus "+ Add Tag" for anything of your own. Tap a tag in the library to filter the list down to drills tagged with it.</li>
        <li>The library has two filter rows — <strong>Age group</strong> and <strong>Category</strong> — that combine together (picking an age group and a category shows only drills matching both), and the search box also matches age-group text (e.g. typing "U10" finds anything tagged for that band).</li>
        <li>Uploaded images are resized automatically; PDFs are capped at around 1.5MB. Everything here is stored on this device alongside your team data, which has much less room than a normal file system — a weblink costs nothing, so prefer that for anything large or already hosted somewhere.</li>
        <li>If an attachment won't fit, Boot Room tells you rather than silently failing or corrupting other data — remove the attachment and use a link instead, or free up space.</li>
        <li>When building a session's Plan, each activity field can pull a drill's name straight in via its "📚 Fill from Drill Library…" dropdown.</li>
        <li>Tap a drill's attachment name to view it — opens in a new tab (an image displays directly; a PDF opens in your browser's PDF viewer).</li>
        <li>A drill with an attachment also gets a "📤 Share / Download" button — on a phone that supports it, this opens the native share sheet with the actual image or PDF attached (so it can go straight into WhatsApp or Messages); everywhere else it downloads the file instead so you can attach it manually.</li>
        <li><strong>📦 Export ZIP</strong> bundles every drill (including attachments, as real files rather than embedded text) into one .zip file to hand to another coach; that coach uses <strong>📦 Import ZIP</strong> on their own device to load them straight into their Drill Library. Needs an internet connection the first time (it loads a small ZIP library from a CDN).</li>
      </ul>
    `)}

    ${section('💾 Keeping your data safe', `
      <p class="muted small mt-0">Everything in Boot Room lives only in this browser, on this device — no account, no server, nothing sent anywhere. That's good for privacy, but it does mean a private/incognito window, a device clearing its storage, or a different browser or device starts from empty. A few layers protect against that:</p>
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>Automatic backups</strong> — Boot Room snapshots a backup by itself every time a match finishes, no action needed (Settings &gt; Data shows the 5 most recent, each with a one-tap Restore).</li>
        <li><strong>Backup Team Data</strong> — copies everything to your clipboard on demand; paste it somewhere safe (Notes, an email to yourself). <strong>Restore from Backup</strong> pastes it back in.</li>
        <li><strong>A downloaded file</strong> also saves automatically after every match, on any device/browser — check your Downloads.</li>
        <li><strong>A single self-updating file</strong> — on a desktop/laptop in Chrome or Edge only, pick a file location once and Boot Room keeps overwriting that same file after every match, instead of a new dated file each time. This doesn't work on iPhone or iPad in any browser — Apple requires every iOS browser to use the same engine underneath, which doesn't support this. The downloaded file above is the one that works on phones.</li>
        <li><strong>Merge in Another Coach's Backup</strong> — for one team running two simultaneous matches, each tracked on a different phone. Share the other coach's Backup any way you like (a synced cloud folder, AirDrop, a message), then paste it in here to combine both matches together without losing either one.</li>
      </ul>
      <p class="muted small">Get in the habit of backing up before a big change, and whenever you're not sure the data will still be there next time.</p>
    `)}

    ${section('🛠️ Troubleshooting', `
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>My team/roster disappeared</strong> — open Settings; if an automatic backup exists on this device, the Dashboard offers to restore it. Otherwise check Settings &gt; Data for a manual backup you copied earlier, or a downloaded backup file.</li>
        <li><strong>The self-updating file button isn't there / doesn't work on my phone</strong> — expected on iPhone/iPad (see above) and on Firefox. Use the downloaded file or the automatic on-device backup instead.</li>
        <li><strong>Something's misbehaving</strong> — Settings &gt; Diagnostics captures errors automatically on this device. Copy the log and send it to whoever maintains the app.</li>
      </ul>
    `)}
  `;
}

function section(title, bodyHtml) {
  return `
    <details class="card">
      <summary style="cursor:pointer; font-weight:700; font-size:15px;">${title}</summary>
      <div style="margin-top:10px;">${bodyHtml}</div>
    </details>
  `;
}
