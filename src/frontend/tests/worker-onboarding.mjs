import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.env.AE_TEST_URL;
const org = process.env.AE_TEST_ORG;
assert(base && org, "Set AE_TEST_URL and AE_TEST_ORG to a disposable local controller");
const origin = new URL(base);
assert(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname), "This test only accepts a loopback controller");
const directory = process.env.AE_TEST_OUTPUT;
assert(directory, "Set AE_TEST_OUTPUT to an ignored evidence directory");
const key = (await readFile(path.join(org, ".state", "owner.key"), "utf8")).trim();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: "reduce" });
const page = await context.newPage();
let runtimeId;
const checks = [];
try {
  const login = await context.request.post(`${base}/api/login`, { data: { token: key } });
  assert.equal(login.status(), 200);
  await page.goto(`${base}/settings/runtime`);
  await page.getByLabel("Runtime name", { exact: true }).fill("Local onboarding URL regression");
  const saved = page.waitForResponse(r => new URL(r.url()).pathname === "/api/runtimes" && r.request().method() === "POST");
  await page.getByRole("button", { name: "Register runtime", exact: true }).click();
  const response = await saved;
  assert.equal(response.status(), 200);
  runtimeId = (await response.json()).id;
  await expect(page.getByLabel("Enrollment token", { exact: true })).toHaveAttribute("type", "password");
  const enrollmentToken = await page.getByLabel("Enrollment token", { exact: true }).inputValue();
  assert(enrollmentToken, "The real registration must supply an enrollment token");
  const field = page.getByLabel("Reachable controller URL", { exact: true });
  const copy = page.getByRole("button", { name: "Copy setup command", exact: true });
  for (const value of ["https://demo'example.test", "https://demo;example.test", "https://demo$(echo).test", "http://remote.example.test", "https://example.test/path", "https://user:secret@example.test"]) {
    await field.fill(value);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(copy).toHaveCount(0);
    checks.push({ check: "unsafe or unsupported origin rejected", origin: value.includes("secret") ? "credential-bearing URL" : value, passed: true });
  }
  for (const value of [base, "https://controller.example.test:8443", "https://[::1]:8443"]) {
    await field.fill(value);
    await expect(field).toHaveAttribute("aria-invalid", "false");
    await expect(copy).toBeVisible();
    const command = await page.locator(".runtime-instructions pre").textContent();
    assert(command.includes(new URL(value).origin));
    assert(!command.includes("AE_ENROLLMENT_TOKEN"));
    assert(!command.includes(enrollmentToken), "Copied command must not contain the enrollment secret");
    checks.push({ check: "valid origin produces token-free setup command", origin: value, passed: true });
  }
  await field.fill(base);
  await page.locator("#worker-install-platform").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.locator(".runtime-instructions pre")).toContainText("bash ./setup-worker.sh");
  checks.push({ check: "Linux platform selection updates setup command", passed: true });
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, "runtime-ui.png"), fullPage: true });
  await writeFile(path.join(directory, "ui-regression-receipt.json"), JSON.stringify({ checks, runtimeId, noAgentTasksRequested: true }, null, 2));
  console.log(`${checks.length} real Runtime UI checks passed; token remains masked`);
} finally {
  try {
    if (runtimeId) {
      const revoked = await context.request.delete(`${base}/api/runtimes/${runtimeId}`, { headers: { "X-AE-Workspace": "default" } });
      assert.equal(revoked.status(), 200, "Revoke only this test's unused registration");
    }
  } finally {
    await browser.close();
  }
}
