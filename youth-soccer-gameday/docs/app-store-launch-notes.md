# App Store / Google Play launch notes

Working notes from an exploratory discussion about taking this app (currently
UI-branded "Boot Room") to the App Store and Google Play. Nothing here has
been acted on in code yet — this is a reference for picking it back up later.

## Packaging path

The app is a static HTML/CSS/vanilla-JS site with no backend of its own
(Cloud Sync rides on each coach's own free Google Apps Script + Sheet — see
`js/cloudSync.js` — so it costs nothing to run, no matter how many people use
it). It isn't an installable PWA yet (no `manifest.json` or service worker).

Recommended order:
1. **Add PWA basics first** — manifest, service worker, icon set. Gets
   "Add to Home Screen" on iOS/Android with zero store involvement, and is
   the foundation either packaging path below needs.
2. **Google Play** — wrap as a Trusted Web Activity via Bubblewrap or
   PWABuilder (pwabuilder.com). Upload to Google Play Console.
3. **Apple App Store** — Apple doesn't support TWAs. Use **Capacitor**
   (recommended over PWABuilder's iOS wrapper — gives a real, durable Xcode
   project rather than depending on a third-party build service, and leaves
   room to add native plugins later).

## Costs

- **Apple Developer Program:** $99/year, recurring. App is pulled from the
  Store if this lapses, even post-approval.
- **Google Play Console:** $25 one-time, no renewal.
- **Hosting (GitHub Pages):** $0.
- **Cloud Sync:** $0 — no infrastructure of ours to pay for; it's each
  coach's own Google account.
- **Store commission** (only matters if charging money): both Apple and
  Google take 15% of revenue under $1M/year (standard small-developer rate),
  30% above.
- **First-year total to be live on both stores: ~$124. After that, just the
  $99/year Apple fee** — that is the only ongoing fixed cost in this whole
  business.

## Market research

**Big team-management platforms** (TeamSnap, SportsEngine, PlayMetrics) are
subscription/club-admin tools ($9.99+/mo per team, or $79+/mo club-wide) —
built for registration, invoicing, multi-team club operations. Not real
competitors for a single coach's lineup/sub tool.

**Direct competitors** (lineup building, live substitution tracking,
playing-time stats) are small and cluster at free or near-free:
- Coach Caddie — free + IAP
- allPlay Soccer — one-time unlock, no subscription
- Teamsheet - Soccer Line Up — free, no IAP, ~5K ratings (biggest player in
  this exact niche)
- Pitchside Lineup / Pitchside Tactics — $7.99–9.99 one-time (Gaelic games /
  grassroots football)
- Who's On, Coach's Clock, FairplayFC, Easy Sport Sub Tracking — all under
  20 ratings, $0–2 one-time or near-zero annual

**Takeaway:** nobody has a dominant, well-reviewed app doing exactly
"lineup + live subs + fair playing-time tracking + stats" for youth soccer —
real gap, but also no proven subscription pricing to copy. The buyer here is
a volunteer parent spending their own money on a hobby, not a club with a
budget, so willingness-to-pay is low. A paywalled core app would likely
suppress downloads/reviews in a category where review counts are already
tiny.

## Naming

Current UI brand "**Boot Room**" has a real collision risk: The Football
Association (England's governing body) runs an established coaching
platform of the same name since 2011 (thefa.com/bootroom). Couldn't confirm
a formal trademark registration from this environment (USPTO/UK IPO
registries are network-blocked here — self-check at tmsearch.uspto.gov and
trademarks.ipo.gov.uk before deciding), but the FA's long-standing,
well-known use could create common-law trademark rights ("passing off" in
the UK) independent of registration. Worth resolving before any store
listing — cheap to rename now, costly to be forced into it later.

Screened alternatives, no exact collisions found for either:
- **Grassroots Gaffer** — favorite so far; distinct from "Gaffer: Football
  Manager" (unrelated game) and "gaffer.so" (fan-sentiment platform, not
  coaching).
- **Coach Box** — distinct from "CoachBoard Pro" (similar product category,
  Kickstarter-stage, worth more separation if chosen).
- Also considered: Grassroots Coachbox (combines both), EvenTime /
  EqualMinutes (leans into the fair-playing-time differentiator), Benchly,
  Subhuddle, Rosterly.

**Rejected as already-taken-in-niche:** TeamSheet, Pitchside, Touchline,
Dugout, Matchday, Sideline — all real, similar soccer coaching/lineup apps.

**Decision pending:** leaning toward "Grassroots Gaffer." Not yet applied to
the codebase (title, manifest, README, icon badge letter all still say
"Boot Room").

## Business model

**Recommendation:** keep the core app free forever (lineups, subs, stats,
training groups). Monetize via an annual subscription gating **Cloud Sync**
specifically (multi-device sync + season backup) with a free trial (e.g. one
season / 90 days) — freemium on "don't lose your data / sync across
devices," not a paywall on the tool itself. Fits the low willingness-to-pay
in this niche far better than gating core features.

Since Cloud Sync has zero marginal infrastructure cost to us, pricing only
needs to clear the fixed $99/year Apple fee — everything past that is
profit.

**Profit at 100 paying subscribers**, by price (after 15% store cut, same
rate on both stores under $1M/year):

| Price | Gross | Net (after 15% cut) | Year 1 profit (minus $99 Apple + $25 Google) | Year 2+ profit (minus $99 only) |
|---|---|---|---|---|
| $4.99/yr | $499 | $424.15 | $300.15 | $325.15 |
| $9.99/yr | $999 | $849.15 | $725.15 | $750.15 |
| $14.99/yr | $1,499 | $1,274.15 | $1,150.15 | $1,175.15 |

**Recommended price: $4.99/year**, given the competitive set clusters at
free/near-free. Breakeven on the one real fixed cost (~$99/year Apple fee)
needs only ~24 paying subscribers at this price — a low bar even for a
niche app with modest traction. Note: 100 *paying* subscribers typically
implies several times that in downloads (free-trial-to-paid conversion is
realistically ~2–10% for this kind of app), so the more realistic read is
1,000–5,000 downloads to reach 100 paying subscribers, not 100 downloads.

## Open items / next steps

- [ ] Decide final app name (Grassroots Gaffer vs. alternatives) and rename
      across the app.
- [ ] Self-check USPTO/UK IPO registries for "Boot Room" and the chosen
      replacement name before committing to a store listing.
- [ ] Add PWA manifest + service worker + icon set (dev branch).
- [ ] Set up Capacitor project for iOS; Bubblewrap/PWABuilder for Android.
- [ ] Decide whether/when to build the subscription paywall around Cloud
      Sync (StoreKit / Play Billing) — bigger lift than the pure web
      changes so far, only worth it once the rename + PWA groundwork is
      settled.
- [ ] Draft App Store / Play listing copy (name, subtitle, description,
      keywords, screenshots) once naming is final.
