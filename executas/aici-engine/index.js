// AI-CI engine: an Anna Executa. Talks JSON-RPC 2.0 over stdin/stdout.
// RULES: stdout = protocol messages only (one JSON per line). Logs -> stderr.
const readline = require('readline');
const manifest = require('./manifest.json');

try { require('dotenv').config({ quiet: true }); } catch (_) {} // local dev only; quiet so it never prints to stdout

const log = (...a) => console.error('[aici-engine]', ...a);
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

// Block loopback / private / link-local hosts so the tool can't probe internal networks.
// CI smoke test sets AICI_ALLOW_LOCAL=1 to audit a local fixture.
function isPrivateHost(h) {
  h = h.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

function parseUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (process.env.AICI_ALLOW_LOCAL !== '1' && isPrivateHost(u.hostname)) return null;
    return u.href;
  } catch (_) { return null; }
}

async function runAuditTool(args, context) {
  const url = parseUrl(args && args.targetUrl);
  if (!url) return { success: false, error: 'targetUrl must be a valid public http(s) URL, e.g. https://example.com (localhost and private addresses are not allowed)' };

  const device = args && args.device === 'mobile' ? 'mobile' : 'desktop';

  let report;
  try {
    const { runAudit } = require('./browser'); // lazy: describe still works if Playwright is missing
    report = await runAudit(url, { device });
  } catch (e) {
    log('browser failure:', e.message);
    return { success: false, error: 'Could not start the headless browser: ' + e.message };
  }

  const failedRequests = report.failedRequests || [];
  const data = {
    url,
    device: report.device || device,
    crashCount: report.runtimeErrors.length,
    failedRequestCount: failedRequests.length,
    consoleErrorCount: report.consoleErrors || 0,
    consoleWarningCount: report.consoleWarnings || 0,
    runtimeErrors: report.runtimeErrors,
    failedRequests,
    consoleLogs: report.consoleLogs,
    diagnosis: null,
    diagnosisNote: null,
  };

  if (data.crashCount === 0) {
    data.diagnosisNote = failedRequests.length === 0
      ? 'Clean: 0 runtime exceptions encountered.'
      : `No runtime exceptions, but ${failedRequests.length} failed network request(s) were detected.`;
  } else {
    const key = (context && context.credentials && context.credentials.GEMINI_API_KEY) || process.env.GEMINI_API_KEY;
    if (!key) {
      data.diagnosisNote = 'No GEMINI_API_KEY configured, so AI diagnosis was skipped. Raw errors are shown above.';
    } else {
      try {
        const { analyzeErrors } = require('./llm');
        data.diagnosis = (await analyzeErrors(report.runtimeErrors, report.consoleLogs, key, failedRequests)).trim();
      } catch (e) {
        log('LLM failure:', e.message);
        data.diagnosisNote = 'AI diagnosis failed: ' + e.message;
      }
    }
  }
  return { success: true, data };
}

async function handle(req) {
  const { id, method, params } = req;
  try {
    if (method === 'describe') return send({ jsonrpc: '2.0', id, result: manifest });
    if (method === 'health') return send({ jsonrpc: '2.0', id, result: { status: 'ok' } });
    if (method === 'invoke') {
      const tool = params && params.tool;
      if (tool !== 'run_audit') {
        return send({ jsonrpc: '2.0', id, result: { success: false, error: `Unknown tool: ${tool}` } });
      }
      const result = await runAuditTool(params.arguments || {}, params.context || {});
      return send({ jsonrpc: '2.0', id, result });
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) {
    log('unhandled:', e);
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); }
  catch (_) { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  handle(req);
});
rl.on('close', () => process.exit(0)); // exit only when Anna closes stdin
log('ready');
