/* Shared state store for the Trauma Resuscitation Documentation App prototype.
   Event-sourced timeline (vitals, interventions, medications, blood products,
   blood gas, team attendance, pre-hospital treatments) + a plain record object
   for one-time fields. Persisted to localStorage; synced live across
   windows/tabs via BroadcastChannel (this models the real deployment: one
   cart PC driving two displays). */

const STORAGE_KEY = "trauma_app_state_v2";
const CHANNEL_NAME = "trauma_app_sync_v2";

const DEFAULT_INTERVENTIONS = [
  "O2 applied", "Airway adjunct inserted", "Airway secured (ETT)",
  "Needle decompression", "Chest drain inserted", "Non-invasive ventilation",
  "IV access obtained", "IO access obtained", "Fluid bolus given",
  "Direct pressure haemorrhage control", "Tourniquet applied", "Pelvic binder applied",
  "Splint applied", "Log roll performed", "Urinary catheter inserted",
  "Wound dressed", "Cervical collar applied",
];

const PREHOSPITAL_TREATMENTS = [
  "IV access obtained", "IO access obtained", "Fluid bolus given", "TXA given",
  "Analgesia given", "Oxygen given", "Splint applied", "Tourniquet applied",
  "Pelvic binder applied", "Cervical collar applied",
];

const DEFAULT_MEDICATIONS = [
  { name: "Morphine", category: "Analgesia", routes: ["IV", "IM"] },
  { name: "Fentanyl", category: "Analgesia", routes: ["IV", "IN"] },
  { name: "Ketamine (analgesic dose)", category: "Analgesia", routes: ["IV", "IM"] },
  { name: "Paracetamol", category: "Analgesia", routes: ["IV", "PO"] },
  { name: "Ketamine (induction dose)", category: "Sedation / RSI", routes: ["IV"] },
  { name: "Propofol", category: "Sedation / RSI", routes: ["IV"] },
  { name: "Rocuronium", category: "Sedation / RSI", routes: ["IV"] },
  { name: "Suxamethonium", category: "Sedation / RSI", routes: ["IV"] },
  { name: "Naloxone", category: "Reversal / Emergency", routes: ["IV", "IM"] },
  { name: "Atropine", category: "Reversal / Emergency", routes: ["IV"] },
  { name: "Tranexamic acid (TXA)", category: "Haemostatic", routes: ["IV"] },
  { name: "Co-amoxiclav", category: "Antibiotics (TBC with pharmacy)", routes: ["IV"] },
  { name: "Cefuroxime", category: "Antibiotics (TBC with pharmacy)", routes: ["IV"] },
  { name: "Metronidazole", category: "Antibiotics (TBC with pharmacy)", routes: ["IV"] },
  { name: "Tetanus vaccine", category: "Tetanus prophylaxis", routes: ["IM"] },
  { name: "Tetanus immunoglobulin", category: "Tetanus prophylaxis", routes: ["IM"] },
];

const TEAM_ROLES = [
  "Team Leader", "Airway / Anaesthetics", "Circulation / Procedures", "Scribe",
  "Primary Nurse", "Secondary Nurse", "Runner", "Radiographer", "Surgical", "Other",
];

const SOURCE_OPTIONS = ["NAS ambulance", "DFB (Dublin Fire Brigade)", "Other hospital transfer", "Garda", "Self-presenting"];

// Mater Hospital Trauma Team Call Out criteria (per the hospital's own
// tiered-response poster). Grouping and tier mapping mirror that flowchart:
// vitalSigns / injuries / elderly -> Hospital Trauma Team Call-Out;
// highRisk (only reached if none of those apply) -> ED Trauma Team Call-Out;
// otherwise -> Regular Triage.
const CALLOUT_CRITERIA = {
  vitalSigns: {
    title: "Abnormal vital signs",
    items: ["Traumatic cardiac arrest", "Heart rate >120 bpm", "Systolic BP <90 mmHg (at any time)", "GCS <13", "SpO2 <90%", "Respiratory rate <10 or >30 breaths/min"],
  },
  injuries: {
    title: "Injuries",
    items: ["Significant blunt torso, neck, or head injury", "Penetrating head, neck & truncal injury (incl. axilla/groin)", "Actual/potential airway compromise (incl. airway burns)", "Severe haemorrhage or arterial bleed", "Suspected spinal cord injury", "Traumatic amputation proximal to carpus/tarsus", "Fractured pelvis", "Limb injury with vascular compromise", "Evisceration", "Severe crush injury", "Blast injury", "Serious burns >20% TBSA or facial burns"],
  },
  elderly: {
    title: "Elderly (>65y) Silver Trauma — altered criteria",
    items: ["HR <50 or >90 bpm", "Systolic BP <110 mmHg", "GCS <15 (elderly)", "Fall: any height other than standing", "Fall down >2 stairs", "RTC >30kph"],
  },
  highRisk: {
    title: "High-risk mechanism (only if none of the above apply)",
    items: ["Fall >2 metres or >20 steps", "High-speed RTC (>100km/hr)", "Vehicle rollover", "Prolonged extrication (>30 min)", "Ejection from vehicle", "Fatality in the same vehicle", "Motorcycle/cyclist/scooter impact >30kph", "Pedestrian impact >30kph", "Explosion or gunshot wound", "Large animal incident (trampled/collision/fall/crushed)", "Anticoagulant therapy + fall from any height other than standing", "Elderly (Silver) trauma, age >65y", "Pregnant >20/40 weeks with trauma"],
  },
};

function computeSuggestedTier(sel) {
  const hasAny = (arr) => Array.isArray(arr) && arr.length > 0;
  if (hasAny(sel.vitalSigns) || hasAny(sel.injuries) || hasAny(sel.elderly)) return "Hospital Trauma Team Call-Out";
  if (hasAny(sel.highRisk)) return "ED Trauma Team Call-Out";
  return "Regular Triage";
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function emptyRecord() {
  return {
    caseId: null,
    startedAt: null,
    patient: { name: "", age: "", id: "" },
    preAlert: {
      timeOfCall: null, callOutActivatedAt: null,
      source: "", sourceOther: "",
      eta: "", age: "", sex: "",
      mechanism: "", mechanismOther: "",
      suspectedInjuries: [],
      criteria: { vitalSigns: [], injuries: [], elderly: [], highRisk: [] },
      criteriaNotes: "",
      activatedBy: "",
      tierConfirmed: "",
    },
    handover: {
      timeOfInjury: "", mechanism: "", injuries: "", signs: "",
      treatmentGiven: "", handoverClinician: "", receivedBy: "",
    },
    primary: {
      airway: "", breathing: "", circulation: "", gcsE: "", gcsV: "", gcsM: "",
      pupils: "", glucose: "", exposure: "", adjuncts: "",
      completedAt: null, completedBy: "",
    },
    secondary: {
      ampleAllergies: "", ampleMedications: "", amplePmhx: "", ampleLastMeal: "", ampleEvents: "",
      findings: "", completedAt: null, completedBy: "",
    },
    imaging: {
      plainFilms: [], ctOrders: [], ctLeftAt: null, ctReturnedAt: null,
    },
    disposition: {
      workingDiagnosis: "", destination: "", transferHospital: "", transferMode: "",
      transferTeam: "", signOffName: "", signOffRole: "", finalisedAt: null,
    },
  };
}

function defaultState() {
  return {
    record: emptyRecord(),
    timeline: [],
    config: {
      interventionsList: DEFAULT_INTERVENTIONS.slice(),
      medicationsList: DEFAULT_MEDICATIONS.slice(),
      staffList: [
        { name: "Dr. Aoife Byrne", role: "Team Leader" },
        { name: "Dr. Conor Walsh", role: "Airway / Anaesthetics" },
        { name: "Siobhan Kelly RN", role: "Primary Nurse" },
      ],
    },
    users: [],
  };
}

const Store = {
  _state: null,
  _channel: null,
  _listeners: [],

  async init() {
    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = (ev) => {
      if (ev.data && ev.data.type === "state-updated") {
        const raw2 = localStorage.getItem(STORAGE_KEY);
        if (raw2) {
          this._state = JSON.parse(raw2);
          this._notify();
        }
      }
    };

    const raw = localStorage.getItem(STORAGE_KEY);
    let needsPersist = false;
    if (raw) {
      this._state = JSON.parse(raw);
    } else {
      this._state = defaultState();
      await this._seedAdmin();
      needsPersist = true;
    }
    if (!this._state.config) { this._state.config = defaultState().config; needsPersist = true; }
    if (!this._state.config.staffList) { this._state.config.staffList = defaultState().config.staffList; needsPersist = true; }
    if (!this._state.users) { this._state.users = []; needsPersist = true; }
    if (this._state.users.length === 0) { await this._seedAdmin(); needsPersist = true; }
    if (!this._state.record.patient) { this._state.record.patient = { name: "", age: "", id: "" }; needsPersist = true; }
    if (!this._state.record.preAlert.criteria) { this._state.record.preAlert.criteria = { vitalSigns: [], injuries: [], elderly: [], highRisk: [] }; needsPersist = true; }

    if (needsPersist) this._persist();
  },

  async _seedAdmin() {
    const hash = await sha256("mater2026");
    this._state.users = [
      { username: "admin", displayName: "System Administrator", role: "admin", passwordHash: hash, active: true },
    ];
  },

  onChange(fn) {
    this._listeners.push(fn);
  },

  _notify() {
    this._listeners.forEach((fn) => fn(this._state));
  },

  _persist(opts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    this._channel.postMessage({ type: "state-updated" });
    if (!opts || !opts.silent) this._notify();
  },

  get state() {
    return this._state;
  },

  startNewCase() {
    this._state.record = emptyRecord();
    this._state.record.caseId = "TR-" + Date.now().toString(36).toUpperCase();
    this._state.record.startedAt = Date.now();
    this._state.timeline = [];
    this._persist();
  },

  updateRecord(section, patch) {
    Object.assign(this._state.record[section], patch);
    this._persist();
  },

  // Same mutation as updateRecord, but skips the full-app re-render. Use this
  // for text/number fields bound to keystrokes -- re-rendering the whole
  // stage on every character destroys and recreates the input element,
  // which drops focus after the first character typed.
  updateRecordSilent(section, patch) {
    Object.assign(this._state.record[section], patch);
    this._persist({ silent: true });
  },

  // `ts` is the clinical time the event pertains to -- editable, since the
  // scribe may log something retrospectively. `createdAt` is when it was
  // actually entered and never changes; "most recent reading" views must
  // sort by createdAt, not ts, or two events logged with the same
  // minute-precision clinical time become ambiguous.
  addTimelineEvent(kind, payload, user) {
    const now = Date.now();
    const ev = { id: "ev_" + now + "_" + Math.random().toString(36).slice(2, 7), ts: now, createdAt: now, kind, user: user || "unknown", ...payload };
    this._state.timeline.push(ev);
    this._persist();
    return ev;
  },

  removeTimelineEvent(id) {
    this._state.timeline = this._state.timeline.filter((e) => e.id !== id);
    this._persist();
  },

  // --- Admin: users ---
  async addUser(username, displayName, password, role) {
    const hash = await sha256(password);
    this._state.users.push({ username, displayName, role, passwordHash: hash, active: true });
    this._persist();
  },
  setUserActive(username, active) {
    const u = this._state.users.find((x) => x.username === username);
    if (u) u.active = active;
    this._persist();
  },
  async resetPassword(username, password) {
    const u = this._state.users.find((x) => x.username === username);
    if (u) u.passwordHash = await sha256(password);
    this._persist();
  },
  async authenticate(username, password) {
    const u = this._state.users.find((x) => x.username === username && x.active);
    if (!u) return null;
    const hash = await sha256(password);
    if (hash !== u.passwordHash) return null;
    return u;
  },

  // --- Admin: clinical lists ---
  addIntervention(name) {
    if (!this._state.config.interventionsList.includes(name)) {
      this._state.config.interventionsList.push(name);
      this._persist();
    }
  },
  removeIntervention(name) {
    this._state.config.interventionsList = this._state.config.interventionsList.filter((x) => x !== name);
    this._persist();
  },
  addMedication(name, category, routes) {
    this._state.config.medicationsList.push({ name, category, routes });
    this._persist();
  },
  removeMedication(name) {
    this._state.config.medicationsList = this._state.config.medicationsList.filter((x) => x.name !== name);
    this._persist();
  },
  addStaff(name, role) {
    this._state.config.staffList.push({ name, role: role || "" });
    this._persist();
  },
  removeStaff(name) {
    this._state.config.staffList = this._state.config.staffList.filter((x) => x.name !== name);
    this._persist();
  },
};

const CurrentUser = {
  KEY: "trauma_app_current_user",
  get() {
    const raw = sessionStorage.getItem(this.KEY);
    return raw ? JSON.parse(raw) : null;
  },
  set(user) {
    sessionStorage.setItem(this.KEY, JSON.stringify({ username: user.username, displayName: user.displayName, role: user.role }));
  },
  clear() {
    sessionStorage.removeItem(this.KEY);
  },
};

function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtHM(ts) {
  if (!ts) return nowHM();
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}
function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}
// Combine an "HH:MM" string with today's date into a timestamp. Falls back
// to now if the string doesn't parse -- keeps retrospective time entry
// simple for the prototype without a full date picker.
function parseHMToday(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || "").trim());
  if (!m) return Date.now();
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}
function fmtElapsed(startTs) {
  if (!startTs) return "00:00";
  const s = Math.floor((Date.now() - startTs) / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// ---------------- Touch numeric keypad ----------------
// Attaches an on-screen keypad to a numeric field so the scribe can enter
// digits without relying on the OS's own virtual keyboard.
function attachNumpad(input, opts) {
  opts = opts || {};
  input.setAttribute("inputmode", "none");
  input.setAttribute("autocomplete", "off");
  input.addEventListener("focus", () => openNumpad(input, opts));
}
function openNumpad(input, opts) {
  closeNumpad();
  const allowDecimal = opts.decimal !== false;
  const allowNegative = !!opts.negative;
  const rows = [["7", "8", "9"], ["4", "5", "6"], ["1", "2", "3"], [allowNegative ? "-" : "", "0", allowDecimal ? "." : ""]];
  const pop = document.createElement("div");
  pop.id = "numpad-popup";
  pop.className = "numpad-popup";
  pop.innerHTML = `<div class="numpad-grid">${rows.flat().map((k) => (k ? `<button type="button" class="numpad-key" data-k="${k}">${k}</button>` : `<span></span>`)).join("")}</div>
    <div class="numpad-row2"><button type="button" class="numpad-key numpad-back" data-k="back">⌫ Back</button><button type="button" class="btn numpad-done">Done</button></div>`;
  document.body.appendChild(pop);
  positionNumpad(pop, input);

  pop.querySelectorAll(".numpad-key").forEach((btn) => btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (btn.dataset.k === "back") input.value = input.value.slice(0, -1);
    else input.value += btn.dataset.k;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }));
  pop.querySelector(".numpad-done").addEventListener("mousedown", (e) => { e.preventDefault(); closeNumpad(); });
  setTimeout(() => document.addEventListener("mousedown", numpadOutsideHandler, true), 0);
}
function numpadOutsideHandler(e) {
  const pop = document.getElementById("numpad-popup");
  if (!pop) return;
  if (!pop.contains(e.target) && e.target.getAttribute("inputmode") !== "none") closeNumpad();
}
function closeNumpad() {
  const pop = document.getElementById("numpad-popup");
  if (pop) pop.remove();
  document.removeEventListener("mousedown", numpadOutsideHandler, true);
}
// Positions the keypad beside whichever container it's relevant to (a modal,
// or the page itself), never on top of it -- so it can never cover a Save
// button underneath. Falls back to docking at the bottom of the viewport
// only if the screen is too narrow for side placement (the real cart
// touchscreen this targets is wide enough that this fallback shouldn't fire).
function positionNumpad(pop, input) {
  const POP_W = 240, POP_H = 190, GAP = 16;
  const host = input.closest(".modal") || input.closest(".main-area") || document.body;
  const hostRect = host.getBoundingClientRect();
  const roomRight = window.innerWidth - hostRect.right;
  const roomLeft = hostRect.left;
  let left, top;
  if (roomRight >= POP_W + GAP) {
    left = hostRect.right + GAP;
  } else if (roomLeft >= POP_W + GAP) {
    left = hostRect.left - POP_W - GAP;
  } else {
    // Not enough side room: dock at the bottom of the viewport instead.
    pop.style.position = "fixed";
    pop.style.left = "50%";
    pop.style.bottom = "12px";
    pop.style.transform = "translateX(-50%)";
    return;
  }
  const inputRect = input.getBoundingClientRect();
  top = Math.min(Math.max(8, inputRect.top - POP_H / 2), window.innerHeight - POP_H - 8);
  pop.style.position = "fixed";
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}
// Wires the numpad onto every field flagged data-numeric within root.
function wireNumpads(root) {
  root.querySelectorAll("[data-numeric]").forEach((el) => {
    attachNumpad(el, { decimal: el.dataset.numeric !== "int", negative: el.dataset.negative === "true" });
  });
}
