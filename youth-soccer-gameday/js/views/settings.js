import { getState, update, resetToSample, clearAllData, restoreFromBackup, mergeBackup, findPlayer, getAutoBackups, restoreAutoBackupById, archivableCounts, buildArchivePayload, removeArchivedData } from '../store.js';
import { PRESET_FORMATIONS, formationOptionsFor, buildCustomFormation, remapLineupToFormat } from '../formations.js';
import { escapeHtml, uid, copyToClipboard, resizeImageFile, matchEligiblePlayers, todayIso } from '../util.js';
import { openModal, closeModal, confirmDialog, alertDialog } from '../modal.js';
import { getErrorLog, clearErrorLog, formatErrorLogText } from '../errorLog.js';
import { getSyncConfig, isMatchdayOnly, buildAppsScript, generateSyncTokens, setUpAsFullEditor, joinWithLink, syncNow, disconnectCloudSync } from '../cloudSync.js';

// Guards a post-await re-render (e.g. after "Sync Now", which can take a
// couple of seconds against a real Apps Script) against overwriting a
// screen the coach has since navigated away to.
function isOnSettingsRoute() {
  const hash = location.hash || '#/';
  return hash.replace(/^#\/?/, '').split('/')[0] === 'settings';
}

// Empty until the coach explicitly picks a cutoff date — archiving nothing
// by default is safer than pre-selecting one that might surprise them.
let archiveCutoffDate = '';
// Set once the archive copy has actually been placed on the clipboard (or
// the fallback text box shown) for the CURRENT cutoff date — changing the
// date invalidates it, so "Remove" can never fire for a copy that doesn't
// match what's about to be deleted.
let archiveCopiedForDate = null;
// Whether the "couldn't use the clipboard, here's the text to select
// instead" fallback box is showing — its own content is always rendered
// fresh from archiveCutoffDate in the template below (see the error-log
// and Backup Team Data fallback boxes for the same pattern), rather than
// set as a one-off runtime .value, since a later re-render (e.g. to show
// the Remove button) would otherwise wipe out anything set that way.
let archiveFallbackVisible = false;

export function renderSettings(app) {
  const { team, players } = getState();
  const errorLog = getErrorLog();
  const autoBackups = getAutoBackups();
  const syncConfig = getSyncConfig();
  const archiveCounts = archiveCutoffDate ? archivableCounts(archiveCutoffDate) : { games: 0, trainings: 0 };

  app.innerHTML = `
    <div class="page-title"><h1>Settings</h1></div>

    <a class="btn ghost block" href="#/help" style="margin-bottom:12px;">❓ Help &amp; How-To</a>

    <div class="section-title">Team</div>
    ${isMatchdayOnly() ? `<p class="muted small" style="margin:-4px 0 10px;">Team settings can only be changed from a Full Edit device — ask whoever set up Cloud Sync for that link if you need something changed here.</p>` : ''}
    <form id="team-form" class="card stack">
      <fieldset ${isMatchdayOnly() ? 'disabled' : ''} style="border:none; padding:0; margin:0; display:contents;">
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
            ${Object.keys(PRESET_FORMATIONS).map(Number).map((size) => `<option value="${size}" ${team.squadFormat === size ? 'selected' : ''}>${size}-a-side</option>`).join('')}
          </select>
        </div>
      </div>
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
      <div class="field">
        <label>Minimum playing time standard (% of match minutes)</label>
        <input type="number" name="minPlayingTimePercent" min="0" max="100" step="5" placeholder="e.g. 50" value="${team.minPlayingTimePercent ?? ''}" />
        <p class="muted small" style="margin:4px 0 0;">The share of a match's total minutes every player should get at minimum, over the season — shown in Stats so you can see who's falling short.</p>
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
      </fieldset>
    </form>

    <div class="section-title">Cloud Sync</div>
    ${cloudSyncSectionHtml(syncConfig)}

    <div class="section-title">Formations</div>
    <div class="card">
      <p class="muted small mt-0">Beyond the built-in default suggestions offered on a game's Squad tab (a few common shapes per squad size), you can build your own — pick how many defenders, midfielders, and forwards, and it lays them out on the pitch for you. Only shows up for games using your team's current ${team.squadFormat}-a-side format.</p>
      <div class="stack">
        ${(team.customFormations || []).length
          ? team.customFormations.map((f) => formationRow(f)).join('')
          : '<p class="muted small">No custom formations yet.</p>'}
      </div>
      <button class="btn secondary block" data-action="add-formation" style="margin-top:10px;">+ Create Formation</button>
    </div>

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
      <p class="muted small mt-0">Boot Room also snapshots a backup automatically on this device whenever a match finishes, a training session is saved or ended, or a drill is saved — no need to remember to do it yourself. Keeps the 5 most recent.</p>
      ${autoBackups.length ? autoBackups.map(autoBackupRow).join('') : '<p class="muted small">None yet — one is saved the first time a match finishes, a training session is saved, or a drill is saved.</p>'}
    </div>
    <div class="card stack">
      <p class="muted small mt-0">Completed matches and training sessions from an old season can pile up over time, inflating Stats/History and every future automatic backup snapshot. Archiving copies out everything finished before a date you choose (nothing scheduled, live, or still in progress is ever touched, regardless of its date), then removes just that from this device.</p>
      <div class="field" style="margin-bottom:0;">
        <label>Archive everything completed before</label>
        <input type="date" id="archive-cutoff-date" value="${escapeHtml(archiveCutoffDate)}" max="${todayIso()}" />
      </div>
      <p class="muted small" style="margin:0;">${archiveSummaryText(archiveCutoffDate, archiveCounts)}</p>
      <button class="btn secondary block" data-action="copy-archive" ${archiveCutoffDate && (archiveCounts.games || archiveCounts.trainings) ? '' : 'disabled'}>📦 Copy Archive</button>
      <textarea id="archive-fallback" readonly ${archiveFallbackVisible ? '' : 'hidden'} style="width:100%; min-height:100px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;">${archiveCutoffDate ? escapeHtml(JSON.stringify(buildArchivePayload(archiveCutoffDate), null, 2)) : ''}</textarea>
      ${archiveCopiedForDate && archiveCopiedForDate === archiveCutoffDate ? `
        <button class="btn danger block" data-action="remove-archived">🗑 Remove Archived Data From This Device</button>
      ` : ''}
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
      state.team.minPlayingTimePercent = fd.get('minPlayingTimePercent') === '' ? null : Number(fd.get('minPlayingTimePercent'));
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
          if (g.status !== 'completed') {
            // A chosen formation belongs to one squad size — carrying its
            // id over to a resized game would point at a shape that no
            // longer applies, so fall back to the new size's own default.
            g.formationId = null;
            g.lineup = { slots: remapLineupToFormat(g.lineup?.slots, newFormat) };
          }
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

  const cloudSetupBtn = app.querySelector('[data-action="cloud-sync-setup"]');
  if (cloudSetupBtn) cloudSetupBtn.addEventListener('click', () => openCloudSyncSetupModal(app));
  const cloudJoinBtn = app.querySelector('[data-action="cloud-sync-join"]');
  if (cloudJoinBtn) cloudJoinBtn.addEventListener('click', () => openCloudSyncJoinModal(app));
  const cloudSyncNowBtn = app.querySelector('[data-action="cloud-sync-now"]');
  if (cloudSyncNowBtn) {
    cloudSyncNowBtn.addEventListener('click', async () => {
      cloudSyncNowBtn.disabled = true;
      cloudSyncNowBtn.textContent = 'Syncing…';
      try {
        await syncNow();
        // A real sync (talking to Google) can take a couple of seconds —
        // long enough that the coach may well have already tapped away to
        // another tab before it resolves. Only re-render Settings if
        // they're still actually looking at it; otherwise this would blow
        // away whatever screen they've since navigated to.
        if (isOnSettingsRoute()) renderSettings(app);
      } catch (err) {
        if (isOnSettingsRoute()) {
          cloudSyncNowBtn.disabled = false;
          cloudSyncNowBtn.textContent = '🔄 Sync Now';
          alertDialog(err.message || 'Sync failed — check the connection and try again.');
        }
      }
    });
  }
  const cloudShowLinksBtn = app.querySelector('[data-action="cloud-sync-show-links"]');
  if (cloudShowLinksBtn) {
    cloudShowLinksBtn.addEventListener('click', () => {
      const cfg = getSyncConfig();
      if (!cfg || !cfg.baseUrl) return;
      openShareLinksModal(`${cfg.baseUrl}?token=${cfg.fullEditToken}`, `${cfg.baseUrl}?token=${cfg.matchdayToken}`);
    });
  }
  const cloudDisconnectBtn = app.querySelector('[data-action="cloud-sync-disconnect"]');
  if (cloudDisconnectBtn) {
    cloudDisconnectBtn.addEventListener('click', async () => {
      if (!(await confirmDialog('Disconnect Cloud Sync on this device? Your data here stays as-is — this just stops it syncing with the shared team. You can reconnect with the same link any time.', { okLabel: 'Disconnect' }))) return;
      disconnectCloudSync();
      renderSettings(app);
    });
  }
  app.querySelectorAll('[data-action="restore-auto-backup"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmDialog('Restore this automatic backup? It replaces everything currently in the app on this device.', { okLabel: 'Restore', danger: true }))) return;
      restoreAutoBackupById(btn.dataset.id);
      renderSettings(app);
    });
  });

  const archiveDateInput = app.querySelector('#archive-cutoff-date');
  if (archiveDateInput) {
    archiveDateInput.addEventListener('change', () => {
      archiveCutoffDate = archiveDateInput.value;
      archiveCopiedForDate = null;
      archiveFallbackVisible = false;
      renderSettings(app);
    });
  }
  const copyArchiveBtn = app.querySelector('[data-action="copy-archive"]');
  if (copyArchiveBtn) {
    copyArchiveBtn.addEventListener('click', async () => {
      const json = JSON.stringify(buildArchivePayload(archiveCutoffDate), null, 2);
      let usedFallback = false;
      await copyToClipboard(json, {
        onSuccess: () => {},
        onFallback: () => { usedFallback = true; },
      });
      // Either path is a real copy the coach can now act on — show the
      // Remove button either way, rather than only after a clipboard
      // success (which can't be told apart from the coach just not
      // having granted clipboard permission).
      archiveCopiedForDate = archiveCutoffDate;
      archiveFallbackVisible = usedFallback;
      renderSettings(app);
      const freshCopyBtn = app.querySelector('[data-action="copy-archive"]');
      if (freshCopyBtn) {
        freshCopyBtn.textContent = usedFallback ? 'Select the text below and copy it' : '✅ Copied! Paste it somewhere safe.';
        setTimeout(() => { if (freshCopyBtn.isConnected) freshCopyBtn.textContent = '📦 Copy Archive'; }, 3000);
      }
      if (usedFallback) {
        const freshFallback = app.querySelector('#archive-fallback');
        freshFallback.focus();
        freshFallback.select();
      }
    });
  }
  const removeArchivedBtn = app.querySelector('[data-action="remove-archived"]');
  if (removeArchivedBtn) {
    removeArchivedBtn.addEventListener('click', async () => {
      const counts = archivableCounts(archiveCutoffDate);
      const parts = [];
      if (counts.games) parts.push(`${counts.games} match${counts.games === 1 ? '' : 'es'}`);
      if (counts.trainings) parts.push(`${counts.trainings} training session${counts.trainings === 1 ? '' : 's'}`);
      if (!(await confirmDialog(`Remove ${parts.join(' and ')} from this device? Make sure you've saved the copy first — this can't be undone.`, { okLabel: 'Remove', danger: true }))) return;
      removeArchivedData(archiveCutoffDate);
      archiveCopiedForDate = null;
      archiveFallbackVisible = false;
      renderSettings(app);
    });
  }

  app.querySelector('[data-action="add-formation"]').addEventListener('click', () => openFormationForm(team.squadFormat));
  app.querySelectorAll('[data-action="edit-formation"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const existing = (getState().team.customFormations || []).find((f) => f.id === btn.dataset.id);
      if (existing) openFormationForm(team.squadFormat, existing);
    });
  });
  app.querySelectorAll('[data-action="delete-formation"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmDialog('Delete this formation? Any game currently using it falls back to a default suggestion instead.', { okLabel: 'Delete', danger: true }))) return;
      update((state) => {
        state.team.customFormations = (state.team.customFormations || []).filter((f) => f.id !== btn.dataset.id);
        state.games.forEach((g) => { if (g.formationId === btn.dataset.id) g.formationId = null; });
      });
    });
  });

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

function archiveSummaryText(cutoffDate, counts) {
  if (!cutoffDate) return 'Pick a date to see what would be archived.';
  if (!counts.games && !counts.trainings) return `Nothing completed before ${cutoffDate} yet — nothing to archive.`;
  const parts = [];
  if (counts.games) parts.push(`${counts.games} match${counts.games === 1 ? '' : 'es'}`);
  if (counts.trainings) parts.push(`${counts.trainings} training session${counts.trainings === 1 ? '' : 's'}`);
  return `Would archive ${parts.join(' and ')} completed before ${cutoffDate}.`;
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

function formationRow(f) {
  return `
    <div class="card-row">
      <span class="small">${escapeHtml(f.label)} <span class="muted">(${f.def} DEF · ${f.mid} MID · ${f.fwd} FWD)</span></span>
      <div class="row" style="gap:6px;">
        <button class="icon-btn" data-action="edit-formation" data-id="${f.id}" aria-label="Edit formation">✏️</button>
        <button class="btn ghost sm" data-action="delete-formation" data-id="${f.id}">Delete</button>
      </div>
    </div>
  `;
}

function openFormationForm(squadFormat, existing) {
  const outfieldNeeded = squadFormat - 1;
  const pf = existing || { label: '', def: Math.max(1, Math.round(outfieldNeeded * 0.4)), mid: Math.max(1, Math.round(outfieldNeeded * 0.35)), fwd: 0 };
  pf.fwd = existing ? existing.fwd : Math.max(0, outfieldNeeded - pf.def - pf.mid);

  openModal({
    title: existing ? 'Edit Formation' : 'Create Formation',
    bodyHtml: `
      <form id="formation-form" class="stack">
        <p class="muted small mt-0">For your team's current ${squadFormat}-a-side format — that's 1 goalkeeper plus ${outfieldNeeded} outfield players to place across defenders, midfielders, and forwards.</p>
        <div class="field">
          <label>Name</label>
          <input type="text" name="label" required value="${escapeHtml(pf.label)}" placeholder="e.g. 3-4 Press" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Defenders</label>
            <input type="number" name="def" min="0" max="${outfieldNeeded}" value="${pf.def}" />
          </div>
          <div class="field">
            <label>Midfielders</label>
            <input type="number" name="mid" min="0" max="${outfieldNeeded}" value="${pf.mid}" />
          </div>
          <div class="field">
            <label>Forwards</label>
            <input type="number" name="fwd" min="0" max="${outfieldNeeded}" value="${pf.fwd}" />
          </div>
        </div>
        <div id="formation-total" class="small muted"></div>
        <div id="formation-form-error" class="small" style="color:var(--red);" hidden></div>
        <div class="modal-actions">
          <button type="submit" class="btn block">${existing ? 'Save' : 'Create'}</button>
          ${existing ? '<button type="button" class="btn danger" data-action="delete-formation-inline">Delete</button>' : ''}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const form = modalEl.querySelector('#formation-form');
      const totalEl = modalEl.querySelector('#formation-total');
      const errorEl = modalEl.querySelector('#formation-form-error');
      const defInput = form.querySelector('[name="def"]');
      const midInput = form.querySelector('[name="mid"]');
      const fwdInput = form.querySelector('[name="fwd"]');

      const refreshTotal = () => {
        const total = 1 + (Number(defInput.value) || 0) + (Number(midInput.value) || 0) + (Number(fwdInput.value) || 0);
        const target = squadFormat;
        totalEl.textContent = `Total: ${total} of ${target} players (including goalkeeper)`;
        totalEl.style.color = total === target ? '' : 'var(--red)';
      };
      refreshTotal();
      [defInput, midInput, fwdInput].forEach((el) => el.addEventListener('input', refreshTotal));

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const fd = new FormData(form);
        const label = (fd.get('label') || '').trim();
        const def = Number(fd.get('def')) || 0;
        const mid = Number(fd.get('mid')) || 0;
        const fwd = Number(fd.get('fwd')) || 0;
        if (!label) return;
        let formation;
        try {
          formation = buildCustomFormation({ id: existing?.id, size: squadFormat, label, def, mid, fwd });
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          return;
        }
        update((state) => {
          state.team.customFormations = state.team.customFormations || [];
          if (existing) {
            const idx = state.team.customFormations.findIndex((f) => f.id === existing.id);
            if (idx !== -1) state.team.customFormations[idx] = formation;
          } else {
            state.team.customFormations.push(formation);
          }
        });
        closeModal();
      });

      const inlineDeleteBtn = modalEl.querySelector('[data-action="delete-formation-inline"]');
      if (inlineDeleteBtn) {
        inlineDeleteBtn.addEventListener('click', async () => {
          if (!(await confirmDialog('Delete this formation? Any game currently using it falls back to a default suggestion instead.', { okLabel: 'Delete', danger: true }))) return;
          update((state) => {
            state.team.customFormations = (state.team.customFormations || []).filter((f) => f.id !== existing.id);
            state.games.forEach((g) => { if (g.formationId === existing.id) g.formationId = null; });
          });
          closeModal();
        });
      }
    },
  });
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
        if (summary.trainingsAdded) parts.push(`${summary.trainingsAdded} training session${summary.trainingsAdded === 1 ? '' : 's'} added`);
        if (summary.drillsAdded) parts.push(`${summary.drillsAdded} drill${summary.drillsAdded === 1 ? '' : 's'} added`);
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

function cloudSyncSectionHtml(syncConfig) {
  if (!syncConfig) {
    return `
      <div class="card stack">
        <p class="muted small mt-0">Share this team's setup and match data with other coaches all season instead of passing files back and forth — one coach sets it up (a few minutes, one time, using a free Google Sheet), then everyone else just pastes a link. See Help for the full walkthrough, including exactly what each access level can do.</p>
        <button class="btn secondary block" data-action="cloud-sync-setup">🔗 Set Up Cloud Sync</button>
        <p class="muted small" style="margin:-4px 0 0; text-align:center;">— I'm setting this up for the team</p>
        <button class="btn ghost block" data-action="cloud-sync-join">🔑 I Have a Cloud Sync Link</button>
      </div>
    `;
  }
  const roleLabel = syncConfig.role === 'editor' ? 'Full Edit' : 'Matchday';
  return `
    <div class="card stack">
      <p class="muted small mt-0">This device has <strong>${roleLabel}</strong> access${syncConfig.coachName ? ` (as ${escapeHtml(syncConfig.coachName)})` : ''}.${syncConfig.role === 'matchday' ? ' Roster and team settings can only be changed from a Full Edit device — those controls are hidden here, and a change to them wouldn\'t save to the shared team anyway.' : ''} Training sessions and the Drill Library aren't part of Cloud Sync — they stay on this device only.</p>
      <div class="small">${syncConfig.lastSyncedAt ? `Last synced: ${new Date(syncConfig.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}</div>
      <div class="banner warn">⚠️ Running two matches at once (e.g. two pitches) is fine — each match syncs back independently. Just never have <strong>two devices both live-tracking the same match</strong> at the same time: sync isn't real-time, so whichever device syncs first can silently overwrite the other's events for that match. One device per live match.</div>
      <button class="btn secondary block" data-action="cloud-sync-now">🔄 Sync Now</button>
      ${syncConfig.role === 'editor' && syncConfig.baseUrl ? '<button class="btn ghost block" data-action="cloud-sync-show-links">📋 Show Share Links</button>' : ''}
      ${syncConfig.role === 'editor' && !syncConfig.baseUrl ? `<p class="muted small" style="margin:0;">Share links can only be shown again on the device that originally ran "Set Up Cloud Sync" — this one connected with a link instead, so it doesn't have what's needed to rebuild them.</p>` : ''}
      <button class="btn ghost block" data-action="cloud-sync-disconnect">Disconnect This Device</button>
    </div>
  `;
}

function openCloudSyncSetupModal(app) {
  openModal({
    title: 'Set Up Cloud Sync',
    bodyHtml: `
      <ol class="stack" style="margin:0; padding-left:18px;">
        <li>Create a new, blank Google Sheet (<a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a>) — the name doesn't matter.</li>
        <li>In it, open <strong>Extensions → Apps Script</strong>, delete anything already there, and paste in the script below (generated just now for your team — nothing to edit).</li>
      </ol>
      <textarea id="cloud-sync-script" readonly style="width:100%; min-height:140px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px; margin:10px 0;"></textarea>
      <button type="button" class="btn ghost sm" data-action="copy-cloud-script" style="margin-bottom:10px;">📋 Copy Script</button>
      <ol class="stack" style="margin:0; padding-left:18px;" start="3">
        <li>Click <strong>Deploy → New deployment</strong>, choose type <strong>Web app</strong>, set "Execute as" to <strong>Me</strong> and "Who has access" to <strong>Anyone</strong>, then Deploy. Google may show an "unverified app" warning for your own script — click <strong>Advanced → Go to (unsafe)</strong> to allow it.</li>
        <li>Paste the URL it gives you (ending in <code>/exec</code>) below.</li>
      </ol>
      <form id="cloud-sync-setup-form" class="stack">
        <div class="field">
          <label>Web App URL</label>
          <input type="url" name="baseUrl" placeholder="https://script.google.com/macros/s/.../exec" required />
        </div>
        <div class="field">
          <label>Your name (optional — shown to other coaches when you sync)</label>
          <input type="text" name="coachName" />
        </div>
        <div id="cloud-sync-setup-error" class="small" style="color:var(--red);" hidden></div>
        <button type="submit" class="btn block">Finish Setup</button>
      </form>
    `,
    onMount: (modalEl) => {
      const tokens = generateSyncTokens();
      modalEl.querySelector('#cloud-sync-script').value = buildAppsScript(tokens);

      modalEl.querySelector('[data-action="copy-cloud-script"]').addEventListener('click', async (e) => {
        const btn = e.target;
        await copyToClipboard(modalEl.querySelector('#cloud-sync-script').value, {
          onSuccess: () => { btn.textContent = '✅ Copied'; },
          onFallback: () => { modalEl.querySelector('#cloud-sync-script').select(); btn.textContent = 'Select the text above and copy it'; },
        });
        setTimeout(() => { btn.textContent = '📋 Copy Script'; }, 2500);
      });

      const errorEl = modalEl.querySelector('#cloud-sync-setup-error');
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

      modalEl.querySelector('#cloud-sync-setup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const fd = new FormData(e.target);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Setting up…';
        try {
          const { fullEditUrl, matchdayUrl } = await setUpAsFullEditor(fd.get('baseUrl'), fd.get('coachName'), tokens);
          closeModal();
          renderSettings(app);
          openShareLinksModal(fullEditUrl, matchdayUrl);
        } catch (err) {
          showError(err.message || "Couldn't reach that URL — double check it and try again.");
          submitBtn.disabled = false;
          submitBtn.textContent = 'Finish Setup';
        }
      });
    },
  });
}

function openShareLinksModal(fullEditUrl, matchdayUrl) {
  openModal({
    title: 'Cloud Sync Is Set Up',
    bodyHtml: `
      <p class="muted small mt-0">This device is connected with Full Edit access. Copy the link below and send it (text, WhatsApp, email — however's easiest) to each other coach.</p>
      <div class="field">
        <label>Matchday link — for other coaches</label>
        <textarea id="matchday-link-text" readonly style="width:100%; min-height:50px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;">${escapeHtml(matchdayUrl)}</textarea>
      </div>
      <button type="button" class="btn secondary block" data-action="copy-matchday-link" style="margin:8px 0 14px;">📋 Copy Matchday Link</button>
      <div class="field">
        <label>Your own Full Edit link — keep this one private</label>
        <textarea id="full-edit-link-text" readonly style="width:100%; min-height:50px; font-family:monospace; font-size:11px; padding:8px; border:1px solid var(--line); border-radius:8px;">${escapeHtml(fullEditUrl)}</textarea>
      </div>
      <button type="button" class="btn ghost block" data-action="copy-fulledit-link">📋 Copy Full Edit Link</button>
    `,
    onMount: (modalEl) => {
      modalEl.querySelector('[data-action="copy-matchday-link"]').addEventListener('click', async (e) => {
        const btn = e.target;
        await copyToClipboard(matchdayUrl, {
          onSuccess: () => { btn.textContent = '✅ Copied'; },
          onFallback: () => { modalEl.querySelector('#matchday-link-text').select(); },
        });
        setTimeout(() => { btn.textContent = '📋 Copy Matchday Link'; }, 2500);
      });
      modalEl.querySelector('[data-action="copy-fulledit-link"]').addEventListener('click', async (e) => {
        const btn = e.target;
        await copyToClipboard(fullEditUrl, {
          onSuccess: () => { btn.textContent = '✅ Copied'; },
          onFallback: () => { modalEl.querySelector('#full-edit-link-text').select(); },
        });
        setTimeout(() => { btn.textContent = '📋 Copy Full Edit Link'; }, 2500);
      });
    },
  });
}

function openCloudSyncJoinModal(app) {
  openModal({
    title: 'Connect to Cloud Sync',
    bodyHtml: `
      <p class="muted small mt-0">Paste the link another coach sent you. Whether you get Matchday or Full Edit access depends on which link they gave you.</p>
      <form id="cloud-sync-join-form" class="stack">
        <div class="field">
          <label>Cloud Sync link</label>
          <input type="url" name="url" placeholder="https://script.google.com/macros/s/...?token=..." required />
        </div>
        <div class="field">
          <label>Your name (optional — shown to other coaches when you sync)</label>
          <input type="text" name="coachName" />
        </div>
        <div id="cloud-sync-join-error" class="small" style="color:var(--red);" hidden></div>
        <button type="submit" class="btn block">Connect</button>
      </form>
    `,
    onMount: (modalEl) => {
      const errorEl = modalEl.querySelector('#cloud-sync-join-error');
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

      modalEl.querySelector('#cloud-sync-join-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        const fd = new FormData(e.target);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting…';
        try {
          const result = await joinWithLink(fd.get('url'), fd.get('coachName'));
          closeModal();
          renderSettings(app);
          alertDialog(`Connected with ${result.role === 'editor' ? 'Full Edit' : 'Matchday'} access. The shared team's data has been brought in.`);
        } catch (err) {
          showError(err.message || "Couldn't connect — double check the link and try again.");
          submitBtn.disabled = false;
          submitBtn.textContent = 'Connect';
        }
      });
    },
  });
}

function openRuleForm(players) {
  const active = matchEligiblePlayers(players);
  if (active.length < 2) {
    alertDialog('You need at least two active, non-guest players to set a rule.');
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
