// A coach previously had to find the ✏️ "Edit game" icon and scroll to its
// Format field to set a match's squad size (5-a-side, 6-a-side, etc.)
// before kickoff — this covers the shortcut added right on the Squad tab
// itself, next to the formation picker, where that need actually comes up.
const { launch, BASE_URL } = require('./support/launch');

const BASE = BASE_URL;

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

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto(BASE + '/index.html#/settings');
  await page.click('text=Reload Sample Data');
  await page.waitForSelector('[data-confirm-ok]');
  await page.click('[data-confirm-ok]');
  await page.waitForTimeout(200);

  const gameId = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().games.find((g) => g.status === 'scheduled').id;
  });

  await page.goto(`${BASE}/index.html#/game/${gameId}`);
  await page.waitForSelector('#formation-select');

  const teamFormat = await page.evaluate(async () => {
    const mod = await import('/js/store.js');
    return mod.getState().team.squadFormat;
  });
  const bodyText = await page.innerText('body');
  assert(bodyText.includes(`Squad size: ${teamFormat}-a-side`), `Squad tab shows the current squad size (${teamFormat}-a-side) up front`);

  await page.click('[data-action="change-squad-size"]');
  await page.waitForSelector('#squad-size-form');
  const options = await page.$$eval('#squad-size-form [name="squadFormat"] option', (els) => els.map((e) => e.value));
  assert(JSON.stringify(options) === JSON.stringify(['3', '4', '5', '6', '7', '8', '9', '10', '11']), `Squad size modal offers 3-a-side through 11-a-side, got ${JSON.stringify(options)}`);

  await page.selectOption('#squad-size-form [name="squadFormat"]', '5');
  await page.click('#squad-size-form button[type="submit"]');
  await page.waitForTimeout(200);

  const updated = await page.evaluate(async (id) => {
    const mod = await import('/js/store.js');
    const g = mod.getState().games.find((x) => x.id === id);
    return { squadFormat: g.squadFormat, slotCount: Object.keys(g.lineup.slots).length };
  }, gameId);
  assert(updated.squadFormat === 5, `Shortcut set the game's own 5-a-side override, got ${updated.squadFormat}`);
  assert(updated.slotCount === 5, `Lineup reshaped to 5 slots, got ${updated.slotCount}`);

  await page.waitForSelector('text=Squad size: 5-a-side');
  const formationLabel = await page.$eval('#formation-select option:checked', (el) => el.textContent);
  assert(formationLabel.includes('5-a-side'), `Formation picker now offers a 5-a-side shape, got "${formationLabel}"`);

  assert(errors.length === 0, 'No console/page errors: ' + errors.join(', '));

  await browser.close();
  console.log('\nALL SQUAD-TAB CHANGE-SQUAD-SIZE SHORTCUT TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
