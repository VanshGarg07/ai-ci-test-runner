const { chromium, devices } = require('playwright');

const MAX_LOGS = 200;
const MAX_FAILED = 100;

// Requests that are noise rather than real problems.
function isNoise(url, errorText) {
  if (/\/favicon\.ico(\?|$)/i.test(url)) return true;
  if (errorText && /ERR_ABORTED/.test(errorText)) return true; // normal during redirects/navigation
  return false;
}

async function runAudit(targetUrl, opts = {}) {
  const device = opts.device === 'mobile' ? 'mobile' : 'desktop';
  // --no-sandbox is usually required inside Linux containers / cloud agents
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const consoleLogs = [];
  const runtimeErrors = [];
  const failedRequests = [];
  const counts = { consoleErrors: 0, consoleWarnings: 0 };
  try {
    const contextOptions = device === 'mobile'
      ? { ...devices['iPhone 13'] }
      : { viewport: { width: 1280, height: 800 } };
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') counts.consoleErrors++;
      if (type === 'warning') counts.consoleWarnings++;
      if (consoleLogs.length < MAX_LOGS) consoleLogs.push(`[${type}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => runtimeErrors.push(err.stack || err.message));
    page.on('requestfailed', (req) => {
      const reason = (req.failure() && req.failure().errorText) || 'failed';
      if (isNoise(req.url(), reason)) return;
      if (failedRequests.length < MAX_FAILED) failedRequests.push({ url: req.url(), method: req.method(), problem: reason });
    });
    page.on('response', (res) => {
      const status = res.status();
      if (status >= 400 && !isNoise(res.url(), '')) {
        if (failedRequests.length < MAX_FAILED) failedRequests.push({ url: res.url(), method: res.request().method(), problem: `HTTP ${status}` });
      }
    });
    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (error) {
      runtimeErrors.push(`Navigation Failed: ${error.message}`);
    }
  } finally {
    await browser.close();
  }
  return { device, consoleLogs, runtimeErrors, failedRequests, ...counts };
}

module.exports = { runAudit };
