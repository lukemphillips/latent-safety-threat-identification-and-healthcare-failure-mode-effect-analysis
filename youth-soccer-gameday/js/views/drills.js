import { getState, update, findDrill, hasStorageRoomFor } from '../store.js';
import { uid, escapeHtml, resizeImageFile, formatBytes } from '../util.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';

// Everything here lives in localStorage alongside the rest of the team's
// data, which has far less headroom than a normal file system — these caps
// keep one drill attachment from crowding out a season's worth of games.
const MAX_PDF_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_DIM = 1000;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_000_000;

// A curated starting set of "subheadings" a coach can tag a drill with,
// shown as one-tap chips; the "Add your own tag" field in the form covers
// anything not on this list, and once used, a custom tag shows up as its
// own filter chip in the library too (see usedTagsInOrder).
const PRESET_DRILL_TAGS = [
  'Warm-up', 'Passing', 'Dribbling & Ball Control', 'Shooting', 'Defending',
  'Possession / Rondo', 'Small-Sided Games', 'Fitness & Conditioning',
  'Goalkeeping', 'Set Pieces', 'Cool-down', 'Fun / Game-based',
];

let searchTerm = '';
let activeTagFilters = new Set();

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

export function renderDrillLibrary(app) {
  const { drills } = getState();
  const term = searchTerm.trim().toLowerCase();
  const tagFiltered = activeTagFilters.size
    ? drills.filter((d) => (d.tags || []).some((t) => activeTagFilters.has(t)))
    : drills;
  const filtered = term
    ? tagFiltered.filter((d) => d.name.toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term))
    : tagFiltered;
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const filterTags = usedTagsInOrder(drills);

  app.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Drill Library</h1>
        <div class="sub">Reusable drills you can pull into any training session's plan.</div>
      </div>
      <button class="btn" data-action="add-drill">+ Add Drill</button>
    </div>

    ${drills.length ? `
      <div class="field" style="margin-bottom:12px;">
        <input type="search" id="drill-search" placeholder="Search drills…" value="${escapeHtml(searchTerm)}" />
      </div>
    ` : ''}

    ${filterTags.length ? `
      <div class="chip-list" style="margin-bottom:12px;">
        ${filterTags.map((t) => `<button type="button" class="bench-chip ${activeTagFilters.has(t) ? 'picking' : ''}" data-tag-filter="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
        ${activeTagFilters.size ? '<button type="button" class="bench-chip" data-action="clear-tag-filters">✕ Clear filter</button>' : ''}
      </div>
    ` : ''}

    ${sorted.length ? sorted.map(drillCardHtml).join('') : (drills.length
      ? '<div class="card empty">No drills match.</div>'
      : '<div class="card empty">No drills yet — add your first one above.</div>')}
  `;

  app.querySelector('[data-action="add-drill"]').addEventListener('click', () => openDrillForm());

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
  return `
    <div class="card">
      <div class="card-row" style="align-items:flex-start;">
        <div>
          <div style="font-weight:700; font-size:15px;">${escapeHtml(drill.name)}</div>
          ${drill.description ? `<div class="muted small" style="margin-top:4px;">${escapeHtml(drill.description)}</div>` : ''}
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

export function openDrillForm(existing) {
  const pf = existing || { name: '', description: '', link: '', attachment: null, tags: [] };
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

        const drill = { id: existing ? existing.id : uid(), name, description, link, attachment: pendingAttachment, tags: [...selectedTags] };

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
