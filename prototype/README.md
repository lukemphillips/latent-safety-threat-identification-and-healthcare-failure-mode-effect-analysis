# Trauma Documentation App — Prototype

A working, click-through prototype of the app described in the project plan (see
the `Trauma_App_Project_Plan` docx/PDF and published artifact). It implements
the full six-stage workflow, the cross-cutting clinical modules, a live team
display, an admin panel, and a printable trauma record — enough to walk a
clinician or IT stakeholder through the real interaction, not just look at it.

## Running it

No build step and no package installs (this environment has no network access
to npm/pip registries, so the prototype is plain HTML/CSS/JS with zero
dependencies). From this folder:

```bash
python3 -m http.server 8000
```

Then open two browser windows, side by side or on two monitors:

- `http://localhost:8000/index.html` — the scribe's touch-input view (the cart PC touchscreen)
- `http://localhost:8000/display.html` — the team display (the HDMI monitor), or use the
  "Open team display" button in the app instead of opening it manually

**Demo login:** `admin` / `mater2026` (seeded automatically on first run — see
"Security note" below).

## What's implemented

- **Pre-Alert → Handover (ATMIST) → Primary Survey (ABCDE) → Secondary Survey →
  Imaging → Disposition**, matching the plan's §6 field-by-field spec, including
  the additions from this round: call type, suspected injuries, team
  attendance & roles, medications, point-of-care blood gas, and the simplified
  imaging (plain-film findings + CT order list + time-to-CT).
- **Cross-cutting modules** (§7): vitals & timeline, interventions log,
  medications, blood products/MTP tracker (with a pulsing "MTP ACTIVE"
  indicator), point-of-care blood gas, team attendance — all reachable from a
  persistent "Quick actions" bar on every stage, because real resuscitations
  don't proceed strictly in order.
- **Team display** (§8): a read-only second window showing live vitals &
  timeline, blood/MTP status, and patient/injuries/interventions — synced
  instantly via the browser's `BroadcastChannel` API, which is the same
  single-PC, no-network mechanism described in §10.1 (this prototype just
  proves the concept with two browser windows instead of two physical
  monitors on one Windows box).
- **Admin panel** (§10.4): add/disable user accounts, and add/remove entries
  in the Interventions and Medications quick-pick lists, per this round's request.
- **Printable record** (§9): finalising disposition opens a formatted,
  print-ready trauma record (use the browser's Print → Save as PDF) built
  from the same structured data and event timeline.
- **Event-sourced timeline** (§11): every vitals reading, drug, intervention,
  blood product and team-attendance entry is a discrete, timestamped,
  attributed event you can review or remove from the Timeline tab — the same
  audit-trail model the plan specifies for the real record.

## What's deliberately not implemented (prototype scope)

- **Security:** passwords are hashed with SHA-256 (browser `SubtleCrypto`,
  no salt) and stored in `localStorage` alongside the clinical data — fine to
  demonstrate the *interaction*, not remotely adequate for real patient data
  or real credentials. The plan's §10.4 production design (salted hashing,
  proper session handling, a real backend) still stands.
- **Persistence:** state lives in the browser's `localStorage`, not a backend
  database with hospital-network backup (§10.1–10.2). Clearing browser data
  clears the case.
- **Word/PDF generation:** the printable record uses the browser's native
  print-to-PDF rather than server-side `.docx`/PDF templating — good enough to
  evaluate the *layout and content*, not the final production mechanism.
- **Body-map diagrams, GCS calculator visuals, monitor integration:** the plan
  calls for tap-based body-region diagrams and a visual GCS calculator; this
  prototype uses simpler tile/text equivalents to keep the build scoped.
- **TraumaDoc field alignment:** built from this plan's field list, not the
  actual TraumaDoc proforma (which — per §3 of the plan — could not be
  retrieved in this session). Once a real copy is obtained from Mater ED or
  NOCA, the field set here should be reconciled against it.

## File map

```
index.html       Scribe app shell (login, stage nav, forms)
display.html     Team display (second screen)
js/store.js      Shared state: event timeline, record fields, users, config
js/app.js        Scribe app logic, stage renderers, modals, admin panel, record view
js/display.js    Team display rendering
css/styles.css   Shared design system (touch-friendly, same palette as the plan)
```
