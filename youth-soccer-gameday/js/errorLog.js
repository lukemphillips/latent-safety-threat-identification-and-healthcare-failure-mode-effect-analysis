// Captures uncaught errors on this device so a coach can copy them and send
// them to whoever maintains the app, without needing a server to report to.
// Kept in its own localStorage key, separate from the team/roster data, so
// clearing one never touches the other.

// Kept as "gaffer-..." (the app's previous name) rather than renamed to
// match the Boot Room rebrand — it's an internal, invisible identifier, and
// changing it would just orphan any existing log on a coach's device.
const KEY = 'gaffer-error-log-v1';
const MAX_ENTRIES = 30;

function readLog() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLog(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // localStorage unavailable or full — nothing more we can do here.
  }
}

function addEntry(entry) {
  const entries = readLog();
  entries.push({ at: new Date().toISOString(), hash: location.hash || '#/', ...entry });
  writeLog(entries);
}

export function initErrorLogging() {
  window.addEventListener('error', (e) => {
    addEntry({
      type: 'error',
      message: e.message || 'Unknown error',
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '',
      stack: e.error && e.error.stack ? String(e.error.stack) : '',
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    addEntry({
      type: 'unhandledrejection',
      message: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack ? String(reason.stack) : '',
    });
  });
}

export function getErrorLog() {
  return readLog();
}

export function clearErrorLog() {
  writeLog([]);
}

export function formatErrorLogText() {
  const entries = getErrorLog();
  if (!entries.length) return 'No errors logged on this device.';
  return entries.map((e, i) => {
    const lines = [
      `#${i + 1} [${e.at}] ${e.type}`,
      `Screen: ${e.hash}`,
      e.message,
    ];
    if (e.source) lines.push(`At: ${e.source}`);
    if (e.stack) lines.push(e.stack);
    return lines.join('\n');
  }).join('\n---\n');
}
