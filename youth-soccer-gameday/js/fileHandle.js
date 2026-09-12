// A single, self-updating local backup file — the coach picks a file
// location once (e.g. "gaffer-backup.json" in Documents) and Gaffer
// silently overwrites that same file after every match finishes, instead
// of downloading a new dated file each time (see util.js's
// tryDownloadFile, which still runs alongside this as a full history).
//
// Only available in browsers with the File System Access API (Chrome,
// Edge — not Safari or Firefox). The chosen file handle can't be stored in
// localStorage (it isn't JSON-serializable), so it lives in a small
// IndexedDB store instead; the permission grant on it may need
// re-confirming by the browser from time to time, which is why every
// write here is best-effort and silently gives up rather than blocking
// anything else.

const DB_NAME = 'gaffer-fs';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'autoSaveFile';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function autoSaveFileSupported() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

// Opens the native "Save As" picker and remembers the chosen file for
// future writes. Must be called from a user gesture (e.g. a button click).
export async function chooseAutoSaveFile() {
  const handle = await window.showSaveFilePicker({
    suggestedName: 'gaffer-backup.json',
    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
  });
  await idbSet(HANDLE_KEY, handle);
  return handle.name;
}

export async function getAutoSaveFileName() {
  if (!autoSaveFileSupported()) return null;
  try {
    const handle = await idbGet(HANDLE_KEY);
    return handle ? handle.name : null;
  } catch (e) {
    console.warn('Could not read the saved auto-save file handle', e);
    return null;
  }
}

export async function clearAutoSaveFile() {
  await idbDelete(HANDLE_KEY);
}

// Best-effort: overwrites the previously-chosen file with `text`. Silently
// does nothing if no file has been chosen, the browser needs the
// permission re-confirmed outside of a user gesture, or anything else
// goes wrong — the per-match downloaded file and the on-device rolling
// snapshot (see store.js) are what's guaranteed to work regardless.
export async function writeAutoSaveFile(text) {
  if (!autoSaveFileSupported()) return false;
  try {
    const handle = await idbGet(HANDLE_KEY);
    if (!handle) return false;
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      permission = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (permission !== 'granted') return false;
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch (e) {
    console.warn('Could not write the auto-save file', e);
    return false;
  }
}
