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
        <li><a href="#/settings">Settings</a> — set your team name, age group, and format. "Suggest format for this age group" fills in a sensible squad size and match length for you.</li>
        <li><a href="#/roster">Roster</a> — add players one at a time, or use <strong>Import</strong> to bulk-add from a spreadsheet (a template is offered in the import dialog).</li>
        <li><a href="#/schedule">Schedule</a> — add your first game. Each game can override the team's default match length, or you can add a same-day second match right from this form.</li>
      </ol>
    `)}

    ${section('📋 Before a match', `
      <p class="muted small mt-0">On a game's page:</p>
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li><strong>RSVP tab</strong> — optional. Track who's said they're In/Maybe/Out ahead of time, if you collect that. Skip it entirely if you don't need it.</li>
        <li><strong>Squad tab</strong> — the fast path on match day: tap players to mark them present, then build the lineup by tapping a pitch position and a player. "Use RSVP List" marks everyone who said they're In as present in one tap.</li>
        <li>Playing two matches back-to-back or at once? Use <strong>+ Add Match Day Opponent</strong> on the game page to set up the second one, prefilled with the same match length.</li>
      </ul>
    `)}

    ${section('⚽ Running a live match', `
      <ul class="stack" style="margin:0; padding-left:18px;">
        <li>Tap <strong>▶ Start Game</strong> from the game page, then <strong>▶ Start Clock</strong> when kickoff happens. The clock keeps running even if you switch screens.</li>
        <li>Log goals, GK saves, and send-offs (or cards, if enabled in Settings) with the buttons on the live screen.</li>
        <li>To sub a player, tap someone on the bench, then tap who they're swapping with on the pitch (or "Add to Pitch" if there's a spare spot).</li>
        <li>If <strong>Equal playing time policy</strong> is on (Settings), a fair-play banner suggests who to bring on/off, and a "🔜 Coming up" bar previews the next couple of swaps before they're actually due — so you can tell a player to get ready.</li>
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
        <li><strong>Stats</strong> has a sortable leaderboard, full match history, and head-to-head records per opponent — tap a column heading to sort by it.</li>
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
