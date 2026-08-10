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

function mtpActive() {
  const events = Store.state.timeline.filter((e) => e.kind === "mtp");
  if (events.length === 0) return false;
  return events[events.length - 1].active;
}

function render() {
  const rec = Store.state.record;
  const timeline = Store.state.timeline;

  document.getElementById("d-caseid").textContent = rec.caseId ? `Case ${rec.caseId} — Resus bay ${rec.preAlert.bay || "?"}` : "No active case";
  document.getElementById("d-elapsed").textContent = fmtElapsed(rec.startedAt);
  document.getElementById("d-updated").textContent = "Last update: " + new Date().toLocaleTimeString("en-IE");

  // Vitals
  const vitalsEvents = timeline.filter((e) => e.kind === "vitals").sort((a, b) => b.ts - a.ts);
  const vDiv = document.getElementById("d-vitals");
  if (vitalsEvents.length === 0) {
    vDiv.innerHTML = `<p style="opacity:.6">No vitals recorded yet.</p>`;
  } else {
    const latest = vitalsEvents[0];
    vDiv.innerHTML = h`
      <div class="display-vital"><span class="l">HR</span><span>${esc(latest.hr || "–")}</span></div>
      <div class="display-vital"><span class="l">BP</span><span>${esc(latest.bp || "–")}</span></div>
      <div class="display-vital"><span class="l">RR</span><span>${esc(latest.rr || "–")}</span></div>
      <div class="display-vital"><span class="l">SpO2</span><span>${esc(latest.spo2 || "–")}%</span></div>
      <div class="display-vital"><span class="l">GCS</span><span>${esc(latest.gcs || "–")}</span></div>
      <div style="opacity:.6;font-size:.85rem;margin-top:.5rem">${vitalsEvents.length} reading(s) &middot; last ${fmtTime(latest.ts)}</div>`;
  }

  // Gas
  const gasEvents = timeline.filter((e) => e.kind === "gas").sort((a, b) => b.ts - a.ts);
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
  const active = mtpActive();
  const totals = {};
  bloodEvents.forEach((e) => { totals[e.product] = (totals[e.product] || 0) + Number(e.units || 1); });
  bDiv.innerHTML = h`
    <div style="margin-bottom:1rem"><span class="mtp-indicator ${active ? "active" : "inactive"}">${active ? "MTP ACTIVE" : "MTP not active"}</span></div>
    ${Object.keys(totals).length === 0 ? `<p style="opacity:.6">No blood products given yet.</p>` :
      Object.entries(totals).map(([k, v]) => `<div class="display-vital"><span class="l">${esc(k)}</span><span>${v} unit(s)</span></div>`).join("")}`;

  // Patient / injuries / interventions summary
  const interventions = timeline.filter((e) => e.kind === "intervention").sort((a, b) => b.ts - a.ts);
  const meds = timeline.filter((e) => e.kind === "medication").sort((a, b) => b.ts - a.ts);
  const sDiv = document.getElementById("d-summary");
  sDiv.innerHTML = h`
    <p style="opacity:.85"><b>Suspected injuries:</b> ${esc(rec.preAlert.suspectedInjuries.join(", ") || "none logged")}</p>
    <p style="opacity:.85"><b>Mechanism:</b> ${esc(rec.preAlert.mechanism || rec.handover.mechanism || "—")}</p>
    <h3 style="color:#fff;font-size:1rem;margin-top:1rem">Recent interventions</h3>
    ${interventions.length === 0 ? `<p style="opacity:.6">None logged.</p>` :
      interventions.slice(0, 6).map((e) => `<div style="padding:.25rem 0;border-top:1px solid rgba(255,255,255,.12)">${fmtTime(e.ts)} — ${esc(e.name)}</div>`).join("")}
    <h3 style="color:#fff;font-size:1rem;margin-top:1rem">Recent medications</h3>
    ${meds.length === 0 ? `<p style="opacity:.6">None logged.</p>` :
      meds.slice(0, 6).map((e) => `<div style="padding:.25rem 0;border-top:1px solid rgba(255,255,255,.12)">${fmtTime(e.ts)} — ${esc(e.drug)} ${esc(e.dose)} ${esc(e.route)}</div>`).join("")}`;
}
