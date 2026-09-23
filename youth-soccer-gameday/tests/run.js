// Runs every tests/*.test.js file as its own process against a single
// shared static-file server, then reports a pass/fail summary. Sequential
// on purpose — each test drives a real browser against shared app state
// conventions (it always starts with localStorage.clear()), and running
// one at a time keeps failures easy to attribute and output easy to read.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { startServer } = require('./support/server');

const PORT = Number(process.env.TEST_BASE_URL?.split(':').pop()) || 5057;
const TESTS_DIR = __dirname;

// spawnSync (used here originally) reliably breaks the nested Chromium
// subprocess a test file launches — every page.goto aborts or times out —
// even though the exact same test runs fine started directly, or through
// async spawn. Root cause not fully pinned down (something about how
// spawnSync's synchronous wait interacts with a grandchild process's own
// stdio/networking in this environment), but async spawn is unaffected,
// so each test file runs as its own real child process this way instead.
function runTestFile(fullPath, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fullPath], { stdio: 'inherit', env });
    child.on('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  const server = await startServer(PORT);
  console.log(`Static server listening on http://localhost:${PORT}`);

  const files = fs.readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .sort();

  if (!files.length) {
    console.error('No *.test.js files found in tests/.');
    server.close();
    process.exit(1);
  }

  const results = [];
  for (const file of files) {
    const fullPath = path.join(TESTS_DIR, file);
    process.stdout.write(`\n=== ${file} ===\n`);
    const passed = await runTestFile(fullPath, { ...process.env, TEST_BASE_URL: `http://localhost:${PORT}` });
    results.push({ file, passed });
  }

  server.close();

  const failed = results.filter((r) => !r.passed);
  console.log('\n' + '='.repeat(50));
  console.log(`${results.length - failed.length}/${results.length} test files passed`);
  if (failed.length) {
    console.log('Failed: ' + failed.map((r) => r.file).join(', '));
    process.exit(1);
  }
  console.log('ALL TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
