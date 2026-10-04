/* Read-only team display — second window on the HDMI monitor.
   Same-machine sync via BroadcastChannel/localStorage, no network involved. */

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function h(strings, ...vals) { return strings.reduce((acc, s, i) => acc + s + (vals[i] !== undefined ? vals[i] : ""), ""); }

let lastRender = 0;

(async function boot() {
  await Store.init();
  render();
  Store.onChange(() => { lastRender = Date.now(); render(); });
  setInterval(render, 1000);
})();

function mtpStatus() {
  const events = Store.state.timeline.filter((e) => e.kind === "mtp");
  if (events.length === 0) return "none";
  return events[events.length - 1].status;
}

function render() {
  const rec = Store.state.record;
  const timeline = Store.state.timeline;

  document.getElementById("d-caseid").textContent = rec.caseId ? `Case ${rec.caseId} — ${rec.patient.name || "Name not yet entered"}` : "No active case";
  document.getElementById("d-elapsed").textContent = fmtElapsed(rec.startedAt);
  document.getElementById("d-updated").textContent = "Last update: " + new Date().toLocaleTimeString("en-IE");

  // Allergy banner -- deliberately the most prominent thing on the screen.
  // This used to live only on the scribe's Secondary Survey tab; the whole
  // team needs it at a glance, not just whoever is on that tab.
  const allergyDiv = document.getElementById("d-allergy");
  const allergyText = (rec.secondary.ampleAllergies || "").trim();
  if (!allergyText) {
    allergyDiv.innerHTML = `<div class="allergy-banner unknown">ALLERGIES — not yet recorded</div>`;
  } else if (/^(nkda|nil|none|no known)/i.test(allergyText)) {
    allergyDiv.innerHTML = `<div class="allergy-banner clear">NKDA</div>`;
  } else {
    allergyDiv.innerHTML = `<div class="allergy-banner alert">ALLERGY: ${esc(allergyText)}</div>`;
  }

  // ABCDE status -- what the team is actively managing; this previously only
  // existed on the scribe's own Primary Survey tab.
  const abcdeDiv = document.getElementById("d-abcde");
  const p = rec.primary;
  const warnVals = ["Compromised", "Peri-arrest", "Absent"];
  const chip = (label, val) => `<div class="abcde-chip ${warnVals.includes(val) ? "warn" : ""}"><b>${label}</b>${esc(val || "not assessed")}</div>`;
  abcdeDiv.innerHTML = `<div class="abcde-row">${chip("Airway", p.airway)}${chip("Breathing", p.breathing)}${chip("Circulation", p.circulation)}</div>`;

  // Vitals
  const vitalsEvents = timeline.filter((e) => e.kind === "vitals").sort((a, b) => b.createdAt - a.createdAt);
  const vDiv = document.getElementById("d-vitals");
  const staleSpan = document.getElementById("d-vitals-stale");
  if (vitalsEvents.length === 0) {
    vDiv.innerHTML = `<p style="opacity:.6">No vitals recorded yet.</p>`;
    staleSpan.textContent = "";
  } else {
    const latest = vitalsEvents[0];
    const ageMin = Math.floor((Date.now() - latest.createdAt) / 60000);
    staleSpan.innerHTML = ageMin >= 5 ? `<span class="stale-tag">${ageMin}m since last reading</span>` : "";
    if (latest.cardiacArrest) {
      vDiv.innerHTML = `<div class="mtp-indicator active">CARDIAC ARREST</div><div style="opacity:.6;font-size:.85rem;margin-top:.5rem">Logged ${fmtTime(latest.ts)} · no vitals obtained</div>`;
    } else {
      vDiv.innerHTML = h`
        <div class="display-vital"><span class="l">HR</span><span>${esc(latest.hr || "–")}</span></div>
        <div class="display-vital"><span class="l">BP</span><span>${esc(latest.bpSys || "–")}/${esc(latest.bpDia || "–")}</span></div>
        <div class="display-vital"><span class="l">RR</span><span>${esc(latest.rr || "–")}</span></div>
        <div class="display-vital"><span class="l">SpO2</span><span>${esc(latest.spo2 || "–")}%</span></div>
        <div class="display-vital"><span class="l">GCS</span><span>${esc(latest.gcs || "–")}</span></div>
        ${latest.intubated ? `<div class="display-vital"><span class="l">ETCO2</span><span>${esc(latest.etco2 || "–")}</span></div>` : ""}
        <div style="opacity:.6;font-size:.85rem;margin-top:.5rem">${vitalsEvents.length} reading(s) &middot; last ${fmtTime(latest.ts)}</div>`;
    }
  }

  // Gas
  const gasEvents = timeline.filter((e) => e.kind === "gas").sort((a, b) => b.createdAt - a.createdAt);
  const gDiv = document.getElementById("d-gas");
  if (gasEvents.length === 0) {
    gDiv.innerHTML = `<p style="opacity:.6">No blood gas yet.</p>`;
  } else {
    const latest = gasEvents[0];
    gDiv.innerHTML = h`
      <div class="display-vital"><span class="l">pH</span><span>${esc(latest.ph || "–")}</span></div>
      <div class="display-vital"><span class="l">Lactate</span><span>${esc(latest.lactate || "–")}</span></div>
      <div class="display-vital"><span class="l">BE</span><span>${esc(latest.be || "–")}</span></div>`;
  }

  // Blood products / MTP
  const bloodEvents = timeline.filter((e) => e.kind === "blood");
  const bDiv = document.getElementById("d-blood");
  const status = mtpStatus();
  const label = status === "active" ? "MTP ACTIVE" : status === "standby" ? "MTP ON STANDBY" : "MTP not active";
  const totals = {};
  bloodEvents.forEach((e) => { totals[e.product] = (totals[e.product] || 0) + Number(e.units || 1); });
  bDiv.innerHTML = h`
    <div style="margin-bottom:1rem"><span class="mtp-indicator ${status === "active" ? "active" : "inactive"}">${label}</span></div>
    ${Object.keys(totals).length === 0 ? `<p style="opacity:.6">No blood products given yet.</p>` :
      Object.entries(totals).map(([k, v]) => `<div class="display-vital"><span class="l">${esc(k)}</span><span>${v} unit(s)</span></div>`).join("")}`;

  // Team roster + imaging location + injuries/interventions/medications
  const teamEvents = timeline.filter((e) => e.kind === "team");
  const latestByName = new Map();
  teamEvents.forEach((e) => latestByName.set(e.name, e)); // last write wins per name
  const roster = Array.from(latestByName.values());
  const interventions = timeline.filter((e) => e.kind === "intervention").sort((a, b) => b.createdAt - a.createdAt);
  const meds = timeline.filter((e) => e.kind === "medication").sort((a, b) => b.createdAt - a.createdAt);
  const imaging = rec.imaging;
  let locationBadge = "In resus bay";
  if (imaging.ctLeftAt && !imaging.ctReturnedAt) locationBadge = `AT CT since ${fmtTime(imaging.ctLeftAt)}`;
  else if (imaging.ctReturnedAt) locationBadge = `Returned from CT at ${fmtTime(imaging.ctReturnedAt)}`;
  const sDiv = document.getElementById("d-summary");
  sDiv.innerHTML = h`
    <p style="opacity:.85"><b>Location:</b> ${esc(locationBadge)}</p>
    <h3 style="color:#fff;font-size:1rem;margin-top:.8rem">Team</h3>
    ${roster.length === 0 ? `<p style="opacity:.6">No team members logged yet.</p>` :
      roster.map((e) => `<div style="padding:.2rem 0;border-top:1px solid rgba(255,255,255,.12)">${e.role === "Team Leader" ? "★ " : ""}<b>${esc(e.role)}</b> — ${esc(e.name)}</div>`).join("")}
    <p style="opacity:.85;margin-top:.8rem"><b>Suspected injuries:</b> ${esc(rec.preAlert.suspectedInjuries.join(", ") || "none logged")}</p>
    <p style="opacity:.85"><b>Mechanism:</b> ${esc(rec.preAlert.mechanism || rec.handover.mechanism || "—")}</p>
    <h3 style="color:#fff;font-size:1rem;margin-top:1rem">Recent interventions</h3>
    ${interventions.length === 0 ? `<p style="opacity:.6">None logged.</p>` :
      interventions.slice(0, 5).map((e) => `<div style="padding:.25rem 0;border-top:1px solid rgba(255,255,255,.12)">${fmtTime(e.ts)} — ${esc(e.name)}</div>`).join("")}
    <h3 style="color:#fff;font-size:1rem;margin-top:1rem">Recent medications</h3>
    ${meds.length === 0 ? `<p style="opacity:.6">None logged.</p>` :
      meds.slice(0, 5).map((e) => `<div style="padding:.25rem 0;border-top:1px solid rgba(255,255,255,.12)">${fmtTime(e.ts)} — ${esc(e.drug)} ${esc(e.dose)} ${esc(e.route)}</div>`).join("")}`;
}
