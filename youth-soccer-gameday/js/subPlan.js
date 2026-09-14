import { escapeHtml } from './util.js';
import { openModal, closeModal, confirmDialog } from './modal.js';

// A manual substitution plan for a game — the coach's own explicit
// rotation schedule ("Player X on for Player Y at minute 20"), as opposed
// to the automatic fair-play suggestions elsewhere on the live view. Same
// shape and same section works both pre-match (Squad tab, before kickoff)
// and live (the match tracker) — only the options offered for who can be
// "coming off"/"coming on", and whether a due-time countdown and an
// "execute now" button show up, differ between the two call sites.
// Entries: { id, outId, inId, atMinute }.

export function sortSubPlan(entries) {
  return [...(entries || [])].sort((a, b) => a.atMinute - b.atMinute);
}

// The soonest not-yet-executed entry where this player is the one coming
// on — used to show a bench player's own "due in" line.
export function nextPlannedEntryFor(playerId, subPlan) {
  return sortSubPlan(subPlan).find((e) => e.inId === playerId) || null;
}

export function openSubPlanEntryForm({ existing, outgoingOptions, incomingOptions, onSave, onDelete }) {
  openModal({
    title: existing ? 'Edit Planned Sub' : 'Add Planned Sub',
    bodyHtml: `
      <form id="sub-plan-form" class="stack">
        <div class="field">
          <label>Coming off</label>
          <select name="outId" required>
            <option value="">Choose…</option>
            ${outgoingOptions.map((p) => `<option value="${p.id}" ${existing?.outId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Coming on</label>
          <select name="inId" required>
            <option value="">Choose…</option>
            ${incomingOptions.map((p) => `<option value="${p.id}" ${existing?.inId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>At minute</label>
          <input type="number" name="atMinute" min="0" max="200" value="${existing?.atMinute ?? ''}" required />
        </div>
        <div id="sub-plan-form-error" class="small" style="color:var(--red);" hidden></div>
        <div class="modal-actions">
          <button type="submit" class="btn block">${existing ? 'Save' : 'Add to Plan'}</button>
          ${existing ? '<button type="button" class="btn danger" data-action="delete-plan-entry">Delete</button>' : ''}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#sub-plan-form');
      const errorEl = modalEl.querySelector('#sub-plan-form-error');
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const fd = new FormData(form);
        const outId = fd.get('outId');
        const inId = fd.get('inId');
        const atMinute = Number(fd.get('atMinute'));
        if (!outId || !inId) { showError('Pick both players.'); return; }
        if (outId === inId) { showError("Coming off and coming on can't be the same player."); return; }
        if (!Number.isFinite(atMinute) || atMinute < 0) { showError('Enter a valid minute.'); return; }
        onSave({ id: existing?.id, outId, inId, atMinute });
        closeModal();
      });

      const delBtn = modalEl.querySelector('[data-action="delete-plan-entry"]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!(await confirmDialog('Remove this planned sub?', { okLabel: 'Remove', danger: true }))) return;
          onDelete(existing.id);
          closeModal();
        });
      }
    },
  });
}

function subPlanRowHtml(entry, byId, { elapsedMinutes, showExecute }) {
  const outName = escapeHtml(byId[entry.outId]?.name || '?');
  const inName = escapeHtml(byId[entry.inId]?.name || '?');
  let statusHtml = `<span class="badge pending">at ${entry.atMinute}′</span>`;
  if (elapsedMinutes != null) {
    const diff = entry.atMinute - elapsedMinutes;
    statusHtml = diff <= 0
      ? `<span class="badge live">⏰ Due now</span>`
      : `<span class="badge pending">in ~${Math.ceil(diff)}′</span>`;
  }
  return `
    <div class="card-row" data-plan-entry="${entry.id}" style="padding:8px 0; border-bottom:1px solid var(--line);">
      <div>
        <div style="font-weight:600; font-size:13.5px;">${inName} <span class="muted">for</span> ${outName}</div>
        <div style="margin-top:4px;">${statusHtml}</div>
      </div>
      <div class="row" style="gap:6px;">
        ${showExecute ? `<button type="button" class="btn secondary sm" data-action="execute-plan-entry" data-plan-id="${entry.id}">✅ Sub Now</button>` : ''}
        <button type="button" class="icon-btn" data-action="edit-plan-entry" data-plan-id="${entry.id}" aria-label="Edit planned sub">✏️</button>
      </div>
    </div>
  `;
}

// elapsedMinutes: pass null pre-match (no clock yet — just shows the
// planned minute), or the live match's current elapsed minutes to show a
// due-now/countdown badge instead. showExecute only makes sense live.
export function subPlanSectionHtml(subPlan, byId, { elapsedMinutes = null, showExecute = false } = {}) {
  const sorted = sortSubPlan(subPlan);
  return `
    <div class="section-title">📋 Substitution Plan</div>
    <div class="card">
      <p class="muted small" style="margin:0 0 8px;">Your own rotation schedule — advisory only, nothing here subs a player on its own. ${showExecute ? 'Tap "Sub Now" when you\'re ready to actually make the swap.' : "Build it now, then work through it once the match is live."}</p>
      ${sorted.length ? sorted.map((entry) => subPlanRowHtml(entry, byId, { elapsedMinutes, showExecute })).join('') : '<p class="muted small" style="margin:0;">No subs planned yet.</p>'}
      <button type="button" class="btn ghost sm block" data-action="add-plan-entry" style="margin-top:${sorted.length ? '10px' : '0'};">+ Add Planned Sub</button>
    </div>
  `;
}

// A bench player's own "when am I on" line, shown under their card —
// pre-match this is just the static planned minute; live it's a
// countdown (or "due now") off the actual match clock.
export function benchDueLineHtml(playerId, subPlan, elapsedMinutes) {
  const entry = nextPlannedEntryFor(playerId, subPlan);
  if (!entry) return '';
  if (elapsedMinutes == null) return `<div class="pt">🕐 Planned on at ${entry.atMinute}′</div>`;
  const diff = entry.atMinute - elapsedMinutes;
  return diff <= 0
    ? `<div class="pt">⏰ Due on now</div>`
    : `<div class="pt">🕐 On in ~${Math.ceil(diff)}′</div>`;
}
