/* Shared state store for the Trauma Resuscitation Documentation App prototype.
   Event-sourced timeline (vitals, interventions, medications, blood products,
   blood gas, team attendance) + a plain record object for one-time fields.
   Persisted to localStorage; synced live across windows/tabs via BroadcastChannel
   (this models the real deployment: one cart PC driving two displays). */

const STORAGE_KEY = "trauma_app_state_v1";
const CHANNEL_NAME = "trauma_app_sync_v1";

const DEFAULT_INTERVENTIONS = [
  "O2 applied", "Airway adjunct inserted", "Airway secured (ETT)",
  "Needle decompression", "Chest drain inserted", "Non-invasive ventilation",
  "IV access obtained", "IO access obtained", "Fluid bolus given",
  "Direct pressure haemorrhage control", "Tourniquet applied", "Pelvic binder applied",
  "Splint applied", "Log roll performed", "Urinary catheter inserted",
  "Wound dressed", "Patient log rolled", "Cervical collar applied",
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

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function emptyRecord() {
  return {
    caseId: null,
    startedAt: null,
    preAlert: {
      timeOfCall: null, callType: "", source: "", eta: "", age: "", sex: "",
      mechanism: "", mechanismOther: "", suspectedInjuries: [], criteria: [],
      teamGrade: "", bay: "",
    },
    handover: {
      identifiers: "", timeOfInjury: "", mechanism: "", injuries: "", signs: "",
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
    // Migrate: ensure new fields exist if loading an older saved state
    if (!this._state.config) { this._state.config = { interventionsList: DEFAULT_INTERVENTIONS.slice(), medicationsList: DEFAULT_MEDICATIONS.slice() }; needsPersist = true; }
    if (!this._state.users) { this._state.users = []; needsPersist = true; }
    if (this._state.users.length === 0) { await this._seedAdmin(); needsPersist = true; }

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

  _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    this._channel.postMessage({ type: "state-updated" });
    this._notify();
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

  addTimelineEvent(kind, payload, user) {
    const ev = { id: "ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), ts: Date.now(), kind, user: user || "unknown", ...payload };
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
function fmtElapsed(startTs) {
  if (!startTs) return "00:00";
  const s = Math.floor((Date.now() - startTs) / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
