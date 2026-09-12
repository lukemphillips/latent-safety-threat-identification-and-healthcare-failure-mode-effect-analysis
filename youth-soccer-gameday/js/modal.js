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
