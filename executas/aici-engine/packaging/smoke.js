// CI smoke test: drives the packaged engine over JSON-RPC the way Anna does.
// Keeps stdin open until the reply arrives (no fixed sleeps), so slow first browser launches still pass.
const { spawn } = require("child_process");

const bin = process.argv[2];
const url = process.argv[3];
const child = spawn(bin, [], {
  env: { ...process.env, AICI_ALLOW_LOCAL: "1" },
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
const waiters = [];
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    const w = waiters.shift();
    if (w) w(line);
  }
});
child.on("close", (code, sig) => {
  if (waiters.length) {
    console.error(`SMOKE FAILED: engine exited before replying (code=${code}, signal=${sig})`);
    process.exit(1);
  }
});
child.stdin.on("error", () => {}); // engine may exit early; the close handler reports it
child.on("error", (e) => {
  console.error("SMOKE FAILED: could not start engine:", e.message);
  process.exit(1);
});

const ask = (obj, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no reply within ${ms / 1000}s`)), ms);
    waiters.push((line) => {
      clearTimeout(t);
      resolve(line);
    });
    child.stdin.write(JSON.stringify(obj) + "\n");
  });

(async () => {
  const d = await ask({ jsonrpc: "2.0", id: 1, method: "describe" }, 60000);
  console.log("describe:", d.slice(0, 160));
  if (!d.includes('"run_audit"')) throw new Error("describe did not list run_audit");

  const t0 = Date.now();
  const a = await ask(
    { jsonrpc: "2.0", id: 2, method: "invoke", params: { tool: "run_audit", arguments: { targetUrl: url } } },
    150000
  );
  console.log(`audit (${Math.round((Date.now() - t0) / 1000)}s):`, a.slice(0, 400));
  const r = JSON.parse(a).result;
  if (!r || r.success !== true || !r.data || r.data.crashCount !== 1) {
    throw new Error("expected success with crashCount 1");
  }
  console.log("SMOKE OK");
  child.stdin.end();
  setTimeout(() => process.exit(0), 300);
})().catch((e) => {
  console.error("SMOKE FAILED:", e.message);
  child.kill();
  process.exit(1);
});
