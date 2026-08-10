/* Main scribe-facing app: login, stage navigation, forms, cross-cutting modules. */

const STAGES = [
  { id: "prealert", label: "Pre-Alert" },
  { id: "handover", label: "Handover" },
  { id: "primary", label: "Primary Survey" },
  { id: "secondary", label: "Secondary Survey" },
  { id: "imaging", label: "Imaging" },
  { id: "disposition", label: "Disposition" },
  { id: "timeline", label: "Timeline" },
];

let currentStage = "prealert";
let clockTimer = null;

function h(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (vals[i] !== undefined ? vals[i] : ""), "");
}
function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function byId(id) { return document.getElementById(id); }

// ---------------- Boot ----------------
(async function boot() {
  await Store.init();
  const user = CurrentUser.get();
  if (user) {
    showApp();
  } else {
    byId("login-screen").style.display = "flex";
  }
  wireLogin();
})();

function wireLogin() {
  byId("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = byId("login-username").value.trim();
    const password = byId("login-password").value;
    const user = await Store.authenticate(username, password);
    if (!user) {
      byId("login-error").innerHTML = `<div class="error-msg">Incorrect username or password.</div>`;
      return;
    }
    CurrentUser.set(user);
    showApp();
  });
}

function showApp() {
  byId("login-screen").style.display = "none";
  byId("app-shell").style.display = "flex";
  const user = CurrentUser.get();
  byId("user-name-label").textContent = `${user.displayName} (${user.role})`;
  byId("btn-admin").style.display = user.role === "admin" ? "inline-block" : "none";

  byId("btn-logout").addEventListener("click", () => { CurrentUser.clear(); location.reload(); });
  byId("btn-new-case").addEventListener("click", onNewCase);
  byId("btn-team-display").addEventListener("click", () => {
    window.open("display.html", "traumaTeamDisplay", "width=1400,height=900");
  });
  byId("btn-admin").addEventListener("click", () => openAdmin());

  renderStageNav();
  renderStage();
  startClock();

  Store.onChange(() => { renderStageNav(); renderStage(); });
}

function onNewCase() {
  if (Store.state.record.caseId && !confirm("Start a new case? The current record stays in local storage but the on-screen form will reset.")) return;
  Store.startNewCase();
  currentStage = "prealert";
  renderStageNav();
  renderStage();
}

function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    byId("clock").textContent = fmtElapsed(Store.state.record.startedAt);
    const rec = Store.state.record;
    byId("case-id-label").textContent = rec.caseId ? `Case ${rec.caseId}` : "No active case";
  }, 1000);
}

function renderStageNav() {
  const nav = byId("stage-nav");
  nav.innerHTML = STAGES.map((s, i) => h`
    <button class="${currentStage === s.id ? "active" : ""}" data-stage="${s.id}">
      <span class="n">${i + 1}</span>${esc(s.label)}
    </button>`).join("");
  nav.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => { currentStage = btn.dataset.stage; renderStage(); });
  });
}

function currentUserName() {
  const u = CurrentUser.get();
  return u ? u.displayName : "unknown";
}

function renderStage() {
  const area = byId("main-area");
  if (!Store.state.record.caseId && currentStage !== "timeline") {
    area.innerHTML = `<div class="card"><p>No active case yet.</p><button class="btn" id="start-case-btn">Start new case</button></div>`;
    byId("start-case-btn").addEventListener("click", onNewCase);
    return;
  }
  const renderers = {
    prealert: renderPreAlert, handover: renderHandover, primary: renderPrimary,
    secondary: renderSecondary, imaging: renderImaging, disposition: renderDisposition,
    timeline: renderTimeline,
  };
  area.innerHTML = renderers[currentStage]();
  wireStage(currentStage);
}

// ---------------- Quick-action bar (cross-cutting modules) ----------------
function quickActionsBar() {
  return h`
  <div class="card">
    <h4>Quick actions</h4>
    <div class="btn-row">
      <button class="btn secondary" data-qa="vitals">+ Vitals</button>
      <button class="btn secondary" data-qa="gas">+ Blood gas</button>
      <button class="btn secondary" data-qa="med">+ Medication</button>
      <button class="btn secondary" data-qa="intervention">+ Intervention</button>
      <button class="btn secondary" data-qa="blood">+ Blood product</button>
      <button class="btn secondary" data-qa="team">+ Team member</button>
    </div>
  </div>`;
}
function wireQuickActions(root) {
  root.querySelectorAll("[data-qa]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.qa;
      if (kind === "vitals") openVitalsModal();
      if (kind === "gas") openGasModal();
      if (kind === "med") openMedicationModal();
      if (kind === "intervention") openInterventionModal();
      if (kind === "blood") openBloodProductModal();
      if (kind === "team") openTeamModal();
    });
  });
}

// ---------------- Field binding helper ----------------
function bindField(root, section, key, selector) {
  const el = root.querySelector(selector);
  if (!el) return;
  const ev = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
  el.addEventListener(ev, () => {
    Store.updateRecord(section, { [key]: el.value });
  });
}
function bindTiles(root, groupSelector, onToggle) {
  root.querySelectorAll(groupSelector).forEach((tile) => {
    tile.addEventListener("click", () => onToggle(tile.dataset.val, tile));
  });
}

// ================= PRE-ALERT =================
function renderPreAlert() {
  const r = Store.state.record.preAlert;
  const mechanisms = ["RTC", "Fall >2m", "Fall <2m", "Stab", "GSW", "Blunt", "Burn", "Other"];
  const injuries = ["Head", "Face", "Neck/C-spine", "Chest", "Abdomen", "Pelvis", "Spine", "Upper limb", "Lower limb", "External haemorrhage", "Burns"];
  const criteriaList = ["SBP <90", "RR <10 or >29", "GCS <13", "Penetrating injury", "Two+ proximal long-bone fractures", "Amputation", "Suspected spinal injury", "Major burn"];
  return h`
    <div class="card">
      <h2>Pre-Alert</h2>
      <div class="grid-3">
        <div class="field"><label>Time of call</label><input type="text" value="${esc(r.timeOfCall ? fmtTime(r.timeOfCall) : "not set")}" disabled></div>
        <div class="field"><label>Call type</label>
          <div class="tiles" id="calltype-tiles">
            ${["Hospital major trauma call-out", "ED trauma team call-out"].map((v) => h`<button type="button" class="tile ${r.callType === v ? "selected" : ""}" data-val="${esc(v)}">${esc(v)}</button>`).join("")}
          </div>
        </div>
        <div class="field"><label>Source</label>
          <select id="pa-source">
            <option value="">— select —</option>
            ${["NAS ambulance", "Other hospital transfer", "Garda", "Self-presenting"].map((v) => h`<option ${r.source === v ? "selected" : ""}>${esc(v)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="grid-3">
        <div class="field"><label>ETA</label><input type="text" id="pa-eta" placeholder="e.g. 8 min" value="${esc(r.eta)}"></div>
        <div class="field"><label>Age (estimated)</label><input type="text" id="pa-age" value="${esc(r.age)}"></div>
        <div class="field"><label>Sex</label>
          <select id="pa-sex"><option value="">—</option>${["M", "F", "Unknown"].map((v) => h`<option ${r.sex === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
        </div>
      </div>
      <div class="field"><label>Mechanism of injury (provisional)</label>
        <div class="tiles" id="mech-tiles">${mechanisms.map((m) => h`<button type="button" class="tile" data-val="${esc(m)}" data-group="mech">${esc(m)}</button>`).join("")}</div>
      </div>
      <div class="field"><label>Suspected injuries (provisional)</label>
        <div class="tiles" id="inj-tiles">${injuries.map((v) => h`<button type="button" class="tile ${r.suspectedInjuries.includes(v) ? "selected" : ""}" data-val="${esc(v)}">${esc(v)}</button>`).join("")}</div>
      </div>
      <div class="field"><label>Pre-alert criteria met</label>
        <div class="tiles" id="crit-tiles">${criteriaList.map((v) => h`<button type="button" class="tile ${r.criteria.includes(v) ? "selected" : ""}" data-val="${esc(v)}">${esc(v)}</button>`).join("")}</div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Team activated (grade)</label><input type="text" id="pa-grade" value="${esc(r.teamGrade)}" placeholder="Full trauma team / modified"></div>
        <div class="field"><label>Bay / resus room</label><input type="text" id="pa-bay" value="${esc(r.bay)}" placeholder="e.g. Resus 1"></div>
      </div>
    </div>
    ${quickActionsBar()}`;
}
function wirePreAlert(root) {
  bindField(root, "preAlert", "eta", "#pa-eta");
  bindField(root, "preAlert", "age", "#pa-age");
  bindField(root, "preAlert", "sex", "#pa-sex");
  bindField(root, "preAlert", "source", "#pa-source");
  bindField(root, "preAlert", "teamGrade", "#pa-grade");
  bindField(root, "preAlert", "bay", "#pa-bay");
  root.querySelectorAll("#calltype-tiles .tile").forEach((t) => t.addEventListener("click", () => {
    Store.updateRecord("preAlert", { callType: t.dataset.val, timeOfCall: Store.state.record.preAlert.timeOfCall || Date.now() });
  }));
  root.querySelectorAll('[data-group="mech"]').forEach((t) => t.addEventListener("click", () => {
    Store.updateRecord("preAlert", { mechanism: t.dataset.val });
  }));
  root.querySelector("#inj-tiles").addEventListener("click", (e) => {
    const btn = e.target.closest(".tile"); if (!btn) return;
    const set = new Set(Store.state.record.preAlert.suspectedInjuries);
    set.has(btn.dataset.val) ? set.delete(btn.dataset.val) : set.add(btn.dataset.val);
    Store.updateRecord("preAlert", { suspectedInjuries: Array.from(set) });
  });
  root.querySelector("#crit-tiles").addEventListener("click", (e) => {
    const btn = e.target.closest(".tile"); if (!btn) return;
    const set = new Set(Store.state.record.preAlert.criteria);
    set.has(btn.dataset.val) ? set.delete(btn.dataset.val) : set.add(btn.dataset.val);
    Store.updateRecord("preAlert", { criteria: Array.from(set) });
  });
}

// ================= HANDOVER =================
function renderHandover() {
  const r = Store.state.record.handover;
  return h`
    <div class="card">
      <h2>Handover (ATMIST)</h2>
      <div class="grid-2">
        <div class="field"><label>A — Age / Name / ID</label><input type="text" id="ho-id" value="${esc(r.identifiers)}"></div>
        <div class="field"><label>T — Time of injury / onset</label><input type="text" id="ho-time" value="${esc(r.timeOfInjury)}" placeholder="HH:MM or 'unknown'"></div>
      </div>
      <div class="field"><label>M — Mechanism</label><textarea id="ho-mech">${esc(r.mechanism)}</textarea></div>
      <div class="field"><label>I — Injuries identified</label><textarea id="ho-inj">${esc(r.injuries)}</textarea></div>
      <div class="field"><label>S — Signs (vitals at scene, GCS)</label><textarea id="ho-signs">${esc(r.signs)}</textarea></div>
      <div class="field"><label>T — Treatment given pre-hospital</label><textarea id="ho-tx">${esc(r.treatmentGiven)}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>Handover clinician</label><input type="text" id="ho-clin" value="${esc(r.handoverClinician)}"></div>
        <div class="field"><label>Received by</label><input type="text" id="ho-recv" value="${esc(r.receivedBy)}"></div>
      </div>
    </div>
    <div class="card">
      <h3>Team attendance &amp; roles <span class="badge grey">§7.6</span></h3>
      ${renderTeamList()}
      <div class="btn-row"><button class="btn secondary" id="add-team-btn">+ Add team member</button></div>
    </div>
    ${quickActionsBar()}`;
}
function wireHandover(root) {
  bindField(root, "handover", "identifiers", "#ho-id");
  bindField(root, "handover", "timeOfInjury", "#ho-time");
  bindField(root, "handover", "mechanism", "#ho-mech");
  bindField(root, "handover", "injuries", "#ho-inj");
  bindField(root, "handover", "signs", "#ho-signs");
  bindField(root, "handover", "treatmentGiven", "#ho-tx");
  bindField(root, "handover", "handoverClinician", "#ho-clin");
  bindField(root, "handover", "receivedBy", "#ho-recv");
  root.querySelector("#add-team-btn").addEventListener("click", openTeamModal);
  root.querySelectorAll(".rm[data-team]").forEach((b) => b.addEventListener("click", () => Store.removeTimelineEvent(b.dataset.team)));
}
function renderTeamList() {
  const team = Store.state.timeline.filter((e) => e.kind === "team");
  if (team.length === 0) return `<p class="empty-hint">No team members logged yet.</p>`;
  return `<ul class="log-list">${team.map((e) => h`
    <li><span class="t">${fmtTime(e.ts)}</span> <span class="kind-tag">${esc(e.role)}</span> ${esc(e.name)}
      <button class="rm" data-team="${e.id}">remove</button></li>`).join("")}</ul>`;
}

// ================= PRIMARY SURVEY =================
function renderPrimary() {
  const r = Store.state.record.primary;
  const statuses = { airway: ["Patent", "Compromised", "Secured"], breathing: ["Normal", "Reduced", "Absent"], circulation: ["Stable", "Compromised", "Peri-arrest"] };
  const statusTiles = (key) => statuses[key].map((v) => h`<button type="button" class="tile ${r[key] === v ? "selected" : ""} ${v === "Compromised" || v === "Peri-arrest" || v === "Absent" ? "danger" : ""}" data-key="${key}" data-val="${esc(v)}">${esc(v)}</button>`).join("");
  return h`
    <div class="card">
      <h2>Primary Survey (ABCDE)</h2>
      <h3>A — Airway</h3>
      <div class="tiles" id="airway-tiles">${statusTiles("airway")}</div>
      <h3 style="margin-top:1rem">B — Breathing</h3>
      <div class="tiles" id="breathing-tiles">${statusTiles("breathing")}</div>
      <h3 style="margin-top:1rem">C — Circulation</h3>
      <div class="tiles" id="circulation-tiles">${statusTiles("circulation")}</div>
      <h3 style="margin-top:1rem">D — Disability</h3>
      <div class="grid-3">
        <div class="field"><label>GCS Eye (1-4)</label><input type="number" min="1" max="4" id="gcs-e" value="${esc(r.gcsE)}"></div>
        <div class="field"><label>GCS Verbal (1-5)</label><input type="number" min="1" max="5" id="gcs-v" value="${esc(r.gcsV)}"></div>
        <div class="field"><label>GCS Motor (1-6)</label><input type="number" min="1" max="6" id="gcs-m" value="${esc(r.gcsM)}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Pupils</label><input type="text" id="pupils" value="${esc(r.pupils)}" placeholder="e.g. PEARL 3mm"></div>
        <div class="field"><label>Glucose</label><input type="text" id="glucose" value="${esc(r.glucose)}"></div>
      </div>
      <h3 style="margin-top:1rem">E — Exposure</h3>
      <div class="field"><textarea id="exposure" placeholder="Temperature, findings, log roll...">${esc(r.exposure)}</textarea></div>
      <h3 style="margin-top:1rem">Adjuncts</h3>
      <div class="field"><textarea id="adjuncts" placeholder="FAST/eFAST, CXR/pelvis, ECG results">${esc(r.adjuncts)}</textarea></div>
      <div class="btn-row">
        <button class="btn" id="complete-primary">${r.completedAt ? "✓ Primary survey completed at " + fmtTime(r.completedAt) : "Mark primary survey complete"}</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="card"><h3>Vital signs &amp; timeline <span class="badge grey">§7.1</span></h3>${renderVitalsSummary()}<div class="btn-row"><button class="btn secondary" id="pv-add-vitals">+ Add vitals</button></div></div>
      <div class="card"><h3>Point-of-care blood gas <span class="badge grey">§7.5</span></h3>${renderGasSummary()}<div class="btn-row"><button class="btn secondary" id="pv-add-gas">+ Add gas</button></div></div>
    </div>
    <div class="grid-2">
      <div class="card"><h3>Medications <span class="badge grey">§7.3</span></h3>${renderMedsSummary()}<div class="btn-row"><button class="btn secondary" id="pv-add-med">+ Add medication</button></div></div>
      <div class="card"><h3>Interventions log <span class="badge grey">§7.2</span></h3>${renderInterventionsSummary()}<div class="btn-row"><button class="btn secondary" id="pv-add-int">+ Add intervention</button></div></div>
    </div>
    <div class="card"><h3>Blood products / MTP <span class="badge grey">§7.4</span></h3>${renderBloodSummary()}<div class="btn-row"><button class="btn secondary" id="pv-add-blood">+ Add blood product</button><button class="btn ${mtpActive() ? "danger" : "secondary"}" id="toggle-mtp">${mtpActive() ? "Stand down MTP" : "Activate MTP"}</button></div></div>
    ${quickActionsBar()}`;
}
function wirePrimary(root) {
  root.querySelectorAll("#airway-tiles .tile, #breathing-tiles .tile, #circulation-tiles .tile").forEach((t) => {
    t.addEventListener("click", () => Store.updateRecord("primary", { [t.dataset.key]: t.dataset.val }));
  });
  bindField(root, "primary", "gcsE", "#gcs-e"); bindField(root, "primary", "gcsV", "#gcs-v"); bindField(root, "primary", "gcsM", "#gcs-m");
  bindField(root, "primary", "pupils", "#pupils"); bindField(root, "primary", "glucose", "#glucose");
  bindField(root, "primary", "exposure", "#exposure"); bindField(root, "primary", "adjuncts", "#adjuncts");
  root.querySelector("#complete-primary").addEventListener("click", () => {
    Store.updateRecord("primary", { completedAt: Date.now(), completedBy: currentUserName() });
  });
  root.querySelector("#pv-add-vitals").addEventListener("click", openVitalsModal);
  root.querySelector("#pv-add-gas").addEventListener("click", openGasModal);
  root.querySelector("#pv-add-med").addEventListener("click", openMedicationModal);
  root.querySelector("#pv-add-int").addEventListener("click", openInterventionModal);
  root.querySelector("#pv-add-blood").addEventListener("click", openBloodProductModal);
  root.querySelector("#toggle-mtp").addEventListener("click", () => {
    Store.addTimelineEvent("mtp", { active: !mtpActive() }, currentUserName());
  });
}
function mtpActive() {
  const events = Store.state.timeline.filter((e) => e.kind === "mtp");
  if (events.length === 0) return false;
  return events[events.length - 1].active;
}

// ================= SECONDARY SURVEY =================
function renderSecondary() {
  const r = Store.state.record.secondary;
  return h`
    <div class="card">
      <h2>Secondary Survey</h2>
      <h3>AMPLE history</h3>
      <div class="grid-2">
        <div class="field"><label>Allergies</label><input type="text" id="s-allergies" value="${esc(r.ampleAllergies)}"></div>
        <div class="field"><label>Medications (regular)</label><input type="text" id="s-meds" value="${esc(r.ampleMedications)}"></div>
        <div class="field"><label>Past medical history</label><input type="text" id="s-pmhx" value="${esc(r.amplePmhx)}"></div>
        <div class="field"><label>Last meal</label><input type="text" id="s-lastmeal" value="${esc(r.ampleLastMeal)}"></div>
      </div>
      <div class="field"><label>Events</label><textarea id="s-events">${esc(r.ampleEvents)}</textarea></div>
      <h3>Head-to-toe findings</h3>
      <div class="field"><textarea id="s-findings" placeholder="Findings by body region...">${esc(r.findings)}</textarea></div>
      <div class="btn-row">
        <button class="btn" id="complete-secondary">${r.completedAt ? "✓ Secondary survey completed at " + fmtTime(r.completedAt) : "Mark secondary survey complete"}</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="card"><h3>Vitals &amp; blood gas</h3>${renderVitalsSummary()}${renderGasSummary()}<div class="btn-row"><button class="btn secondary" id="sv-add-vitals">+ Vitals</button><button class="btn secondary" id="sv-add-gas">+ Gas</button></div></div>
      <div class="card"><h3>Medications / interventions</h3>${renderMedsSummary()}${renderInterventionsSummary()}<div class="btn-row"><button class="btn secondary" id="sv-add-med">+ Medication</button><button class="btn secondary" id="sv-add-int">+ Intervention</button></div></div>
    </div>
    ${quickActionsBar()}`;
}
function wireSecondary(root) {
  bindField(root, "secondary", "ampleAllergies", "#s-allergies");
  bindField(root, "secondary", "ampleMedications", "#s-meds");
  bindField(root, "secondary", "amplePmhx", "#s-pmhx");
  bindField(root, "secondary", "ampleLastMeal", "#s-lastmeal");
  bindField(root, "secondary", "ampleEvents", "#s-events");
  bindField(root, "secondary", "findings", "#s-findings");
  root.querySelector("#complete-secondary").addEventListener("click", () => {
    Store.updateRecord("secondary", { completedAt: Date.now(), completedBy: currentUserName() });
  });
  root.querySelector("#sv-add-vitals").addEventListener("click", openVitalsModal);
  root.querySelector("#sv-add-gas").addEventListener("click", openGasModal);
  root.querySelector("#sv-add-med").addEventListener("click", openMedicationModal);
  root.querySelector("#sv-add-int").addEventListener("click", openInterventionModal);
}

// ================= IMAGING =================
function renderImaging() {
  const r = Store.state.record.imaging;
  const plainOptions = ["CXR", "Pelvis XR", "Other XR"];
  const ctOptions = ["CT head", "CT C-spine", "CT chest", "CT abdomen/pelvis", "CT whole-body trauma series", "CT angiogram", "Other CT"];
  return h`
    <div class="card">
      <h2>Imaging</h2>
      <h3>Plain films</h3>
      <div class="tiles" id="plain-tiles">${plainOptions.map((v) => h`<button type="button" class="tile" data-val="${esc(v)}">${esc(v)}</button>`).join("")}</div>
      <table class="admin-table" style="margin-top:0.8rem">
        <thead><tr><th>Film</th><th>Findings (as reported)</th><th></th></tr></thead>
        <tbody>${r.plainFilms.map((f, i) => h`
          <tr><td>${esc(f.type)}</td>
          <td><input type="text" data-film-idx="${i}" value="${esc(f.findings)}" placeholder="Findings once available"></td>
          <td><button class="mini-btn btn danger" data-rm-film="${i}">remove</button></td></tr>`).join("") || `<tr><td colspan="3" class="empty-hint">No plain films ordered yet.</td></tr>`}
        </tbody>
      </table>
      <h3 style="margin-top:1.2rem">CT scans ordered</h3>
      <div class="tiles" id="ct-tiles">${ctOptions.map((v) => h`<button type="button" class="tile ${r.ctOrders.includes(v) ? "selected" : ""}" data-val="${esc(v)}">${esc(v)}</button>`).join("")}</div>
      <div class="grid-2" style="margin-top:1rem">
        <div class="field"><label>Time left for CT</label>
          <button class="btn secondary" id="ct-left-btn">${r.ctLeftAt ? "Left at " + fmtTime(r.ctLeftAt) : "Log departure now"}</button>
        </div>
        <div class="field"><label>Time returned from CT</label>
          <button class="btn secondary" id="ct-return-btn" ${!r.ctLeftAt ? "disabled" : ""}>${r.ctReturnedAt ? "Returned at " + fmtTime(r.ctReturnedAt) : "Log return now"}</button>
        </div>
      </div>
    </div>
    ${quickActionsBar()}`;
}
function wireImaging(root) {
  root.querySelector("#plain-tiles").addEventListener("click", (e) => {
    const btn = e.target.closest(".tile"); if (!btn) return;
    const films = Store.state.record.imaging.plainFilms.slice();
    films.push({ type: btn.dataset.val, findings: "" });
    Store.updateRecord("imaging", { plainFilms: films });
  });
  root.querySelectorAll("[data-film-idx]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const films = Store.state.record.imaging.plainFilms.slice();
      films[Number(inp.dataset.filmIdx)].findings = inp.value;
      Store.updateRecord("imaging", { plainFilms: films });
    });
  });
  root.querySelectorAll("[data-rm-film]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const films = Store.state.record.imaging.plainFilms.slice();
      films.splice(Number(btn.dataset.rmFilm), 1);
      Store.updateRecord("imaging", { plainFilms: films });
    });
  });
  root.querySelector("#ct-tiles").addEventListener("click", (e) => {
    const btn = e.target.closest(".tile"); if (!btn) return;
    const set = new Set(Store.state.record.imaging.ctOrders);
    set.has(btn.dataset.val) ? set.delete(btn.dataset.val) : set.add(btn.dataset.val);
    Store.updateRecord("imaging", { ctOrders: Array.from(set) });
  });
  root.querySelector("#ct-left-btn").addEventListener("click", () => Store.updateRecord("imaging", { ctLeftAt: Date.now() }));
  root.querySelector("#ct-return-btn").addEventListener("click", () => Store.updateRecord("imaging", { ctReturnedAt: Date.now() }));
}

// ================= DISPOSITION =================
function renderDisposition() {
  const r = Store.state.record.disposition;
  const destinations = ["Theatre", "ICU", "Ward", "Interventional radiology", "Transfer to another hospital", "Discharge", "Mortuary"];
  return h`
    <div class="card">
      <h2>Disposition</h2>
      <div class="field"><label>Working diagnosis / injury list</label><textarea id="d-diag">${esc(r.workingDiagnosis)}</textarea></div>
      <div class="field"><label>Destination</label>
        <div class="tiles" id="dest-tiles">${destinations.map((v) => h`<button type="button" class="tile ${r.destination === v ? "selected" : ""}" data-val="${esc(v)}">${esc(v)}</button>`).join("")}</div>
      </div>
      ${r.destination === "Transfer to another hospital" ? h`
      <div class="grid-3">
        <div class="field"><label>Receiving hospital</label><input type="text" id="d-hosp" value="${esc(r.transferHospital)}"></div>
        <div class="field"><label>Transport mode</label><input type="text" id="d-mode" value="${esc(r.transferMode)}"></div>
        <div class="field"><label>Accepting team</label><input type="text" id="d-team" value="${esc(r.transferTeam)}"></div>
      </div>` : ""}
      <div class="grid-2">
        <div class="field"><label>Team leader sign-off — name</label><input type="text" id="d-name" value="${esc(r.signOffName)}"></div>
        <div class="field"><label>Role / registration no.</label><input type="text" id="d-role" value="${esc(r.signOffRole)}"></div>
      </div>
      <div class="btn-row">
        ${r.finalisedAt
          ? h`<span class="badge green">Finalised at ${fmtTime(r.finalisedAt)}</span> <button class="btn secondary" id="view-record">View printable record</button>`
          : h`<button class="btn big" id="finalise-btn" ${!r.destination || !r.signOffName ? "disabled" : ""}>Finalise &amp; generate record</button>`}
      </div>
      ${!r.finalisedAt && (!r.destination || !r.signOffName) ? `<p class="hint">Destination and sign-off name are required to finalise.</p>` : ""}
    </div>
    ${quickActionsBar()}`;
}
function wireDisposition(root) {
  bindField(root, "disposition", "workingDiagnosis", "#d-diag");
  const hospEl = root.querySelector("#d-hosp"); if (hospEl) hospEl.addEventListener("input", () => Store.updateRecord("disposition", { transferHospital: hospEl.value }));
  const modeEl = root.querySelector("#d-mode"); if (modeEl) modeEl.addEventListener("input", () => Store.updateRecord("disposition", { transferMode: modeEl.value }));
  const teamEl = root.querySelector("#d-team"); if (teamEl) teamEl.addEventListener("input", () => Store.updateRecord("disposition", { transferTeam: teamEl.value }));
  bindField(root, "disposition", "signOffName", "#d-name");
  bindField(root, "disposition", "signOffRole", "#d-role");
  root.querySelector("#dest-tiles").addEventListener("click", (e) => {
    const btn = e.target.closest(".tile"); if (!btn) return;
    Store.updateRecord("disposition", { destination: btn.dataset.val });
  });
  const finBtn = root.querySelector("#finalise-btn");
  if (finBtn) finBtn.addEventListener("click", () => {
    if (!confirm("Finalise the record? After this, changes are logged as addenda rather than edits.")) return;
    Store.updateRecord("disposition", { finalisedAt: Date.now() });
    openRecordView();
  });
  const viewBtn = root.querySelector("#view-record");
  if (viewBtn) viewBtn.addEventListener("click", openRecordView);
}

// ================= TIMELINE =================
function renderTimeline() {
  const events = Store.state.timeline.slice().sort((a, b) => b.ts - a.ts);
  if (events.length === 0) return `<div class="card"><p class="empty-hint">No timeline entries logged yet.</p></div>${quickActionsBar()}`;
  return h`<div class="card"><h2>Full timeline</h2><ul class="log-list">
    ${events.map((e) => h`<li><span class="t">${fmtTime(e.ts)}</span> <span class="kind-tag">${esc(e.kind)}</span> ${esc(describeEvent(e))} <button class="rm" data-tl="${e.id}">remove</button></li>`).join("")}
  </ul></div>${quickActionsBar()}`;
}
function wireTimeline(root) {
  root.querySelectorAll("[data-tl]").forEach((b) => b.addEventListener("click", () => Store.removeTimelineEvent(b.dataset.tl)));
}
function describeEvent(e) {
  if (e.kind === "vitals") return `HR ${e.hr || "–"} BP ${e.bp || "–"} RR ${e.rr || "–"} SpO2 ${e.spo2 || "–"} GCS ${e.gcs || "–"} — ${e.user}`;
  if (e.kind === "gas") return `pH ${e.ph || "–"} Hb ${e.hb || "–"} Lactate ${e.lactate || "–"} BE ${e.be || "–"} (${e.sampleType}) — ${e.user}`;
  if (e.kind === "medication") return `${e.drug} ${e.dose} ${e.route} — ${e.user}`;
  if (e.kind === "intervention") return `${e.name} — ${e.user}`;
  if (e.kind === "blood") return `${e.product} x${e.units} — ${e.user}`;
  if (e.kind === "mtp") return e.active ? `MTP ACTIVATED — ${e.user}` : `MTP stood down — ${e.user}`;
  if (e.kind === "team") return `${e.name} joined as ${e.role} — ${e.user}`;
  return JSON.stringify(e);
}

function wireStage(stage) {
  const root = byId("main-area");
  wireQuickActions(root);
  const wirers = { prealert: wirePreAlert, handover: wireHandover, primary: wirePrimary, secondary: wireSecondary, imaging: wireImaging, disposition: wireDisposition, timeline: wireTimeline };
  wirers[stage](root);
}

// ================= Summaries for cross-cutting modules =================
function renderVitalsSummary() {
  const events = Store.state.timeline.filter((e) => e.kind === "vitals").sort((a, b) => b.ts - a.ts);
  if (events.length === 0) return `<p class="empty-hint">No vitals recorded yet.</p>`;
  const latest = events[0];
  return h`<div class="vitals-current">
    <div class="vital-tile"><div class="v">${esc(latest.hr || "–")}</div><div class="l">HR</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.bp || "–")}</div><div class="l">BP</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.rr || "–")}</div><div class="l">RR</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.spo2 || "–")}</div><div class="l">SpO2</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.gcs || "–")}</div><div class="l">GCS</div></div>
  </div><p class="hint">${events.length} reading(s), last at ${fmtTime(latest.ts)}</p>`;
}
function renderGasSummary() {
  const events = Store.state.timeline.filter((e) => e.kind === "gas").sort((a, b) => b.ts - a.ts);
  if (events.length === 0) return `<p class="empty-hint">No blood gas recorded yet.</p>`;
  const latest = events[0];
  return h`<div class="vitals-current">
    <div class="vital-tile"><div class="v">${esc(latest.ph || "–")}</div><div class="l">pH</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.hb || "–")}</div><div class="l">Hb</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.lactate || "–")}</div><div class="l">Lactate</div></div>
    <div class="vital-tile"><div class="v">${esc(latest.be || "–")}</div><div class="l">BE</div></div>
  </div><p class="hint">${events.length} sample(s), last at ${fmtTime(latest.ts)}</p>`;
}
function renderMedsSummary() {
  const events = Store.state.timeline.filter((e) => e.kind === "medication").sort((a, b) => b.ts - a.ts);
  if (events.length === 0) return `<p class="empty-hint">No medications given yet.</p>`;
  return `<ul class="log-list">${events.slice(0, 5).map((e) => h`<li><span class="t">${fmtTime(e.ts)}</span> ${esc(e.drug)} ${esc(e.dose)} ${esc(e.route)}</li>`).join("")}</ul>`;
}
function renderInterventionsSummary() {
  const events = Store.state.timeline.filter((e) => e.kind === "intervention").sort((a, b) => b.ts - a.ts);
  if (events.length === 0) return `<p class="empty-hint">No interventions logged yet.</p>`;
  return `<ul class="log-list">${events.slice(0, 5).map((e) => h`<li><span class="t">${fmtTime(e.ts)}</span> ${esc(e.name)}</li>`).join("")}</ul>`;
}
function renderBloodSummary() {
  const events = Store.state.timeline.filter((e) => e.kind === "blood").sort((a, b) => b.ts - a.ts);
  const mtp = mtpActive();
  let html = `<div class="status-row"><span class="mtp-indicator ${mtp ? "active" : "inactive"}" style="display:inline-block;padding:.4rem 1rem;border-radius:999px;font-weight:800;">${mtp ? "MTP ACTIVE" : "MTP not active"}</span></div>`;
  if (events.length === 0) return html + `<p class="empty-hint">No blood products given yet.</p>`;
  const totals = {};
  events.forEach((e) => { totals[e.product] = (totals[e.product] || 0) + Number(e.units || 1); });
  html += `<p>${Object.entries(totals).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}</p>`;
  html += `<ul class="log-list">${events.slice(0, 5).map((e) => h`<li><span class="t">${fmtTime(e.ts)}</span> ${esc(e.product)} x${esc(e.units)}</li>`).join("")}</ul>`;
  return html;
}

// ================= Modals =================
function openModal(title, bodyHtml, onMount) {
  const root = byId("modal-root");
  root.innerHTML = h`<div class="modal-backdrop" id="modal-backdrop"><div class="modal">
    <div class="close-row"><button class="btn outline" id="modal-close">✕</button></div>
    <h2>${esc(title)}</h2>
    ${bodyHtml}
  </div></div>`;
  byId("modal-close").addEventListener("click", closeModal);
  byId("modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
  if (onMount) onMount(root);
}
function closeModal() { byId("modal-root").innerHTML = ""; }

function openVitalsModal() {
  openModal("Add vital signs", h`
    <div class="grid-3">
      <div class="field"><label>HR</label><input type="number" id="m-hr"></div>
      <div class="field"><label>BP (e.g. 110/70)</label><input type="text" id="m-bp"></div>
      <div class="field"><label>RR</label><input type="number" id="m-rr"></div>
      <div class="field"><label>SpO2 %</label><input type="number" id="m-spo2"></div>
      <div class="field"><label>Temp °C</label><input type="text" id="m-temp"></div>
      <div class="field"><label>GCS</label><input type="text" id="m-gcs"></div>
    </div>
    <div class="btn-row"><button class="btn big" id="m-save">Save vitals</button></div>`,
    (root) => root.querySelector("#m-save").addEventListener("click", () => {
      Store.addTimelineEvent("vitals", {
        hr: root.querySelector("#m-hr").value, bp: root.querySelector("#m-bp").value,
        rr: root.querySelector("#m-rr").value, spo2: root.querySelector("#m-spo2").value,
        temp: root.querySelector("#m-temp").value, gcs: root.querySelector("#m-gcs").value,
      }, currentUserName());
      closeModal();
    }));
}
function openGasModal() {
  openModal("Add blood gas", h`
    <div class="field"><label>Sample type</label>
      <div class="tiles"><button type="button" class="tile selected" data-sample="Arterial">Arterial</button><button type="button" class="tile" data-sample="Venous">Venous</button></div>
    </div>
    <div class="grid-2">
      <div class="field"><label>pH</label><input type="text" id="g-ph"></div>
      <div class="field"><label>Hb</label><input type="text" id="g-hb"></div>
      <div class="field"><label>Lactate</label><input type="text" id="g-lactate"></div>
      <div class="field"><label>Base Excess (BE)</label><input type="text" id="g-be"></div>
    </div>
    <div class="btn-row"><button class="btn big" id="g-save">Save gas</button></div>`,
    (root) => {
      let sampleType = "Arterial";
      root.querySelectorAll("[data-sample]").forEach((t) => t.addEventListener("click", () => {
        sampleType = t.dataset.sample;
        root.querySelectorAll("[data-sample]").forEach((x) => x.classList.remove("selected"));
        t.classList.add("selected");
      }));
      root.querySelector("#g-save").addEventListener("click", () => {
        Store.addTimelineEvent("gas", {
          ph: root.querySelector("#g-ph").value, hb: root.querySelector("#g-hb").value,
          lactate: root.querySelector("#g-lactate").value, be: root.querySelector("#g-be").value, sampleType,
        }, currentUserName());
        closeModal();
      });
    });
}
function openMedicationModal() {
  const meds = Store.state.config.medicationsList;
  openModal("Add medication", h`
    <div class="field"><label>Drug</label>
      <select id="m-drug">${meds.map((m) => h`<option value="${esc(m.name)}">${esc(m.name)} (${esc(m.category)})</option>`).join("")}</select>
    </div>
    <div class="grid-2">
      <div class="field"><label>Dose</label><input type="text" id="m-dose" placeholder="e.g. 5mg"></div>
      <div class="field"><label>Route</label><select id="m-route"></select></div>
    </div>
    <div class="btn-row"><button class="btn big" id="m-save">Log medication</button></div>`,
    (root) => {
      const routeSel = root.querySelector("#m-route");
      function refreshRoutes() {
        const drug = meds.find((m) => m.name === root.querySelector("#m-drug").value);
        routeSel.innerHTML = (drug ? drug.routes : ["IV"]).map((r) => `<option>${esc(r)}</option>`).join("");
      }
      root.querySelector("#m-drug").addEventListener("change", refreshRoutes);
      refreshRoutes();
      root.querySelector("#m-save").addEventListener("click", () => {
        Store.addTimelineEvent("medication", {
          drug: root.querySelector("#m-drug").value, dose: root.querySelector("#m-dose").value, route: routeSel.value,
        }, currentUserName());
        closeModal();
      });
    });
}
function openInterventionModal() {
  const list = Store.state.config.interventionsList;
  openModal("Add intervention", h`
    <div class="tiles">${list.map((v) => h`<button type="button" class="tile" data-val="${esc(v)}">${esc(v)}</button>`).join("")}</div>
    <div class="field" style="margin-top:1rem"><label>Other (free text)</label><input type="text" id="i-other"></div>
    <div class="btn-row"><button class="btn big" id="i-save-other">Log "other"</button></div>`,
    (root) => {
      root.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => {
        Store.addTimelineEvent("intervention", { name: t.dataset.val }, currentUserName());
        closeModal();
      }));
      root.querySelector("#i-save-other").addEventListener("click", () => {
        const v = root.querySelector("#i-other").value.trim();
        if (!v) return;
        Store.addTimelineEvent("intervention", { name: v }, currentUserName());
        closeModal();
      });
    });
}
function openBloodProductModal() {
  const products = ["Red cells", "FFP", "Platelets", "Cryoprecipitate"];
  openModal("Add blood product", h`
    <div class="field"><label>Product</label>
      <div class="tiles">${products.map((p) => h`<button type="button" class="tile" data-p="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    </div>
    <div class="field"><label>Units</label><input type="number" id="b-units" value="1" min="1"></div>
    <div class="btn-row"><button class="btn big" id="b-save" disabled>Log units</button></div>`,
    (root) => {
      let product = null;
      root.querySelectorAll("[data-p]").forEach((t) => t.addEventListener("click", () => {
        product = t.dataset.p;
        root.querySelectorAll("[data-p]").forEach((x) => x.classList.remove("selected"));
        t.classList.add("selected");
        root.querySelector("#b-save").disabled = false;
      }));
      root.querySelector("#b-save").addEventListener("click", () => {
        Store.addTimelineEvent("blood", { product, units: root.querySelector("#b-units").value }, currentUserName());
        closeModal();
      });
    });
}
function openTeamModal() {
  openModal("Add team member", h`
    <div class="field"><label>Name</label><input type="text" id="t-name"></div>
    <div class="field"><label>Role</label>
      <div class="tiles">${TEAM_ROLES.map((r) => h`<button type="button" class="tile" data-role="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    </div>
    <div class="btn-row"><button class="btn big" id="t-save" disabled>Log arrival</button></div>`,
    (root) => {
      let role = null;
      root.querySelectorAll("[data-role]").forEach((t) => t.addEventListener("click", () => {
        role = t.dataset.role;
        root.querySelectorAll("[data-role]").forEach((x) => x.classList.remove("selected"));
        t.classList.add("selected");
        root.querySelector("#t-save").disabled = false;
      }));
      root.querySelector("#t-save").addEventListener("click", () => {
        const name = root.querySelector("#t-name").value.trim() || "(name not entered)";
        Store.addTimelineEvent("team", { name, role }, currentUserName());
        closeModal();
      });
    });
}

// ================= Admin panel =================
function openAdmin() {
  openModal("Admin", h`
    <div class="tabbar">
      <button class="active" data-tab="users">Users</button>
      <button data-tab="interventions">Interventions</button>
      <button data-tab="medications">Medications</button>
    </div>
    <div id="admin-tab-body"></div>`,
    (root) => {
      const tabs = { users: renderAdminUsers, interventions: renderAdminInterventions, medications: renderAdminMedications };
      function showTab(name) {
        root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
        root.querySelector("#admin-tab-body").innerHTML = tabs[name]();
        wireAdminTab(name, root);
      }
      root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
      showTab("users");
    });
}
function renderAdminUsers() {
  const users = Store.state.users;
  return h`
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>${users.map((u) => h`<tr>
        <td>${esc(u.username)}</td><td>${esc(u.displayName)}</td><td>${esc(u.role)}</td>
        <td><span class="badge ${u.active ? "green" : "grey"}">${u.active ? "Active" : "Disabled"}</span></td>
        <td><button class="mini-btn btn secondary" data-toggle-user="${esc(u.username)}">${u.active ? "Disable" : "Enable"}</button></td>
      </tr>`).join("")}</tbody>
    </table>
    <h3 style="margin-top:1.2rem">Add user</h3>
    <div class="grid-2">
      <div class="field"><label>Username</label><input type="text" id="au-username"></div>
      <div class="field"><label>Display name</label><input type="text" id="au-name"></div>
      <div class="field"><label>Password</label><input type="password" id="au-password"></div>
      <div class="field"><label>Role</label><select id="au-role"><option value="scribe">scribe</option><option value="admin">admin</option></select></div>
    </div>
    <button class="btn" id="au-save">Add user</button>`;
}
function renderAdminInterventions() {
  const list = Store.state.config.interventionsList;
  return h`
    <ul class="log-list">${list.map((v) => h`<li>${esc(v)}<button class="rm" data-rm-i="${esc(v)}">remove</button></li>`).join("")}</ul>
    <div class="field" style="margin-top:1rem"><label>New intervention</label><input type="text" id="ai-name"></div>
    <button class="btn" id="ai-save">Add intervention</button>`;
}
function renderAdminMedications() {
  const list = Store.state.config.medicationsList;
  return h`
    <ul class="log-list">${list.map((m) => h`<li>${esc(m.name)} <span class="kind-tag">${esc(m.category)}</span><button class="rm" data-rm-m="${esc(m.name)}">remove</button></li>`).join("")}</ul>
    <h3 style="margin-top:1rem">Add medication</h3>
    <div class="grid-2">
      <div class="field"><label>Name</label><input type="text" id="am-name"></div>
      <div class="field"><label>Category</label><input type="text" id="am-category"></div>
      <div class="field"><label>Routes (comma separated)</label><input type="text" id="am-routes" placeholder="IV, IM"></div>
    </div>
    <button class="btn" id="am-save">Add medication</button>`;
}
function wireAdminTab(name, root) {
  if (name === "users") {
    root.querySelectorAll("[data-toggle-user]").forEach((b) => b.addEventListener("click", () => {
      const u = Store.state.users.find((x) => x.username === b.dataset.toggleUser);
      Store.setUserActive(u.username, !u.active);
      openAdmin();
    }));
    root.querySelector("#au-save").addEventListener("click", async () => {
      const username = root.querySelector("#au-username").value.trim();
      const name = root.querySelector("#au-name").value.trim();
      const password = root.querySelector("#au-password").value;
      const role = root.querySelector("#au-role").value;
      if (!username || !password) return;
      await Store.addUser(username, name || username, password, role);
      openAdmin();
    });
  }
  if (name === "interventions") {
    root.querySelectorAll("[data-rm-i]").forEach((b) => b.addEventListener("click", () => { Store.removeIntervention(b.dataset.rmI); openAdmin(); }));
    root.querySelector("#ai-save").addEventListener("click", () => {
      const v = root.querySelector("#ai-name").value.trim();
      if (!v) return;
      Store.addIntervention(v);
      openAdmin();
    });
  }
  if (name === "medications") {
    root.querySelectorAll("[data-rm-m]").forEach((b) => b.addEventListener("click", () => { Store.removeMedication(b.dataset.rmM); openAdmin(); }));
    root.querySelector("#am-save").addEventListener("click", () => {
      const name = root.querySelector("#am-name").value.trim();
      const category = root.querySelector("#am-category").value.trim() || "Other";
      const routes = root.querySelector("#am-routes").value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!name) return;
      Store.addMedication(name, category, routes.length ? routes : ["IV"]);
      openAdmin();
    });
  }
}

// ================= Printable record =================
function openRecordView() {
  const rec = Store.state.record;
  const events = Store.state.timeline.slice().sort((a, b) => a.ts - b.ts);
  const win = window.open("", "traumaRecord", "width=900,height=1000");
  win.document.write(h`<!doctype html><html><head><meta charset="utf-8"><title>Trauma record — ${esc(rec.caseId)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #16212A; margin: 0; background: #F5F7F5; }
      .record-view { max-width: 800px; margin: 0 auto; background: #fff; padding: 2rem; }
      .record-view h1 { font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif; color: #0A3D52; font-size: 1.6rem; margin-bottom: .3rem; }
      .record-view .meta-row { display: flex; gap: 2rem; font-size: 0.9rem; color: #5B6670; margin-bottom: 1.2rem; }
      .record-view section { margin-bottom: 1.2rem; }
      .record-view section h2 { font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif; color: #0B5D6B; font-size: 1.05rem; border-bottom: 1px solid #DDE4E1; padding-bottom: 0.3rem; }
      .record-view table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: .5rem; }
      .record-view table td, .record-view table th { border: 1px solid #DDE4E1; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
      .record-view table th { background: #EDF2F1; }
      .record-notice { background: #F6E9DC; color: #A0530C; border-radius: 8px; padding: 0.6rem 0.9rem; font-size: 0.82rem; margin-bottom: 1rem; }
      .no-print button { min-height: 2.4rem; border-radius: 8px; border: 1px solid #0B5D6B; background: #0B5D6B; color: #fff; font-weight: 700; padding: 0.5rem 1.1rem; font-size: 0.9rem; }
      @media print { .no-print { display: none !important; } .record-view { padding: 0; max-width: none; } body { background: #fff; } }
    </style></head>
    <body><div class="record-view">
      <div class="no-print" style="text-align:right"><button onclick="window.print()">Print / Save as PDF</button></div>
      <h1>Trauma Resuscitation Record</h1>
      <div class="record-notice">System-generated record — see the live app for any addenda made after finalisation. Prototype output; production build generates .docx and PDF server-side (plan §9).</div>
      <div class="meta-row"><div>Case: <b>${esc(rec.caseId)}</b></div><div>Started: <b>${fmtTime(rec.startedAt)}</b></div><div>Finalised: <b>${fmtTime(rec.disposition.finalisedAt)}</b></div></div>

      <section><h2>Pre-Alert</h2><table>
        <tr><td>Call type</td><td>${esc(rec.preAlert.callType)}</td></tr>
        <tr><td>Source</td><td>${esc(rec.preAlert.source)}</td></tr>
        <tr><td>Mechanism</td><td>${esc(rec.preAlert.mechanism)}</td></tr>
        <tr><td>Suspected injuries</td><td>${esc(rec.preAlert.suspectedInjuries.join(", "))}</td></tr>
        <tr><td>Pre-alert criteria</td><td>${esc(rec.preAlert.criteria.join(", "))}</td></tr>
      </table></section>

      <section><h2>Handover (ATMIST)</h2><table>
        <tr><td>ID</td><td>${esc(rec.handover.identifiers)}</td></tr>
        <tr><td>Time of injury</td><td>${esc(rec.handover.timeOfInjury)}</td></tr>
        <tr><td>Mechanism</td><td>${esc(rec.handover.mechanism)}</td></tr>
        <tr><td>Injuries</td><td>${esc(rec.handover.injuries)}</td></tr>
        <tr><td>Signs</td><td>${esc(rec.handover.signs)}</td></tr>
        <tr><td>Treatment given</td><td>${esc(rec.handover.treatmentGiven)}</td></tr>
      </table></section>

      <section><h2>Primary survey</h2><table>
        <tr><td>Airway</td><td>${esc(rec.primary.airway)}</td></tr>
        <tr><td>Breathing</td><td>${esc(rec.primary.breathing)}</td></tr>
        <tr><td>Circulation</td><td>${esc(rec.primary.circulation)}</td></tr>
        <tr><td>GCS</td><td>E${esc(rec.primary.gcsE)} V${esc(rec.primary.gcsV)} M${esc(rec.primary.gcsM)}</td></tr>
        <tr><td>Exposure</td><td>${esc(rec.primary.exposure)}</td></tr>
        <tr><td>Completed</td><td>${fmtTime(rec.primary.completedAt)} by ${esc(rec.primary.completedBy)}</td></tr>
      </table></section>

      <section><h2>Secondary survey</h2><table>
        <tr><td>Allergies</td><td>${esc(rec.secondary.ampleAllergies)}</td></tr>
        <tr><td>PMHx</td><td>${esc(rec.secondary.amplePmhx)}</td></tr>
        <tr><td>Findings</td><td>${esc(rec.secondary.findings)}</td></tr>
        <tr><td>Completed</td><td>${fmtTime(rec.secondary.completedAt)} by ${esc(rec.secondary.completedBy)}</td></tr>
      </table></section>

      <section><h2>Imaging</h2><table>
        <tr><td>Plain films</td><td>${rec.imaging.plainFilms.map((f) => `${esc(f.type)}: ${esc(f.findings || "pending")}`).join("<br>") || "—"}</td></tr>
        <tr><td>CT ordered</td><td>${esc(rec.imaging.ctOrders.join(", "))}</td></tr>
        <tr><td>Time to CT</td><td>Left ${fmtTime(rec.imaging.ctLeftAt)} / Returned ${fmtTime(rec.imaging.ctReturnedAt)}</td></tr>
      </table></section>

      <section><h2>Disposition</h2><table>
        <tr><td>Working diagnosis</td><td>${esc(rec.disposition.workingDiagnosis)}</td></tr>
        <tr><td>Destination</td><td>${esc(rec.disposition.destination)}</td></tr>
        <tr><td>Sign-off</td><td>${esc(rec.disposition.signOffName)} (${esc(rec.disposition.signOffRole)})</td></tr>
      </table></section>

      <section><h2>Chronological timeline</h2><table>
        <tr><th>Time</th><th>Type</th><th>Detail</th></tr>
        ${events.map((e) => `<tr><td>${fmtTime(e.ts)}</td><td>${esc(e.kind)}</td><td>${esc(describeEvent(e))}</td></tr>`).join("")}
      </table></section>
    </div></body></html>`);
  win.document.close();
}
