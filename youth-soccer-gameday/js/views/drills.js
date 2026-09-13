import { getState, update, findDrill, hasStorageRoomFor } from '../store.js';
import { uid, escapeHtml, resizeImageFile, formatBytes } from '../util.js';
import { openModal, closeModal, confirmDialog } from '../modal.js';

// Everything here lives in localStorage alongside the rest of the team's
// data, which has far less headroom than a normal file system — these caps
// keep one drill attachment from crowding out a season's worth of games.
const MAX_PDF_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_DIM = 1000;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_000_000;

let searchTerm = '';

export function renderDrillLibrary(app) {
  const { drills } = getState();
  const term = searchTerm.trim().toLowerCase();
  const filtered = term
    ? drills.filter((d) => d.name.toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term))
    : drills;
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

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

    ${sorted.length ? sorted.map(drillCardHtml).join('') : (drills.length
      ? '<div class="card empty">No drills match that search.</div>'
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

  app.querySelectorAll('[data-action="edit-drill"]').forEach((el) => {
    el.addEventListener('click', () => {
      const drill = findDrill(el.dataset.drillId);
      if (drill) openDrillForm(drill);
    });
  });
}

function drillCardHtml(drill) {
  return `
    <div class="card">
      <div class="card-row" style="align-items:flex-start;">
        <div>
          <div style="font-weight:700; font-size:15px;">${escapeHtml(drill.name)}</div>
          ${drill.description ? `<div class="muted small" style="margin-top:4px;">${escapeHtml(drill.description)}</div>` : ''}
          <div class="row" style="gap:12px; margin-top:8px;">
            ${drill.link ? `<a class="small" href="${escapeHtml(drill.link)}" target="_blank" rel="noopener">🔗 Link</a>` : ''}
            ${drill.attachment ? `<a class="small" href="${drill.attachment.dataUrl}" target="_blank" rel="noopener">📎 ${escapeHtml(drill.attachment.name)}</a>` : ''}
          </div>
        </div>
        <button class="icon-btn" data-action="edit-drill" data-drill-id="${drill.id}" aria-label="Edit drill">✏️</button>
      </div>
    </div>
  `;
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

export function openDrillForm(existing) {
  const pf = existing || { name: '', description: '', link: '', attachment: null };
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

        const drill = { id: existing ? existing.id : uid(), name, description, link, attachment: pendingAttachment };

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
