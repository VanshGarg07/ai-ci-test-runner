const { chromium } = require('playwright');

async function runAudit(targetUrl) {
  // --no-sandbox is usually required inside Linux containers / cloud agents
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const consoleLogs = [];
  const runtimeErrors = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (msg) => { if (consoleLogs.length < 200) consoleLogs.push(`[${msg.type()}] ${msg.text()}`); });
    page.on('pageerror', (err) => runtimeErrors.push(err.stack || err.message));
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (error) {
      runtimeErrors.push(`Navigation Failed: ${error.message}`);
    }
  } finally {
    await browser.close();
  }
  return { consoleLogs, runtimeErrors };
}

module.exports = { runAudit };
