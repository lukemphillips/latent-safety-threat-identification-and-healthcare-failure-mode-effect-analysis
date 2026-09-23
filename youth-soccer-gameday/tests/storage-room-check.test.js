const { launch, BASE_URL } = require('./support/launch');

const APP = BASE_URL;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('OK: ' + msg);
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(APP + '/index.html');
  await page.evaluate(() => localStorage.clear());

  // Install a deterministic, artificially small quota so this test doesn't
  // depend on genuinely filling a real multi-MB browser storage limit —
  // it mirrors exactly what a real QuotaExceededError looks like
  // (setItem throws once a write would push total usage past the cap;
  // removeItem correctly frees space), just at a small, controllable size.
  await page.evaluate(() => {
    const CAP = 3000;
    let used = 0;
    const sizes = {};
    const realSetItem = Storage.prototype.setItem;
    const realRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      const newSize = String(value).length;
      const oldSize = sizes[key] || 0;
      const projected = used - oldSize + newSize;
      if (projected > CAP) {
        throw new DOMException('Quota exceeded (mocked)', 'QuotaExceededError');
      }
      used = projected;
      sizes[key] = newSize;
      return realSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      used -= (sizes[key] || 0);
      delete sizes[key];
      return realRemoveItem.call(this, key);
    };
    window.__quotaCap = CAP;
    window.__quotaUsed = () => used;
  });

  const result = await page.evaluate(async () => {
    const mod = await import('/js/store.js');

    // Simulate "this device already has substantial saved data" — e.g. an
    // existing drill with an attachment, plus auto-backup history — sized
    // to use most (but not all) of the mocked quota.
    const existingPayload = { team: { name: 'T' }, players: [], games: [], trainings: [], drills: [], padding: 'x'.repeat(2400) };
    localStorage.setItem('ysg-data-v2', JSON.stringify(existingPayload));
    const usedAfterExisting = window.__quotaUsed();

    // A candidate that's only a little BIGGER than what's already saved —
    // e.g. adding one modest new drill attachment — should comfortably fit
    // under the cap once persist() *replaces* the old entry, even though
    // it wouldn't fit ALONGSIDE an untouched duplicate of the old entry.
    const candidate = { ...existingPayload, padding: 'x'.repeat(2600) };
    const candidateSize = JSON.stringify(candidate).length;

    const fits = mod.hasStorageRoomFor(candidate);
    const savedAfter = localStorage.getItem('ysg-data-v2');
    const savedMatchesCandidate = savedAfter === JSON.stringify(candidate);

    return {
      cap: window.__quotaCap,
      usedAfterExisting,
      candidateSize,
      fits,
      savedMatchesCandidate,
      savedAfterLength: savedAfter ? savedAfter.length : null,
    };
  });

  console.log('Result:', JSON.stringify(result, null, 2));

  assert(result.candidateSize < result.cap, `Sanity: the candidate alone (${result.candidateSize}) fits comfortably under the cap (${result.cap})`);
  assert(result.usedAfterExisting + result.candidateSize > result.cap,
    `Sanity: existing + a full untouched duplicate of the candidate would NOT fit (${result.usedAfterExisting} + ${result.candidateSize} > ${result.cap}) — this is exactly the scenario the old two-key test got wrong`);
  assert(result.fits === true, 'hasStorageRoomFor correctly reports room once the old entry is properly replaced, not duplicated alongside');
  assert(result.savedMatchesCandidate, 'The candidate is actually saved as a result (same as persist() would have done)');

  // ============ Now the genuine "actually full" case: a candidate that's
  // too big even after replacing the old entry — should correctly report
  // no room, AND must not have lost the previously-saved data. ============
  const result2 = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    const existingPayload = { team: { name: 'T' }, players: [], games: [], trainings: [], drills: [], padding: 'x'.repeat(2400) };
    localStorage.setItem('ysg-data-v2', JSON.stringify(existingPayload));

    const tooLargeCandidate = { ...existingPayload, padding: 'x'.repeat(5000) };
    const fits = mod.hasStorageRoomFor(tooLargeCandidate);
    const savedAfter = localStorage.getItem('ysg-data-v2');
    return { fits, preserved: savedAfter === JSON.stringify(existingPayload) };
  });
  assert(result2.fits === false, 'A genuinely-too-large candidate is still correctly rejected');
  assert(result2.preserved, "And the device's previously-saved data is still intact — not wiped out by the failed check");

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL STORAGE-ROOM-CHECK TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
