import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";

const EXECUTA_HANDLE = "aici-engine";
// Fallback used by `anna-app dev`
const DEV_FALLBACK_TOOL_ID = "tool-dev-aici-engine";

const input = document.getElementById("targetUrl");
const button = document.getElementById("runBtn");
const out = document.getElementById("outputConsole");

let annaPromise = null;
const getAnna = () => (annaPromise ??= AnnaAppRuntime.connect());

function formatReport(d) {
  const lines = [`[AI-CI] Audit finished for ${d.url}`, `Runtime crashes found: ${d.crashCount}`, ""];
  if (d.runtimeErrors?.length) {
    lines.push("--- RUNTIME ERRORS ---", ...d.runtimeErrors, "");
  }
  if (d.consoleLogs?.length) {
    lines.push("--- CONSOLE LOGS ---", ...d.consoleLogs, "");
  }
  if (d.diagnosis) lines.push("=== AI DIAGNOSTIC REPORT ===", d.diagnosis);
  else if (d.diagnosisNote) lines.push(d.diagnosisNote);
  return lines.join("\n");
}

async function triggerAudit() {
  const url = input.value.trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    out.innerText = "Error: please enter a full http(s) URL, e.g. https://example.com";
    return;
  }

  button.disabled = true;
  out.innerText = `[AI-CI] Initializing headless sandbox...\n[AI-CI] Running diagnostic trace on: ${url}\nPlease wait (can take up to a minute)...`;

  try {
    const anna = await getAnna();
    const toolId = window.__ANNA_TOOL_IDS__?.[EXECUTA_HANDLE] || DEV_FALLBACK_TOOL_ID;
    const res = await anna.tools.invoke({
      tool_id: toolId,
      method: "run_audit",
      args: { targetUrl: url },
    });

    // Handle both {success, data} and already-unwrapped shapes
    if (res && res.success === false) throw new Error(res.error || "Audit failed");
    const report = res?.data ?? res;

    // If there were crashes and the tool had no Gemini key, ask Anna's built-in AI
    if (report.crashCount > 0 && !report.diagnosis) {
      out.innerText = formatReport(report) + "\n\n[AI-CI] Asking Anna AI for a diagnosis...";
      try {
        const prompt =
          "Diagnose these front-end runtime errors from a headless browser audit. " +
          "Explain the cause and give the exact code patch. Be concise.\n\n" +
          "ERRORS:\n" + JSON.stringify(report.runtimeErrors, null, 2) +
          "\n\nCONSOLE:\n" + JSON.stringify((report.consoleLogs || []).slice(0, 50), null, 2);
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

    out.innerText = formatReport(report);
  } catch (err) {
    out.innerText = `Audit failed: ${err?.message || err}`; // never pretend success
  } finally {
    button.disabled = false;
  }
}

button.addEventListener("click", triggerAudit);
