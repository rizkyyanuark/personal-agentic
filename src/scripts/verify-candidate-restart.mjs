import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

assert.equal(process.env.AE_TEST_DISPOSABLE, "true", "Set AE_TEST_DISPOSABLE=true for an isolated local candidate");
const candidate = process.env.AE_TEST_CONTAINER ?? "personal-agentic-toast-candidate-local";
const base = process.env.AE_TEST_URL ?? "http://127.0.0.1:18789";
const url = new URL(base);
assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Candidate must use loopback");
assert.equal(url.protocol, "http:", "Use the isolated loopback HTTP candidate");
assert(!url.username && !url.password, "Do not put credentials in the URL");
const token = process.env.AE_TEST_KEY ?? (process.env.AE_TEST_KEY_FILE
  ? (await readFile(process.env.AE_TEST_KEY_FILE, "utf8")).trim()
  : execFileSync("docker", ["--context", "desktop-linux", "exec", candidate, "cat", "/data/org/.state/owner.key"], { encoding: "utf8", timeout: 10000 }).trim());
assert(token, "Candidate owner key unavailable");

async function api(route, data = undefined, method = "GET") {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: url.origin,
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`${method} ${route} failed: HTTP ${res.status}`);
  }
  return res.json();
}

function inspectContainer() {
  const stdout = execFileSync("docker", ["--context", "desktop-linux", "inspect", candidate], { encoding: "utf-8" });
  const data = JSON.parse(stdout);
  return data[0];
}

async function main() {
  console.log("1. Inspecting container before restart...");
  const infoBefore = inspectContainer();
  const id = infoBefore.Id;
  const startedAtBefore = infoBefore.State.StartedAt;
  const pidBefore = infoBefore.State.Pid;
  assert(Object.values(infoBefore.NetworkSettings.Ports).flat().some(binding => binding && binding.HostPort === (url.port || "80") && ["127.0.0.1", "::1"].includes(binding.HostIp)), "URL must match this container's loopback port");
  console.log(`Container ID: ${id.slice(0, 12)}, StartedAt: ${startedAtBefore}, Pid: ${pidBefore}`);

  console.log("2. Setting up section in group_preferences before restart...");
  const originalPreferences = (await api("/state")).group_preferences;
  const accountBefore = await api("/me");
  const sectionId = `restart-${crypto.randomUUID()}`;
  const testSection = {
    id: sectionId,
    name: "Persisted Across Restart",
    groups: [],
  };
  const testPrefs = {
    ...originalPreferences,
    sections: [...originalPreferences.sections, testSection],
  };
  let receipt;
  try {
    await api("/preferences/groups", testPrefs, "PUT");
    const stateBefore = await api("/state");
    const prefsBefore = stateBefore.group_preferences;
    assert(prefsBefore.sections.some(section => section.id === sectionId));

    console.log("3. Restarting disposable container from host Docker CLI...");
    const restartStart = Date.now();
    execFileSync("docker", ["--context", "desktop-linux", "restart", candidate], { stdio: "inherit" });

    console.log("4. Waiting for candidate readiness...");
    let ready = false;
    let readinessLatencyMs = 0;
    while (!ready) {
      if (Date.now() - restartStart > 30000) {
        throw new Error("Timed out waiting for candidate container to become ready after restart");
      }
      try {
        const res = await fetch(`${base}/api/state`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          ready = true;
          readinessLatencyMs = Date.now() - restartStart;
        }
      } catch (error) {
        if (Date.now() - restartStart > 30000) throw error;
      }
      if (!ready) await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`Candidate container ready after ${readinessLatencyMs}ms`);

    console.log("5. Inspecting container after restart...");
    const infoAfter = inspectContainer();
    const startedAtAfter = infoAfter.State.StartedAt;
    const pidAfter = infoAfter.State.Pid;
    console.log(`Container ID: ${infoAfter.Id.slice(0, 12)}, StartedAt: ${startedAtAfter}, Pid: ${pidAfter}`);

    assert.equal(infoAfter.Id, id, "Container ID must remain identical");
    assert.notEqual(startedAtAfter, startedAtBefore, "StartedAt must change across restart");

    console.log("6. Verifying state persistence after restart...");
    const stateAfter = await api("/state");
    const prefsAfter = stateAfter.group_preferences;
    assert.deepEqual(prefsAfter, prefsBefore, "Preferences must match baseline exactly across restart");
    const accountAfter = await api("/me");
    assert.deepEqual(accountAfter, accountBefore, "Account profile must survive restart");

    receipt = {
      mechanism: "docker-host-cli",
      recorded_at: new Date().toISOString(),
      base_url: url.origin,
      image_id: infoAfter.Image,
      candidate_container: candidate,
      container_id: id,
      started_at_before: startedAtBefore,
      started_at_after: startedAtAfter,
      pid_before: pidBefore,
      pid_after: pidAfter,
      readiness_latency_ms: readinessLatencyMs,
      persisted: true,
      preferences_before: prefsBefore,
      preferences_after: prefsAfter,
      account_before: accountBefore,
      account_after: accountAfter,
    };

  } finally {
    await api("/preferences/groups", originalPreferences, "PUT");
    assert.deepEqual((await api("/state")).group_preferences, originalPreferences, "Original candidate preferences restored");
  }
  const receiptPath = path.resolve(process.env.AE_TEST_EVIDENCE_DIR ?? ".state/runner-verification", "container-restart.json");
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, JSON.stringify({ ...receipt, original_preferences_restored: true }, null, 2), "utf-8");
  console.log(`Receipt saved to ${receiptPath}`);
  console.log("RESTART VERIFICATION SUCCESSFUL");
}

main().catch((err) => {
  console.error("Restart verification failed:", err);
  process.exit(1);
});
