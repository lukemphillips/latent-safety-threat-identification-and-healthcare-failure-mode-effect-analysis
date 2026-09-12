import { getState, update, resetToSample, clearAllData, restoreFromBackup, mergeBackup, findPlayer, getAutoBackups, restoreAutoBackupById } from '../store.js';
import { FORMATIONS, remapLineupToFormat } from '../formations.js';
import { escapeHtml, uid, copyToClipboard, resizeImageFile } from '../util.js';
import { openModal, closeModal, confirmDialog, alertDialog } from '../modal.js';
import { AGE_FORMATS, suggestFormatForAgeGroup } from '../ageFormats.js';
import { getErrorLog, clearErrorLog, formatErrorLogText } from '../errorLog.js';
import { autoSaveFileSupported, chooseAutoSaveFile, getAutoSaveFileName, clearAutoSaveFile } from '../fileHandle.js';

export function renderSettings(app) {
  const { team, players } = getState();
  const errorLog = getErrorLog();
  const autoBackups = getAutoBackups();
  const fileSaveSupported = autoSaveFileSupported();

  app.innerHTML = `
    <div class="page-title"><h1>Settings</h1></div>

    <a class="btn ghost block" href="#/help" style="margin-bottom:12px;">❓ Help &amp; How-To</a>

    <div class="card stack">
      ${fileSaveSupported ? `
        <p class="muted small mt-0">🗂️ A dated backup file downloads automatically after every match (see Data, below). This is instead for one single file, at a location you pick, that keeps overwriting itself with the latest data — so there's always exactly one current file rather than a growing pile. Desktop/laptop Chrome or Edge only — doesn't work on iPhone or iPad, even in Chrome there (see note below if that's what you're on).</p>
        <div id="autosave-file-status" class="small">Checking…</div>
        <button class="btn secondary block" data-action="choose-autosave-file">🗂️ Choose File Location</button>
        <button class="btn ghost block" data-action="clear-autosave-file" hidden id="clear-autosave-btn">Turn Off</button>
      ` : `
        <p class="muted small mt-0">🗂️ A single self-updating backup file at a location you pick isn't available on this device. It needs a desktop or laptop browser (Chrome or Edge) — it doesn't work on iPhone or iPad in any browser, including Chrome there, since Apple requires every browser on iOS to use the same underlying engine, which doesn't support this. The dated backup file that downloads after every match (see Data, below) still works here, on any device.</p>
      `}
    </div>

    <div class="section-title">Team</div>
    <form id="team-form" class="card stack">
      <div class="row" style="align-items:center; margin-bottom:4px;">
        <span class="jersey" style="width:52px; height:52px; overflow:hidden; font-size:24px; background:${team.logoDataUrl ? '#fff' : ''};">
          ${team.logoDataUrl ? `<img src="${team.logoDataUrl}" alt="Club logo" style="width:100%; height:100%; object-fit:contain;" />` : '⚽'}
        </span>
        <div class="stack" style="flex:1; gap:6px;">
          <label class="btn secondary sm" style="text-align:center; cursor:pointer;">
            📷 ${team.logoDataUrl ? 'Change' : 'Upload'} Club Logo
            <input type="file" accept="image/*" id="logo-upload-input" hidden />
          </label>
          ${team.logoDataUrl ? '<button type="button" class="btn ghost sm" data-action="remove-logo">Remove Logo</button>' : ''}
        </div>
      </div>
      <p class="muted small" style="margin-top:-6px;">Shows in the header in place of the default Boot Room crest. A square image works best — it's resized automatically, and stays on this device like everything else.</p>
      <div class="field">
        <label>Team name</label>
        <input type="text" name="name" value="${escapeHtml(team.name)}" required />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Age group</label>
          <input type="text" name="ageGroup" value="${escapeHtml(team.ageGroup)}" placeholder="e.g. U10" />
        </div>
        <div class="field">
          <label>Format</label>
          <select name="squadFormat">
            ${Object.values(FORMATIONS).map((f) => `<option value="${f.size}" ${team.squadFormat === f.size ? 'selected' : ''}>${f.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <button type="button" class="btn ghost sm" data-action="suggest-format">Suggest format for this age group</button>
      <div class="field-row">
        <div class="field">
          <label>Default minutes per period</label>
          <input type="number" name="periodMinutes" min="1" max="60" value="${team.periodMinutes}" />
        </div>
        <div class="field">
          <label>Default # of periods</label>
          <input type="number" name="numPeriods" min="1" max="4" value="${team.numPeriods}" />
        </div>
      </div>
      <p class="muted small" style="margin-top:-8px;">Used to pre-fill new games — each game can still set its own match length when it's scheduled.</p>
      <div class="field">
        <label>Minimum minutes on the pitch before a sub</label>
        <input type="number" name="minStintMinutes" min="0" max="30" step="1" value="${team.minStintMinutes ?? 4}" />
      </div>
      <label class="checkbox-row">
        <input type="checkbox" name="equalPlayingTimePolicy" ${team.equalPlayingTimePolicy ? 'checked' : ''} />
        Equal playing time policy (show fair-play suggestions during live games)
      </label>
      <label class="checkbox-row">
        <input type="checkbox" name="subAlertsEnabled" ${team.subAlertsEnabled !== false ? 'checked' : ''} />
        🔔 Vibrate/chime when a substitution is due (needs the equal playing
        time policy above; works even if you're on another tab)
      </label>
      <label class="checkbox-row">
        <input type="checkbox" name="enableCards" ${team.enableCards ? 'checked' : ''} />
        Log yellow/red cards (recommended for older age groups)
      </label>
      <button type="submit" class="btn block">Save Team Settings</button>
    </form>

    <details class="card">
      <summary style="cursor:pointer; font-weight:700;">Age-group format guide (FAI Player Development Plan)</summary>
      <p class="muted small">The framework DDSL and most Irish schoolboy/schoolgirl leagues build their own rules on. Always confirm against your own league's current rule book — leagues sometimes vary, especially at U11/U12.</p>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:5px 6px;">Age</th>
              <th style="text-align:left; padding:5px 6px;">Format</th>
              <th style="text-align:left; padding:5px 6px;">Duration</th>
              <th style="text-align:left; padding:5px 6px;">Pitch</th>
            </tr>
          </thead>
          <tbody>
            ${AGE_FORMATS.map((b) => `
              <tr style="border-top:1px solid var(--line);">
                <td style="padding:5px 6px; font-weight:600;">${b.label}</td>
                <td style="padding:5px 6px;">${b.squadFormat ? b.squadFormat + '-a-side' : '4v4 (no GK)'}</td>
                <td style="padding:5px 6px;">${b.numPeriods} × ${b.periodMinutes} min</td>
                <td style="padding:5px 6px;">${escapeHtml(b.pitch)}</td>
              </tr>
              ${b.notes ? `<tr><td colspan="4" class="muted" style="padding:0 6px 6px;">${escapeHtml(b.notes)}</td></tr>` : ''}
            `).join('')}
          </tbody>
        </table>
      </div>
    </details>

    <div class="section-title">Squad Rules</div>
    <div class="card">
      <p class="muted small mt-0">Pairs of players who should never both be off the pitch at the same time (e.g. only one confident goalkeeper cover). Advisory only — you can always override.</p>
      <div class="stack">
        ${(team.rules || []).length
          ? team.rules.map((r) => ruleRow(r)).join('')
          : '<p class="muted small">No rules set.</p>'}
      </div>
      <button class="btn secondary block" data-action="add-rule" style="margin-top:10px;">+ Add Rule</button>
    </div>

    <div class="section-title">Data</div>
    <div class="card stack">
      <p class="muted small mt-0">Everything here is stored only in this browser — no account, no server. That also means a private/incognito window, a device clearing site data, or opening this on a different browser or device starts from empty, sometimes with no warning. Back up your team from time to time, and definitely before a big change.</p>
      <button class="btn secondary block" data-action="backup-data">💾 Backup Team Data</button>
      <textarea id="backup-fallback" readonly hidden style="width:100%; min-height:100px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;"></textarea>
      <button class="btn ghost block" data-action="restore-data">📥 Restore from Backup</button>
    </div>
    <div class="card stack">
      <p class="muted small mt-0">Running two matches for this team at once (e.g. two 5-a-side games), each tracked on a different coach's phone? Have that coach send you their Backup (above), then bring it in here — unlike Restore, this adds their game(s) and any new players alongside what's already on this device instead of replacing it. Works with a file shared any way you like (a synced Dropbox/Google Drive/OneDrive folder, AirDrop, a message).</p>
      <button class="btn ghost block" data-action="merge-data">🔀 Merge in Another Coach's Backup</button>
    </div>
    <div class="card stack">
      <p class="muted small mt-0">Boot Room also snapshots a backup automatically on this device every time a match finishes — no need to remember to do it yourself. Keeps the 5 most recent.</p>
      ${autoBackups.length ? autoBackups.map(autoBackupRow).join('') : '<p class="muted small">None yet — one is saved the first time a match finishes.</p>'}
    </div>
    <div class="card stack">
      <p class="muted small mt-0">Use these to demo the app or start fresh.</p>
      <button class="btn secondary block" data-action="reset-sample">Reload Sample Data</button>
      <button class="btn danger block" data-action="clear-data">Clear All Data</button>
    </div>

    <div class="section-title">Diagnostics</div>
    <div class="card stack">
      <p class="muted small mt-0">If Boot Room misbehaves for you or another coach, errors are captured automatically here on that device — no need to remember exactly what happened. Copy the log and send it to whoever maintains the app.</p>
      <div class="small">${errorCountText(errorLog)}</div>
      <button class="btn secondary block" data-action="copy-error-log" ${errorLog.length ? '' : 'disabled'}>📋 Copy Error Log</button>
      <textarea id="error-log-fallback" readonly hidden style="width:100%; min-height:100px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;">${escapeHtml(formatErrorLogText())}</textarea>
      <button class="btn ghost block" data-action="clear-error-log" ${errorLog.length ? '' : 'disabled'}>Clear Log</button>
    </div>
  `;

  app.querySelector('#logo-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alertDialog('Please choose an image file (PNG, JPG, etc.).');
      return;
    }
    try {
      const dataUrl = await resizeImageFile(file);
      update((state) => { state.team.logoDataUrl = dataUrl; });
      renderSettings(app);
    } catch (err) {
      alertDialog(err.message || "Couldn't load that image — try a different file.");
    }
  });
  const removeLogoBtn = app.querySelector('[data-action="remove-logo"]');
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener('click', async () => {
      if (!(await confirmDialog('Remove the club logo? The header will go back to the default Boot Room crest.'))) return;
      update((state) => { delete state.team.logoDataUrl; });
      renderSettings(app);
    });
  }

  app.querySelector('[data-action="suggest-format"]').addEventListener('click', () => {
    const form = app.querySelector('#team-form');
    const ageGroupValue = form.querySelector('[name="ageGroup"]').value;
    const band = suggestFormatForAgeGroup(ageGroupValue);
    if (!band) {
      alertDialog('Enter an age group with a number in it (e.g. "U10") to get a suggestion.');
      return;
    }
    if (!band.squadFormat) {
      alertDialog(`${band.label}: ${band.notes}`);
      return;
    }
    form.querySelector('[name="squadFormat"]').value = String(band.squadFormat);
    form.querySelector('[name="periodMinutes"]').value = String(band.periodMinutes);
    form.querySelector('[name="numPeriods"]').value = String(band.numPeriods);
    alertDialog(`Suggested ${band.label} format applied: ${band.squadFormat}-a-side, ${band.numPeriods} × ${band.periodMinutes} min.${band.notes ? ' ' + band.notes : ''} Review and hit Save Team Settings to keep it.`);
  });

  app.querySelector('#team-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newFormat = Number(fd.get('squadFormat'));
    const formatRequested = newFormat !== team.squadFormat;

    // A live game's on-field target count reads the format live, but the
    // players actually out there don't move themselves — changing format
    // mid-match would desync "on field" from "target" with no sane fix.
    // Block just this field; everything else in the form still saves below.
    const liveGameExists = getState().games.some((g) => g.status === 'live');
    if (formatRequested && liveGameExists) {
      alertDialog("Can't change the squad format while a match is live — finish or end that match first. Your other changes here will still be saved.");
    }
    const applyFormat = formatRequested && !liveGameExists;

    update((state) => {
      state.team.name = (fd.get('name') || '').trim() || state.team.name;
      state.team.ageGroup = (fd.get('ageGroup') || '').trim();
      if (applyFormat) state.team.squadFormat = newFormat;
      state.team.periodMinutes = Number(fd.get('periodMinutes')) || state.team.periodMinutes;
      state.team.numPeriods = Number(fd.get('numPeriods')) || state.team.numPeriods;
      state.team.minStintMinutes = fd.get('minStintMinutes') === '' ? 0 : Number(fd.get('minStintMinutes'));
      state.team.equalPlayingTimePolicy = fd.get('equalPlayingTimePolicy') === 'on';
      state.team.subAlertsEnabled = fd.get('subAlertsEnabled') === 'on';
      state.team.enableCards = fd.get('enableCards') === 'on';
      if (applyFormat) {
        // Reshapes each lineup to the new formation instead of wiping it —
        // slots the new formation still has (gk, d1, m1, ...) keep their
        // player; anyone whose slot no longer exists just moves to the
        // bench, so nobody is silently dropped or stranded in a slot the
        // pitch no longer renders.
        state.games.forEach((g) => {
          if (g.status !== 'completed') g.lineup = { slots: remapLineupToFormat(g.lineup?.slots, newFormat) };
        });
      }
    });
  });

  app.querySelector('[data-action="reset-sample"]').addEventListener('click', async () => {
    if (await confirmDialog('Reload sample team, roster, and games? This replaces current data.', { okLabel: 'Reload', danger: true })) resetToSample();
  });
  app.querySelector('[data-action="clear-data"]').addEventListener('click', async () => {
    if (await confirmDialog('Clear all players and games? This cannot be undone.', { okLabel: 'Clear All', danger: true })) clearAllData();
  });

  const backupBtn = app.querySelector('[data-action="backup-data"]');
  const backupFallback = app.querySelector('#backup-fallback');
  backupBtn.addEventListener('click', async () => {
    const json = JSON.stringify(getState(), null, 2);
    backupFallback.value = json;
    await copyToClipboard(json, {
      onSuccess: () => { backupBtn.textContent = '✅ Copied! Paste it somewhere safe.'; },
      onFallback: () => {
        backupFallback.hidden = false;
        backupFallback.focus();
        backupFallback.select();
        backupBtn.textContent = 'Select the text below and copy it';
      },
    });
    setTimeout(() => { backupBtn.textContent = '💾 Backup Team Data'; }, 3000);
  });
  app.querySelector('[data-action="restore-data"]').addEventListener('click', () => openRestoreModal());
  app.querySelector('[data-action="merge-data"]').addEventListener('click', () => openMergeModal(app));
  app.querySelectorAll('[data-action="restore-auto-backup"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmDialog('Restore this automatic backup? It replaces everything currently in the app on this device.', { okLabel: 'Restore', danger: true }))) return;
      restoreAutoBackupById(btn.dataset.id);
      renderSettings(app);
    });
  });

  if (fileSaveSupported) {
    const statusEl = app.querySelector('#autosave-file-status');
    const clearBtn = app.querySelector('#clear-autosave-btn');
    getAutoSaveFileName().then((name) => {
      const el = app.querySelector('#autosave-file-status');
      const btn = app.querySelector('#clear-autosave-btn');
      if (!el) return; // settings re-rendered before this resolved
      el.textContent = name ? `Saving to: ${name}` : 'Not set up yet.';
      if (btn) btn.hidden = !name;
    });
    app.querySelector('[data-action="choose-autosave-file"]').addEventListener('click', async () => {
      try {
        const name = await chooseAutoSaveFile();
        statusEl.textContent = `Saving to: ${name}`;
        clearBtn.hidden = false;
      } catch (e) {
        if (e?.name !== 'AbortError') console.warn('Could not set the auto-save file', e);
      }
    });
    clearBtn.addEventListener('click', async () => {
      await clearAutoSaveFile();
      statusEl.textContent = 'Not set up yet.';
      clearBtn.hidden = true;
    });
  }

  app.querySelector('[data-action="add-rule"]').addEventListener('click', () => openRuleForm(players));
  app.querySelectorAll('[data-action="remove-rule"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      update((state) => {
        state.team.rules = (state.team.rules || []).filter((r) => r.id !== btn.dataset.id);
      });
    });
  });

  const copyLogBtn = app.querySelector('[data-action="copy-error-log"]');
  const logFallback = app.querySelector('#error-log-fallback');
  copyLogBtn.addEventListener('click', async () => {
    await copyToClipboard(formatErrorLogText(), {
      onSuccess: () => { copyLogBtn.textContent = '✅ Copied!'; },
      onFallback: () => {
        logFallback.hidden = false;
        logFallback.focus();
        logFallback.select();
        copyLogBtn.textContent = 'Select the text below and copy it';
      },
    });
    setTimeout(() => { copyLogBtn.textContent = '📋 Copy Error Log'; }, 2500);
  });
  app.querySelector('[data-action="clear-error-log"]').addEventListener('click', async () => {
    if (!(await confirmDialog('Clear the error log on this device?', { okLabel: 'Clear Log', danger: true }))) return;
    clearErrorLog();
    renderSettings(app);
  });
}

function autoBackupRow(backup) {
  const d = backup.data || {};
  const when = new Date(backup.at).toLocaleString();
  const summary = `${escapeHtml(d.team?.name || 'Unnamed team')} · ${(d.players || []).length} players · ${(d.games || []).length} games`;
  return `
    <div class="card-row">
      <span class="small">${when}<br /><span class="muted">${summary}</span></span>
      <button class="btn ghost sm" data-action="restore-auto-backup" data-id="${backup.id}">Restore</button>
    </div>
  `;
}

function errorCountText(errorLog) {
  if (!errorLog.length) return 'No errors logged on this device.';
  const last = errorLog[errorLog.length - 1];
  const when = new Date(last.at).toLocaleString();
  return `${errorLog.length} error${errorLog.length === 1 ? '' : 's'} logged — most recent ${when}.`;
}

function ruleRow(r) {
  const a = findPlayer(r.playerAId);
  const b = findPlayer(r.playerBId);
  return `
    <div class="card-row">
      <span class="small">${escapeHtml(a?.name || 'Unknown')} &amp; ${escapeHtml(b?.name || 'Unknown')} — keep at least one on the pitch</span>
      <button class="icon-btn" data-action="remove-rule" data-id="${r.id}" aria-label="Remove rule">✕</button>
    </div>
  `;
}

function openMergeModal(app) {
  openModal({
    title: "Merge in Another Coach's Backup",
    bodyHtml: `
      <p class="muted small mt-0">Paste the backup the other coach copied with "Backup Team Data" on their phone. This adds their game(s) and any players not already here — it won't remove or overwrite anything already on this device.</p>
      <form id="merge-form" class="stack">
        <textarea name="backup" required style="width:100%; min-height:160px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;" placeholder="Paste the other coach's backup JSON here"></textarea>
        <div id="merge-error" class="small" style="color:var(--red);" hidden></div>
        <button type="submit" class="btn secondary block">Merge In</button>
      </form>
    `,
    onMount: (modalEl) => {
      const errorEl = modalEl.querySelector('#merge-error');
      // Inline rather than alertDialog() for the same reason as the Restore
      // modal: an alert would close this modal to show itself, losing
      // whatever was pasted right when a typo needs fixing.
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

      modalEl.querySelector('#merge-form').addEventListener('submit', (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const raw = new FormData(e.target).get('backup');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          showError("That text isn't valid JSON — make sure you copied the whole backup.");
          return;
        }
        let summary;
        try {
          summary = mergeBackup(parsed);
        } catch (err) {
          showError(err.message);
          return;
        }
        closeModal();
        const parts = [];
        if (summary.gamesAdded) parts.push(`${summary.gamesAdded} game${summary.gamesAdded === 1 ? '' : 's'} added`);
        if (summary.gamesUpdated) parts.push(`${summary.gamesUpdated} game${summary.gamesUpdated === 1 ? '' : 's'} updated`);
        if (summary.playersAdded) parts.push(`${summary.playersAdded} player${summary.playersAdded === 1 ? '' : 's'} added`);
        if (summary.awardsAdded) parts.push(`${summary.awardsAdded} weekly award${summary.awardsAdded === 1 ? '' : 's'} added`);
        alertDialog(parts.length ? `Merged: ${parts.join(', ')}. An automatic backup of the combined data was just saved on this device too.` : 'Nothing new to merge in — this device already had everything from that backup.');
        renderSettings(app);
      });
    },
  });
}

function openRestoreModal() {
  openModal({
    title: 'Restore from Backup',
    bodyHtml: `
      <p class="muted small mt-0">Paste a backup you copied earlier with "Backup Team Data". This replaces everything currently in the app on this device.</p>
      <form id="restore-form" class="stack">
        <textarea name="backup" required style="width:100%; min-height:160px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;" placeholder="Paste backup JSON here"></textarea>
        <div id="restore-error" class="small" style="color:var(--red);" hidden></div>
        <button type="submit" class="btn danger block">Restore (replaces current data)</button>
      </form>
    `,
    onMount: (modalEl) => {
      const errorEl = modalEl.querySelector('#restore-error');
      // Shown inline rather than via alertDialog() — that would close this
      // very modal to show itself (only one modal at a time), losing
      // whatever the coach pasted right when they need to fix a typo.
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

      modalEl.querySelector('#restore-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const raw = new FormData(e.target).get('backup');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          showError("That text isn't valid JSON — make sure you copied the whole backup.");
          return;
        }
        if (!parsed || !parsed.team || !Array.isArray(parsed.players) || !Array.isArray(parsed.games)) {
          showError("That doesn't look like a Boot Room backup — expected an object with team, players, and games.");
          return;
        }
        if (!(await confirmDialog('Restore this backup? It replaces everything currently in the app on this device.', { okLabel: 'Restore', danger: true }))) return;
        restoreFromBackup(parsed);
        closeModal();
      });
    },
  });
}

function openRuleForm(players) {
  const active = players.filter((p) => p.active);
  if (active.length < 2) {
    alertDialog('You need at least two active players to set a rule.');
    return;
  }
  const options = (excludeId) => active
    .filter((p) => p.id !== excludeId)
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

  openModal({
    title: 'Add Squad Rule',
    bodyHtml: `
      <form id="rule-form" class="stack">
        <p class="muted small mt-0">These two players should never both be on the bench at the same time.</p>
        <div class="field">
          <label>Player A</label>
          <select name="playerA">${options()}</select>
        </div>
        <div class="field">
          <label>Player B</label>
          <select name="playerB">${options(active[0]?.id)}</select>
        </div>
        <button type="submit" class="btn block">Add Rule</button>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#rule-form');
      const selectA = form.querySelector('[name="playerA"]');
      const selectB = form.querySelector('[name="playerB"]');
      selectA.addEventListener('change', () => {
        const keep = selectB.value;
        selectB.innerHTML = options(selectA.value);
        if ([...selectB.options].some((o) => o.value === keep)) selectB.value = keep;
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const playerAId = selectA.value;
        const playerBId = selectB.value;
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        update((state) => {
          state.team.rules = state.team.rules || [];
          state.team.rules.push({ id: uid(), playerAId, playerBId });
        });
        closeModal();
      });
    },
  });
}
