// Executed inside the production API image by smoke-production.sh.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

async function checkRuntime(entry, worker, embedded = false) {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      REDIS_URL: "redis://127.0.0.1:1",
      API_PORT: "4499",
      JOB_WORKER_ENABLED: String(worker || embedded),
      WORKER_HEARTBEAT_FILE: "/tmp/outage-smoke-heartbeat"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-12000);
    });
  const exit = once(child, "exit");
  const timer = setTimeout(() => child.kill("SIGKILL"), 25000);
  try {
    if (worker) {
      const [code, signal] = await exit;
      assert.equal(signal, null, output);
      assert.equal(code, 1, output);
      assert.match(output, /bootstrap failed/, output);
      console.log("Redis outage: worker startup fails within its deadline");
    } else {
      let live;
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          live = await fetch("http://127.0.0.1:4499/health/live", {
            signal: AbortSignal.timeout(500)
          });
        } catch {
          /* Listener is starting. */
        }
        if (live?.ok) break;
        if (child.exitCode !== null) throw new Error(output);
        await delay(200);
      }
      assert.equal(live?.status, 200, output);
      const ready = await fetch("http://127.0.0.1:4499/health/ready", {
        signal: AbortSignal.timeout(5000)
      });
      assert.equal(ready.status, 503, await ready.text());
      child.kill("SIGTERM");
      const [code, signal] = await exit;
      assert.ok(code === 0 || signal === "SIGTERM", output);
      console.log(
        "Redis outage: API boots, liveness 200, readiness 503, shutdown completes"
      );
    }
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}
await checkRuntime("dist/main.js", false);
await checkRuntime("dist/main.js", false, true);
await checkRuntime("dist/worker.js", true);
