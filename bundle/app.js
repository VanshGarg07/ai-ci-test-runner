import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";

const EXECUTA_HANDLE = "aici-engine";
// Fallback used by `anna-app dev`
const DEV_FALLBACK_TOOL_ID = "tool-dev-aici-engine";

const input = document.getElementById("targetUrl");
const button = document.getElementById("runBtn");
const out = document.getElementById("outputConsole");
const deviceSelect = document.getElementById("device");
const copyBtn = document.getElementById("copyBtn");
const copyNote = document.getElementById("copyNote");
let lastReportText = "";

let annaPromise = null;
const getAnna = () => (annaPromise ??= AnnaAppRuntime.connect());

function plural(n, word) {
  const many = word.endsWith("ch") || word.endsWith("sh") ? word + "es" : word + "s";
  return `${n} ${n === 1 ? word : many}`;
}

function formatReport(d) {
  const crashes = d.crashCount || 0;
  const failed = d.failedRequestCount ?? (d.failedRequests ? d.failedRequests.length : 0);
  const summary = [
    plural(crashes, "crash"),
    plural(failed, "failed request"),
    plural(d.consoleErrorCount || 0, "console error"),
    plural(d.consoleWarningCount || 0, "warning"),
  ].join(" | ");
  const lines = [
    `[AI-CI] Audit finished for ${d.url}`,
    `Mode: ${d.device || "desktop"}`,
    `SUMMARY: ${summary}`,
    "",
  ];
  if (d.runtimeErrors?.length) {
    lines.push("--- RUNTIME ERRORS ---", ...d.runtimeErrors, "");
  }
  if (d.failedRequests?.length) {
    lines.push("--- FAILED REQUESTS ---");
    for (const r of d.failedRequests) lines.push(`${r.problem}  ${r.method}  ${r.url}`);
    lines.push("");
  }
  if (d.consoleLogs?.length) {
    lines.push("--- CONSOLE LOGS ---", ...d.consoleLogs, "");
  }
  if (d.diagnosis) lines.push("=== AI DIAGNOSTIC REPORT ===", d.diagnosis);
  else if (d.diagnosisNote) lines.push(d.diagnosisNote);
  else if (crashes === 0 && failed === 0) lines.push("Clean: no runtime crashes or failed requests.");
  return lines.join("\n");
}

function show(text, isReport) {
  out.innerText = text;
  if (isReport) {
    lastReportText = text;
    copyBtn.hidden = false;
  } else {
    lastReportText = "";
    copyBtn.hidden = true;
  }
  copyNote.textContent = "";
}

async function copyReport() {
  if (!lastReportText) return;
  try {
    await navigator.clipboard.writeText(lastReportText);
  } catch (_) {
    // Fallback for sandboxed frames where the Clipboard API is blocked
    const ta = document.createElement("textarea");
    ta.value = lastReportText;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
    if (!ok) { copyNote.textContent = "Copy failed - select the report text and copy it manually."; return; }
  }
  copyNote.textContent = "Copied!";
  setTimeout(() => { copyNote.textContent = ""; }, 2000);
}

async function triggerAudit() {
  const url = input.value.trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    show("Error: please enter a full http(s) URL, e.g. https://example.com", false);
    return;
  }

  button.disabled = true;
  const device = deviceSelect.value === "mobile" ? "mobile" : "desktop";
  show(`[AI-CI] Initializing headless sandbox...\n[AI-CI] Running ${device} diagnostic trace on: ${url}\nPlease wait (can take up to a minute)...`, false);

  try {
    const anna = await getAnna();
    const toolId = window.__ANNA_TOOL_IDS__?.[EXECUTA_HANDLE] || DEV_FALLBACK_TOOL_ID;
    const res = await anna.tools.invoke({
      tool_id: toolId,
      method: "run_audit",
      args: { targetUrl: url, device },
    });

    // Handle both {success, data} and already-unwrapped shapes
    if (res && res.success === false) throw new Error(res.error || "Audit failed");
    const report = res?.data ?? res;

    // If there were crashes and the tool had no Gemini key, ask Anna's built-in AI
    if (report.crashCount > 0 && !report.diagnosis) {
      show(formatReport(report) + "\n\n[AI-CI] Asking Anna AI for a diagnosis...", false);
      try {
        const prompt =
          "Diagnose these front-end runtime errors from a headless browser audit. " +
          "Explain the cause and give the exact code patch. Be concise.\n\n" +
          "ERRORS:\n" + JSON.stringify(report.runtimeErrors, null, 2) +
          "\n\nCONSOLE:\n" + JSON.stringify((report.consoleLogs || []).slice(0, 50), null, 2) +
          "\n\nFAILED REQUESTS:\n" + JSON.stringify((report.failedRequests || []).slice(0, 20), null, 2);
        const r = await anna.llm.complete({
          systemPrompt: "You are a senior front-end engineer.",
          messages: [{ role: "user", content: { type: "text", text: prompt } }],
          maxTokens: 800,
        });
        report.diagnosis = r?.content?.text || null;
      } catch (e) {
        report.diagnosisNote = "AI diagnosis unavailable: " + (e?.message || e);
      }
    }

    show(formatReport(report), true);
  } catch (err) {
    show(`Audit failed: ${err?.message || err}`, false); // never pretend success
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", triggerAudit);
copyBtn.addEventListener("click", copyReport);
