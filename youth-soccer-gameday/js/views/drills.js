import { getState, update, findDrill, hasStorageRoomFor } from '../store.js';
import { uid, escapeHtml, resizeImageFile, formatBytes, todayIso } from '../util.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';
import { STARTER_DRILLS } from '../starterDrills.js';

// Everything here lives in localStorage alongside the rest of the team's
// data, which has far less headroom than a normal file system — these caps
// keep one drill attachment from crowding out a season's worth of games.
const MAX_PDF_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_DIM = 1000;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_000_000;

const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
};

// A curated starting set of "subheadings" a coach can tag a drill with,
// shown as one-tap chips; the "Add your own tag" field in the form covers
// anything not on this list, and once used, a custom tag shows up as its
// own filter chip in the library too (see usedTagsInOrder).
const PRESET_DRILL_TAGS = [
  'Warm-up', 'Passing', 'Dribbling & Ball Control', 'Shooting', 'Defending',
  'Possession / Rondo', 'Small-Sided Games', 'Fitness & Conditioning',
  'Goalkeeping', 'Set Pieces', 'Cool-down', 'Fun / Game-based',
];

// Same six age bands as ageFormats.js (the app's canonical reference,
// sourced from the FAI Player Development Plan), kept as a separate
// dimension from category tags above — age and drill category are
// independent things to filter by, so they get their own chip row rather
// than being merged into one tag list.
export const PRESET_AGE_GROUPS = ['U7', 'U8-U9', 'U10-U11', 'U12', 'U13', 'U14+'];

let searchTerm = '';
let activeTagFilters = new Set();
let activeAgeFilters = new Set();

// Every tag actually used by a drill, presets first (in their curated
// order) then any custom tags after — so the filter row stays predictable
// rather than jumping around as tags are added, and never offers a filter
// chip for a category nothing is tagged with yet.
function usedTagsInOrder(drills) {
  const used = new Set();
  drills.forEach((d) => (d.tags || []).forEach((t) => used.add(t)));
  const customOnly = [...used].filter((t) => !PRESET_DRILL_TAGS.includes(t));
  return [...PRESET_DRILL_TAGS.filter((t) => used.has(t)), ...customOnly];
}

function usedAgeGroupsInOrder(drills) {
  const used = new Set();
  drills.forEach((d) => (d.ageGroups || []).forEach((a) => used.add(a)));
  const customOnly = [...used].filter((a) => !PRESET_AGE_GROUPS.includes(a));
  return [...PRESET_AGE_GROUPS.filter((a) => used.has(a)), ...customOnly];
}

export function renderDrillLibrary(app) {
  const { drills } = getState();
  const term = searchTerm.trim().toLowerCase();
  const tagFiltered = activeTagFilters.size
    ? drills.filter((d) => (d.tags || []).some((t) => activeTagFilters.has(t)))
    : drills;
  const ageFiltered = activeAgeFilters.size
    ? tagFiltered.filter((d) => (d.ageGroups || []).some((a) => activeAgeFilters.has(a)))
    : tagFiltered;
  const filtered = term
    ? ageFiltered.filter((d) => d.name.toLowerCase().includes(term)
        || (d.description || '').toLowerCase().includes(term)
        || (d.ageGroups || []).some((a) => a.toLowerCase().includes(term)))
    : ageFiltered;
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const filterTags = usedTagsInOrder(drills);
  const filterAgeGroups = usedAgeGroupsInOrder(drills);
  const starterDrillNames = new Set(STARTER_DRILLS.map((d) => d.name));
  const starterAlreadyLoaded = drills.length && STARTER_DRILLS.every((d) => starterDrillNames.has(d.name) && drills.some((existing) => existing.name === d.name));

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Drill Library</h1>
        <div class="sub">Reusable drills you can pull into any training session's plan.</div>
      </div>
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        <button class="btn" data-action="add-drill">+ Add Drill</button>
      </div>
    </div>

    <div class="row" style="gap:8px; margin-bottom:12px; flex-wrap:wrap;">
      <button class="btn ghost sm" data-action="load-starter-pack">📚 Load Starter Drill Pack</button>
      <button class="btn ghost sm" data-action="export-zip" ${drills.length ? '' : 'disabled'}>📦 Export ZIP</button>
      <label class="btn ghost sm" style="cursor:pointer;">
        📦 Import ZIP
        <input type="file" accept=".zip" id="drill-zip-import-input" hidden />
      </label>
    </div>
    <div id="drill-zip-status" class="muted small" style="margin-bottom:12px;" hidden></div>

    ${drills.length ? `
      <div class="field" style="margin-bottom:12px;">
        <input type="search" id="drill-search" placeholder="Search drills…" value="${escapeHtml(searchTerm)}" />
      </div>
    ` : ''}

    ${filterAgeGroups.length ? `
      <div class="muted small" style="margin-bottom:4px;">Age group</div>
      <div class="chip-list" style="margin-bottom:12px;">
        ${filterAgeGroups.map((a) => `<button type="button" class="bench-chip ${activeAgeFilters.has(a) ? 'picking' : ''}" data-age-filter="${escapeHtml(a)}">${escapeHtml(a)}</button>`).join('')}
        ${activeAgeFilters.size ? '<button type="button" class="bench-chip" data-action="clear-age-filters">✕ Clear</button>' : ''}
      </div>
    ` : ''}

    ${filterTags.length ? `
      <div class="muted small" style="margin-bottom:4px;">Category</div>
      <div class="chip-list" style="margin-bottom:12px;">
        ${filterTags.map((t) => `<button type="button" class="bench-chip ${activeTagFilters.has(t) ? 'picking' : ''}" data-tag-filter="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
        ${activeTagFilters.size ? '<button type="button" class="bench-chip" data-action="clear-tag-filters">✕ Clear</button>' : ''}
      </div>
    ` : ''}

    ${sorted.length ? sorted.map(drillCardHtml).join('') : (drills.length
      ? '<div class="card empty">No drills match.</div>'
      : '<div class="card empty">No drills yet — add your first one above, or load the starter pack for ~45 ready-made drills.</div>')}
  `;

  app.querySelector('[data-action="add-drill"]').addEventListener('click', () => openDrillForm());

  const loadStarterBtn = app.querySelector('[data-action="load-starter-pack"]');
  loadStarterBtn.addEventListener('click', () => {
    const message = loadStarterDrillPack();
    renderDrillLibrary(app);
    const freshStatusEl = app.querySelector('#drill-zip-status');
    freshStatusEl.textContent = message;
    freshStatusEl.hidden = false;
  });
  if (starterAlreadyLoaded) {
    loadStarterBtn.title = 'Already loaded — click again to add any missing ones.';
  }

  const zipStatusEl = app.querySelector('#drill-zip-status');
  const showZipStatus = (msg) => { zipStatusEl.textContent = msg; zipStatusEl.hidden = false; };

  const exportBtn = app.querySelector('[data-action="export-zip"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Preparing…';
      try {
        await exportDrillsZip(getState().drills);
      } catch (e) {
        showZipStatus(e.message || 'Could not build the ZIP file.');
      }
      exportBtn.disabled = false;
      exportBtn.textContent = '📦 Export ZIP';
    });
  }

  const importInput = app.querySelector('#drill-zip-import-input');
  if (importInput) {
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0];
      importInput.value = '';
      if (!file) return;
      showZipStatus('Importing…');
      let message;
      try {
        message = await importDrillsZip(file);
      } catch (e) {
        message = e.message || 'Could not read that ZIP file.';
      }
      // Re-render refreshes the drill list to include anything just
      // imported, which also rebuilds (and re-hides) the status element —
      // so the message has to be applied to the fresh one, after.
      renderDrillLibrary(app);
      const freshStatusEl = app.querySelector('#drill-zip-status');
      freshStatusEl.textContent = message;
      freshStatusEl.hidden = false;
    });
  }

  const searchInput = app.querySelector('#drill-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value;
      const cursor = searchInput.selectionStart;
      renderDrillLibrary(app);
      const restored = app.querySelector('#drill-search');
      restored.focus();
      restored.setSelectionRange(cursor, cursor);
    });
  }

  app.querySelectorAll('[data-tag-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tagFilter;
      if (activeTagFilters.has(tag)) activeTagFilters.delete(tag);
      else activeTagFilters.add(tag);
      renderDrillLibrary(app);
    });
  });
  const clearFiltersBtn = app.querySelector('[data-action="clear-tag-filters"]');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      activeTagFilters = new Set();
      renderDrillLibrary(app);
    });
  }

  app.querySelectorAll('[data-age-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      const age = el.dataset.ageFilter;
      if (activeAgeFilters.has(age)) activeAgeFilters.delete(age);
      else activeAgeFilters.add(age);
      renderDrillLibrary(app);
    });
  });
  const clearAgeFiltersBtn = app.querySelector('[data-action="clear-age-filters"]');
  if (clearAgeFiltersBtn) {
    clearAgeFiltersBtn.addEventListener('click', () => {
      activeAgeFilters = new Set();
      renderDrillLibrary(app);
    });
  }

  app.querySelectorAll('[data-action="edit-drill"]').forEach((el) => {
    el.addEventListener('click', () => {
      const drill = findDrill(el.dataset.drillId);
      if (drill) openDrillForm(drill);
    });
  });

  app.querySelectorAll('[data-action="share-attachment"]').forEach((el) => {
    el.addEventListener('click', () => {
      const drill = findDrill(el.dataset.drillId);
      if (drill && drill.attachment) shareOrDownloadAttachment(drill, el);
    });
  });

  app.querySelectorAll('[data-action="view-attachment"]').forEach((el) => {
    el.addEventListener('click', () => {
      const drill = findDrill(el.dataset.drillId);
      if (drill && drill.attachment) viewAttachment(drill.attachment);
    });
  });
}

function drillCardHtml(drill) {
  const tags = drill.tags || [];
  const ageGroups = drill.ageGroups || [];
  return `
    <div class="card">
      <div class="card-row" style="align-items:flex-start;">
        <div>
          <div style="font-weight:700; font-size:15px;">${escapeHtml(drill.name)}</div>
          ${drill.description ? `<div class="muted small" style="margin-top:4px;">${escapeHtml(drill.description)}</div>` : ''}
          ${ageGroups.length ? `<div class="row" style="gap:6px; margin-top:6px; flex-wrap:wrap;">${ageGroups.map((a) => `<span class="badge scheduled">🎯 ${escapeHtml(a)}</span>`).join('')}</div>` : ''}
          ${tags.length ? `<div class="row" style="gap:6px; margin-top:6px; flex-wrap:wrap;">${tags.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          <div class="row" style="gap:12px; margin-top:8px; flex-wrap:wrap;">
            ${drill.link ? `<a class="small" href="${escapeHtml(drill.link)}" target="_blank" rel="noopener">🔗 Link</a>` : ''}
            ${drill.attachment ? `<button type="button" class="small" data-action="view-attachment" data-drill-id="${drill.id}" style="background:none; border:none; padding:0; color:inherit; cursor:pointer; font:inherit;">📎 ${escapeHtml(drill.attachment.name)}</button>` : ''}
            ${drill.attachment ? `<button type="button" class="small" data-action="share-attachment" data-drill-id="${drill.id}" style="background:none; border:none; padding:0; color:inherit; cursor:pointer; font:inherit;">📤 Share / Download</button>` : ''}
          </div>
        </div>
        <button class="icon-btn" data-action="edit-drill" data-drill-id="${drill.id}" aria-label="Edit drill">✏️</button>
      </div>
    </div>
  `;
}

// Data: URLs are blocked as a top-level navigation target by modern
// browsers (a bare <a href="data:..." target="_blank"> silently fails to
// show anything) — converting to a same-origin blob: URL first sidesteps
// that restriction. The blank window is opened synchronously, before any
// await, so the browser still counts it as a direct response to the click
// and doesn't treat it as an unrequested popup.
function viewAttachment(attachment) {
  const win = window.open('', '_blank');
  (async () => {
    try {
      const blob = await (await fetch(attachment.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      if (!win) { downloadAttachment(attachment); return; }
      win.location = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (win) win.close();
      downloadAttachment(attachment);
    }
  })();
}

// Turns a stored attachment (a data: URL) back into a real File so it can
// go through the native share sheet — WhatsApp and Messages both accept a
// shared file that way, which a plain data: URL link can't offer on its
// own. Falls back to triggering a browser download wherever file sharing
// isn't available (most desktop browsers, older iOS), or if canShare()
// specifically rejects this file (e.g. a type/size the OS share sheet
// won't take) — but never after the coach has actively picked "Cancel" in
// the share sheet itself, since silently downloading right after that
// would be a surprise, not a fallback.
async function shareOrDownloadAttachment(drill, triggerEl) {
  const { attachment } = drill;
  const originalLabel = triggerEl.textContent;
  try {
    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      triggerEl.textContent = 'Preparing…';
      const mime = attachment.type === 'pdf' ? 'application/pdf' : 'image/jpeg';
      const blob = await (await fetch(attachment.dataUrl)).blob();
      const file = new File([blob], attachment.name, { type: blob.type || mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: drill.name, text: drill.description || drill.name });
        triggerEl.textContent = originalLabel;
        return;
      }
    }
  } catch (e) {
    triggerEl.textContent = originalLabel;
    if (e && e.name === 'AbortError') return; // coach cancelled the share sheet — don't also start a download
  }
  downloadAttachment(attachment);
  triggerEl.textContent = originalLabel;
}

function downloadAttachment(attachment) {
  const a = document.createElement('a');
  a.href = attachment.dataUrl;
  a.download = attachment.name || 'drill-attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Accepts bare domains ("youtube.com/xyz") by assuming https, but refuses
// any other explicit scheme (javascript:, data:, etc.) rather than storing
// it — this ends up in a real href a coach taps during a session.
function normalizeLink(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
  return `https://${trimmed}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Lazy-loaded the same way importRoster.js loads SheetJS for Excel files —
// only fetched the first time a coach actually exports or imports a ZIP,
// so nobody pays for it just by opening the Drill Library.
let jsZipLoadPromise = null;
function ensureJsZipLoaded() {
  if (window.JSZip) return Promise.resolve(true);
  if (jsZipLoadPromise) return jsZipLoadPromise;
  jsZipLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => resolve(Boolean(window.JSZip));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return jsZipLoadPromise;
}

// Bundles every drill into one .zip: a manifest (drills.json) plus each
// attachment as a real file under attachments/ — a coach can hand the
// whole thing to another coach, who loads it with Import ZIP below.
// Attachments ship as actual files rather than staying base64-in-JSON so
// the zip is a normal, inspectable bundle (and roughly 25% smaller).
async function exportDrillsZip(drills) {
  const loaded = await ensureJsZipLoaded();
  if (!loaded) throw new Error('Could not load the ZIP export tool — needs an internet connection. Try again in a moment.');

  const zip = new window.JSZip();
  const manifest = [];
  for (const d of drills) {
    const entry = { name: d.name, description: d.description || '', link: d.link || '', tags: d.tags || [], ageGroups: d.ageGroups || [] };
    if (d.attachment) {
      const blob = await (await fetch(d.attachment.dataUrl)).blob();
      // Record the attachment's real MIME type (jpeg photo, PDF, or an SVG
      // diagram) rather than assuming every "image" is a JPEG — needed
      // since the starter drill pack's diagrams are SVGs, not photos.
      const mime = blob.type || (d.attachment.type === 'pdf' ? 'application/pdf' : 'image/jpeg');
      const ext = MIME_EXTENSIONS[mime] || (d.attachment.type === 'pdf' ? '.pdf' : '.jpg');
      const zipPath = `attachments/${d.id}${ext}`;
      zip.file(zipPath, blob);
      entry.attachment = { file: zipPath, name: d.attachment.name, type: d.attachment.type, mime };
    }
    manifest.push(entry);
  }
  zip.file('drills.json', JSON.stringify({ version: 1, drills: manifest }, null, 2));

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boot-room-drills-${todayIso()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Reads a ZIP produced by exportDrillsZip (or one shaped the same way) and
// adds its drills to this device's library — always as new drills with
// fresh ids, since these are coming from someone else's library, not a
// backup of this one. Applies the same size caps and storage-quota check
// as adding a drill by hand, skipping just the attachment (keeping the
// drill's text) or the whole drill, whichever still fits, rather than
// failing the entire import over one oversized file.
async function importDrillsZip(file) {
  const loaded = await ensureJsZipLoaded();
  if (!loaded) throw new Error('Could not load the ZIP import tool — needs an internet connection. Try again in a moment.');

  let zip;
  try {
    zip = await window.JSZip.loadAsync(file);
  } catch (e) {
    throw new Error("That doesn't look like a valid ZIP file.");
  }

  const manifestFile = zip.file('drills.json');
  if (!manifestFile) throw new Error("That ZIP doesn't contain a drills.json — it doesn't look like a Boot Room drill export.");

  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch (e) {
    throw new Error("Could not read that ZIP's drill list.");
  }
  const entries = Array.isArray(manifest.drills) ? manifest.drills : [];
  if (!entries.length) return 'That ZIP had no drills in it.';

  const startingState = getState();
  const working = [...startingState.drills];
  let imported = 0, attachmentsSkipped = 0, drillsSkipped = 0;

  for (const entry of entries) {
    let attachment = null;
    if (entry.attachment && entry.attachment.file) {
      const fileEntry = zip.file(entry.attachment.file);
      if (fileEntry) {
        try {
          const attachmentType = entry.attachment.type === 'pdf' ? 'pdf' : 'image';
          // Prefer the manifest's own recorded MIME (added once exports
          // started tagging it, so an SVG diagram round-trips as an SVG
          // rather than being forced to JPEG); older exports without it
          // fall back to the previous pdf/jpeg-only assumption.
          const mime = entry.attachment.mime || (attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg');
          // A file read back out of a zip archive doesn't reliably carry its
          // original MIME type (JSZip only preserves one if it was given one
          // when the file was added) — rewrap it with the type the manifest
          // says it should be, rather than trusting whatever (or nothing)
          // comes back, so the resulting data: URL actually opens as an
          // image/PDF instead of a generic, unrenderable octet-stream.
          const rawBlob = await fileEntry.async('blob');
          const blob = new Blob([rawBlob], { type: mime });
          const dataUrl = await readFileAsDataUrl(blob);
          if (dataUrl.length <= MAX_ATTACHMENT_DATA_URL_LENGTH) {
            attachment = { name: entry.attachment.name || entry.attachment.file, type: attachmentType, dataUrl };
          }
        } catch (e) {
          // Unreadable attachment — fall through and import the drill without it.
        }
      }
    }

    const drill = {
      id: uid(),
      name: (entry.name || 'Imported Drill').trim() || 'Imported Drill',
      description: entry.description || '',
      link: normalizeLink(entry.link || ''),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      ageGroups: Array.isArray(entry.ageGroups) ? entry.ageGroups : [],
      attachment,
    };

    if (attachment && !hasStorageRoomFor({ ...startingState, drills: [...working, drill] })) {
      const withoutAttachment = { ...drill, attachment: null };
      if (hasStorageRoomFor({ ...startingState, drills: [...working, withoutAttachment] })) {
        working.push(withoutAttachment);
        imported += 1;
        attachmentsSkipped += 1;
        continue;
      }
      drillsSkipped += 1;
      continue;
    }
    if (!hasStorageRoomFor({ ...startingState, drills: [...working, drill] })) {
      drillsSkipped += 1;
      continue;
    }

    working.push(drill);
    imported += 1;
  }

  update((state) => { state.drills = working; });

  const parts = [`Imported ${imported} drill${imported === 1 ? '' : 's'}.`];
  if (attachmentsSkipped) parts.push(`${attachmentsSkipped} attachment${attachmentsSkipped === 1 ? '' : 's'} left out (too large for this device).`);
  if (drillsSkipped) parts.push(`${drillsSkipped} drill${drillsSkipped === 1 ? '' : 's'} skipped (storage full).`);
  return parts.join(' ');
}

function attachmentStatusHtml(attachment) {
  if (!attachment) return 'No attachment.';
  return `Current: ${escapeHtml(attachment.name)} (${formatBytes(attachment.dataUrl.length)}) ` +
    `<button type="button" class="btn ghost sm" data-action="remove-attachment" style="margin-left:6px;">Remove</button>`;
}

function tagChipsHtml(selectedTags) {
  const allTags = [...PRESET_DRILL_TAGS, ...[...selectedTags].filter((t) => !PRESET_DRILL_TAGS.includes(t))];
  return allTags.map((t) => `
    <button type="button" class="bench-chip ${selectedTags.has(t) ? 'picking' : ''}" data-tag-toggle="${escapeHtml(t)}">${escapeHtml(t)}</button>
  `).join('');
}

function ageGroupChipsHtml(selectedAgeGroups) {
  return PRESET_AGE_GROUPS.map((a) => `
    <button type="button" class="bench-chip ${selectedAgeGroups.has(a) ? 'picking' : ''}" data-age-toggle="${escapeHtml(a)}">${escapeHtml(a)}</button>
  `).join('');
}

// A handful of starter drills carry a small original diagram (cone/player
// layout) as inline SVG markup rather than a data: URL, since that keeps
// starterDrills.js readable as plain text — this turns it into the same
// { name, type, dataUrl } shape as a hand-uploaded attachment, built as an
// SVG data: URL (tiny, and needs no base64 step).
function diagramToAttachment(entry) {
  if (!entry.diagramSvg) return null;
  return {
    name: `${entry.name} diagram.svg`,
    type: 'image',
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(entry.diagramSvg)}`,
  };
}

// Adds the built-in starter set (see js/starterDrills.js) to this device's
// library, skipping — by name — any that are already present so clicking
// the button again (or clicking it on a library that already has some of
// these drills manually added) doesn't create duplicates. Uses the same
// per-drill storage-quota check as ZIP import, though these diagrams are
// tiny enough that check should basically never trip.
function loadStarterDrillPack() {
  const startingState = getState();
  const existingNames = new Set(startingState.drills.map((d) => d.name));
  const working = [...startingState.drills];
  let added = 0, skippedExisting = 0, skippedStorage = 0;

  for (const entry of STARTER_DRILLS) {
    if (existingNames.has(entry.name)) { skippedExisting += 1; continue; }
    const drill = {
      id: uid(),
      name: entry.name,
      description: entry.description || '',
      link: entry.link || '',
      attachment: diagramToAttachment(entry),
      tags: [...(entry.tags || [])],
      ageGroups: [...(entry.ageGroups || [])],
    };
    if (!hasStorageRoomFor({ ...startingState, drills: [...working, drill] })) {
      skippedStorage += 1;
      continue;
    }
    working.push(drill);
    existingNames.add(drill.name);
    added += 1;
  }

  if (added) update((state) => { state.drills = working; });

  if (!added && skippedExisting && !skippedStorage) {
    return 'Starter pack already loaded — nothing new to add.';
  }
  const parts = [`Added ${added} starter drill${added === 1 ? '' : 's'}.`];
  if (skippedExisting) parts.push(`${skippedExisting} already in your library.`);
  if (skippedStorage) parts.push(`${skippedStorage} skipped (storage full).`);
  return parts.join(' ');
}

export function openDrillForm(existing) {
  const pf = existing || { name: '', description: '', link: '', attachment: null, tags: [], ageGroups: [] };
  let pendingAttachment = pf.attachment;

  openModal({
    title: existing ? 'Edit Drill' : 'Add Drill',
    bodyHtml: `
      <form id="drill-form" class="stack">
        <div class="field">
          <label>Name</label>
          <input type="text" name="name" required value="${escapeHtml(pf.name)}" placeholder="e.g. Passing Triangles" />
        </div>
        <div class="field">
          <label>Description</label>
          <textarea name="description" placeholder="How it works, setup, coaching points…">${escapeHtml(pf.description || '')}</textarea>
        </div>
        <div class="field">
          <label>Age groups (optional)</label>
          <div class="chip-list" id="drill-age-groups"></div>
        </div>
        <div class="field">
          <label>Tags (optional)</label>
          <div class="chip-list" id="drill-tags"></div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <input type="text" id="drill-custom-tag" placeholder="Add your own tag…" style="flex:1;" />
            <button type="button" class="btn ghost sm" data-action="add-custom-tag">+ Add Tag</button>
          </div>
        </div>
        <div class="field">
          <label>Weblink (optional)</label>
          <input type="text" name="link" value="${escapeHtml(pf.link || '')}" placeholder="e.g. a video or article URL" />
        </div>
        <div class="field">
          <label>Attach a PDF or image (optional)</label>
          <input type="file" id="drill-file" accept="application/pdf,image/*" />
          <div class="muted small" id="drill-attachment-status" style="margin-top:6px;">${attachmentStatusHtml(pf.attachment)}</div>
          <div class="muted small" style="margin-top:4px;">Images are resized automatically. PDFs are capped at about ${formatBytes(MAX_PDF_BYTES)} — everything here is stored on this device, and a very large file can crowd out other team data.</div>
        </div>
        <div id="drill-form-error" class="small" style="color:var(--red);" hidden></div>
        <div class="modal-actions">
          <button type="submit" class="btn block">${existing ? 'Save' : 'Add Drill'}</button>
          ${existing ? '<button type="button" class="btn danger" data-action="delete-drill">Delete</button>' : ''}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#drill-form');
      const fileInput = modalEl.querySelector('#drill-file');
      const statusEl = modalEl.querySelector('#drill-attachment-status');
      const errorEl = modalEl.querySelector('#drill-form-error');

      const selectedTags = new Set(pf.tags || []);
      const tagsContainer = modalEl.querySelector('#drill-tags');
      const customTagInput = modalEl.querySelector('#drill-custom-tag');
      function renderTags() {
        tagsContainer.innerHTML = tagChipsHtml(selectedTags);
        tagsContainer.querySelectorAll('[data-tag-toggle]').forEach((el) => {
          el.addEventListener('click', () => {
            const tag = el.dataset.tagToggle;
            if (selectedTags.has(tag)) selectedTags.delete(tag);
            else selectedTags.add(tag);
            renderTags();
          });
        });
      }
      renderTags();

      const selectedAgeGroups = new Set(pf.ageGroups || []);
      const ageGroupsContainer = modalEl.querySelector('#drill-age-groups');
      function renderAgeGroups() {
        ageGroupsContainer.innerHTML = ageGroupChipsHtml(selectedAgeGroups);
        ageGroupsContainer.querySelectorAll('[data-age-toggle]').forEach((el) => {
          el.addEventListener('click', () => {
            const age = el.dataset.ageToggle;
            if (selectedAgeGroups.has(age)) selectedAgeGroups.delete(age);
            else selectedAgeGroups.add(age);
            renderAgeGroups();
          });
        });
      }
      renderAgeGroups();
      const addCustomTag = () => {
        const val = customTagInput.value.trim();
        if (!val) return;
        selectedTags.add(val);
        customTagInput.value = '';
        renderTags();
      };
      modalEl.querySelector('[data-action="add-custom-tag"]').addEventListener('click', addCustomTag);
      customTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); }
      });
      // Inline rather than alertDialog() — same reason as the Restore/Merge
      // modals in Settings: an alert is itself a modal, and this app only
      // ever shows one at a time, so opening it would close this form and
      // lose whatever the coach already typed.
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

      const refreshStatus = () => { statusEl.innerHTML = attachmentStatusHtml(pendingAttachment); bindRemoveButton(); };
      function bindRemoveButton() {
        const removeBtn = statusEl.querySelector('[data-action="remove-attachment"]');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            pendingAttachment = null;
            fileInput.value = '';
            refreshStatus();
          });
        }
      }
      bindRemoveButton();

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        errorEl.hidden = true;
        statusEl.textContent = 'Processing…';
        try {
          let attachment;
          if (file.type.startsWith('image/')) {
            const dataUrl = await resizeImageFile(file, MAX_IMAGE_DIM, { mimeType: 'image/jpeg', quality: 0.82 });
            if (dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
              throw new Error("That image is still too large after resizing — try a smaller photo, or a link instead.");
            }
            attachment = { name: file.name, type: 'image', dataUrl };
          } else if (file.type === 'application/pdf') {
            if (file.size > MAX_PDF_BYTES) {
              throw new Error(`That PDF is ${formatBytes(file.size)} — please keep attachments under ${formatBytes(MAX_PDF_BYTES)}, or share it as a link instead.`);
            }
            const dataUrl = await readFileAsDataUrl(file);
            attachment = { name: file.name, type: 'pdf', dataUrl };
          } else {
            throw new Error('Only PDF and image files are supported here — try a weblink instead.');
          }
          pendingAttachment = attachment;
          refreshStatus();
        } catch (e) {
          fileInput.value = '';
          refreshStatus();
          showError(e.message || 'Could not read that file.');
        }
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const fd = new FormData(form);
        const name = (fd.get('name') || '').trim();
        if (!name) return;
        const description = (fd.get('description') || '').trim();
        const rawLink = (fd.get('link') || '').trim();
        const link = normalizeLink(rawLink);
        if (rawLink && !link) {
          showError("That web address doesn't look right — include http(s):// or leave it blank.");
          return;
        }

        const drill = { id: existing ? existing.id : uid(), name, description, link, attachment: pendingAttachment, tags: [...selectedTags], ageGroups: [...selectedAgeGroups] };

        const s = getState();
        const nextDrills = existing
          ? s.drills.map((d) => (d.id === existing.id ? drill : d))
          : [...s.drills, drill];
        if (!hasStorageRoomFor({ ...s, drills: nextDrills })) {
          showError("This device's storage is full — this drill (with its attachment) doesn't fit alongside your existing team data. Try removing the attachment and using a weblink instead, or check Settings > Data.");
          return;
        }

        update((state) => {
          if (existing) {
            const idx = state.drills.findIndex((d) => d.id === existing.id);
            if (idx !== -1) state.drills[idx] = drill;
          } else {
            state.drills.push(drill);
          }
        });
        closeModal();
      });

      const deleteBtn = modalEl.querySelector('[data-action="delete-drill"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!(await confirmDialog(`Delete "${existing.name}"? This can't be undone.`, { okLabel: 'Delete', danger: true }))) return;
          update((state) => {
            state.drills = state.drills.filter((d) => d.id !== existing.id);
          });
          closeModal();
        });
      }
    },
  });
}
