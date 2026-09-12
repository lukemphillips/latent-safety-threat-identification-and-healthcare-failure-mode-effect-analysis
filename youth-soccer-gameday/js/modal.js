import { escapeHtml } from './util.js';

export function openModal({ title, bodyHtml, onMount }) {
  closeModal();
  const dlg = document.createElement('dialog');
  dlg.id = 'ysg-modal';
  dlg.className = 'modal';
  dlg.innerHTML = `
    <div class="modal-inner">
      <div class="modal-header">
        <h3>${title}</h3>
        <button type="button" class="icon-btn" data-close-modal aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close-modal]')) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  if (onMount) onMount(dlg);
  return dlg;
}

export function closeModal() {
  const existing = document.getElementById('ysg-modal');
  if (existing) existing.close();
}

// window.confirm()/alert() require the browser to grant a sandboxed
// iframe "allow-modals" — something an embedding page (like the Claude
// Artifact viewer) may not grant, which makes every native confirm()
// silently no-op. These use the same <dialog>-based modal as everything
// else in the app instead, so confirmations work the same wherever this
// is hosted. Both resolve to "declined" if dismissed any other way (✕,
// clicking outside, Esc) — same as a native confirm's Cancel.
export function confirmDialog(message, { title = 'Please confirm', okLabel = 'Continue', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const finish = (result) => {
      if (decided) return;
      decided = true;
      resolve(result);
      dlg.close();
    };
    const dlg = openModal({
      title,
      bodyHtml: `
        <p style="margin-top:0;">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn ${danger ? 'danger' : ''}" data-confirm-ok>${escapeHtml(okLabel)}</button>
          <button type="button" class="btn ghost" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
        modalEl.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
      },
    });
    dlg.addEventListener('close', () => finish(false));
  });
}

export function alertDialog(message, { title = 'Heads up' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const finish = () => {
      if (decided) return;
      decided = true;
      resolve();
      dlg.close();
    };
    const dlg = openModal({
      title,
      bodyHtml: `
        <p style="margin-top:0; white-space:pre-line;">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-alert-ok>OK</button>
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.querySelector('[data-alert-ok]').addEventListener('click', finish);
      },
    });
    dlg.addEventListener('close', finish);
  });
}
