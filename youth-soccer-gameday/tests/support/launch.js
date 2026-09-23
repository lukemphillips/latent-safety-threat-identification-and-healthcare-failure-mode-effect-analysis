// Shared browser-launch helper for every test file. In this sandbox, the
// pre-installed Chromium lives at a fixed path (PLAYWRIGHT_EXECUTABLE_PATH
// is set accordingly when running locally here); in CI (or anywhere else),
// `npx playwright install chromium` puts it wherever Playwright's own
// default is, so passing no executablePath there just works.
const { chromium } = require('playwright');

function launch() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  return chromium.launch(executablePath ? { executablePath } : {});
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5057';

module.exports = { launch, BASE_URL };
