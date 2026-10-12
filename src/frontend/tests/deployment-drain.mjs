import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const org = path.resolve(process.env.AE_TEST_ORG || "");
const base = process.env.AE_TEST_URL;
const workspacePath = process.env.AE_TEST_WORKDIR;
assert(process.env.AE_TEST_ORG && base && workspacePath, "Set AE_TEST_ORG, AE_TEST_URL and AE_TEST_WORKDIR for an isolated real application");
const address = new URL(base);
assert(["127.0.0.1", "localhost"].includes(address.hostname) && !["8765", "18766"].includes(address.port), "Do not test the owner's running service");
assert.notEqual(org, path.resolve("../../org"));
const directory = path.join(org, ".state", "verification", "deployment-drain-ui");
await mkdir(directory, { recursive: true });
const token = (await readFile(path.join(org, ".state", "owner.key"), "utf8")).trim();
const browser = await chromium.launch({ channel: process.env.AE_TEST_BROWSER || "msedge", headless: true });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const proof = { base, source: "real application, SQLite, terminal and browser", mocks: [], screenshots: [] };
let generation;
let terminal;
let terminalRoot;
async function call(route, data, method = data === undefined ? "GET" : "POST") {
  const response = await context.request.fetch(`/api${route}`, { method, ...(data === undefined ? {} : { data }) });
  assert(response.ok(), `${route}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function drain(data) {
  const response = await context.request.fetch("/api/deployment-drain", { method: data ? "POST" : "GET", headers: { Authorization: `Bearer ${token}` }, ...(data ? { data } : {}) });
  assert(response.ok(), `Drain control: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function until(read, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("Real application state did not settle");
}
const notice = page.getByRole("status", { name: "Deployment maintenance", exact: true });
async function screenshot(name) {
  const target = path.join(directory, name);
  await page.screenshot({ path: target, fullPage: true });
  proof.screenshots.push(target);
}
try {
  await call("/login", { token });
  assert.equal((await drain()).phase, "open");
  const original = (await call("/state")).agents.find(agent => agent.id === "ceo");
  assert(original, "Disposable application must have its normal initial CEO");
  const workspace = (await call("/workspaces/probe", { path: workspacePath, ssh_host: original.workdir?.ssh_host ?? null, harness: original.harness })).workspace;
  const agent = await call("/agents", { ...original, id: "", name: "Drain browser terminal", enabled: true, reports_to: original.id, workdir: workspace });
  terminalRoot = `/agents/${agent.id}/terminal`;
  terminal = await call(terminalRoot, { id: crypto.randomUUID(), command: process.env.AE_TEST_TERMINAL_COMMAND || "printf DRAIN_BROWSER_TERMINAL_STARTED; sleep 90" });
  const artifactResponse = await context.request.post("/api/artifacts", { multipart: { group_id: "general", file: { name: `drain-browser-report-${crypto.randomUUID()}.md`, mimeType: "text/markdown", buffer: Buffer.from("# Drain browser report\nPersisted real artifact.\n") } } });
  assert(artifactResponse.ok(), `Artifact setup: ${artifactResponse.status()} ${await artifactResponse.text()}`);
  const artifact = await artifactResponse.json();
  await call("/messages", { id: crypto.randomUUID(), group_id: "general", body: "Drain browser report attachment", side_chat_id: null, recipients: [], reply_to: null, artifacts: [artifact.id] });
  const action = await call("/actions", { id: crypto.randomUUID(), revision: 0, group_id: "general", title: `Drain browser backlog ${crypto.randomUUID()}`, body: "Keep in backlog for admission verification", assignee_id: agent.id, planned_start: null });
  await page.goto("/groups/general/chat");
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await input.fill("Unsent draft survives deployment maintenance");
  await expect(send).toBeEnabled();
  await input.focus();
  generation = crypto.randomUUID();
  const begun = await drain({ action: "begin", generation, timeout_seconds: 900 });
  assert.equal(begun.phase, "draining");
  assert(begun.active_operations > 0, "Actual terminal work must block seal");
  await expect(notice).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(input).toHaveValue("Unsent draft survives deployment maintenance");
  await expect(input).toBeFocused();
  await expect(page.getByRole("button", { name: "Attach file", exact: true })).toBeDisabled();
  await input.press("Enter");
  await expect(input).toHaveValue("Unsent draft survives deployment maintenance");
  assert(!(await call("/groups/general/messages")).some(message => message.body === "Unsent draft survives deployment maintenance"));
  proof.draft_preserved = true;
  proof.contrast = [];
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle("dark", value), dark);
    const colors = await notice.evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    const luminance = value => {
      const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => { const unit = channel / 255; return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4; });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(colors.color), background = luminance(colors.background);
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    assert(ratio >= 4.5, `Maintenance text contrast ${ratio}`);
    proof.contrast.push({ dark, ...colors, ratio });
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await screenshot("draining-desktop.png");
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(notice).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Maintenance notice must fit 320px");
  await screenshot("draining-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/organization/agents/${agent.id}/terminal`);
  await page.getByLabel(workspace.ssh_host ? "Shell command" : "PowerShell command", { exact: true }).fill("draft command");
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeDisabled();
  const stop = page.getByRole("button", { name: "Stop command", exact: true });
  await expect(stop).toBeEnabled();
  await stop.click();
  const stopped = await until(async () => { const value = await call(`${terminalRoot}/${terminal.id}`); return value.status !== "running" && value; });
  assert.equal(stopped.status, "cancelled");
  proof.terminal = { id: terminal.id, status: stopped.status, history_available: true };
  await page.goto("/actions");
  await expect(page.getByRole("button", { name: `Run ${action.title}`, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "New action", exact: true })).toBeDisabled();
  await page.goto("/groups/general/knowledge");
  await expect(page.getByRole("button", { name: "Upload files", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: artifact.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Make searchable", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Download", exact: true })).toBeVisible();
  await page.goto("/groups/general/chat");
  await page.getByRole("link", { name: artifact.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Add to knowledge", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Drain browser report", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Markdown preview", exact: true }).click();
  await until(async () => (await drain()).active_operations === 0);
  assert.equal((await drain({ action: "seal", generation })).phase, "sealed");
  await expect(notice).toBeVisible();
  await expect(send).toBeDisabled();
  await screenshot("sealed-desktop.png");
  assert.equal((await drain({ action: "resume", generation })).phase, "open");
  generation = undefined;
  await expect(notice).toHaveCount(0);
  await input.fill("Send is available after reopening");
  await expect(send).toBeEnabled();
  proof.reopened_via_sse = true;
  generation = crypto.randomUUID();
  await drain({ action: "begin", generation, timeout_seconds: 3 });
  await expect(notice).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(notice).toHaveCount(0, { timeout: 10000 });
  assert.equal((await drain()).phase, "open");
  generation = undefined;
  await expect(send).toBeEnabled();
  await expect(input).toHaveValue("Send is available after reopening");
  proof.expiry_reopened_via_sse = true;
  assert.deepEqual(errors, []);
  proof.browser_errors = errors;
  await writeFile(path.join(directory, "proof.json"), JSON.stringify(proof, null, 2));
  console.log("DEPLOYMENT_DRAIN_UI_OK: real SSE, draft, terminal Stop, actions, knowledge, preview, seal/reopen, 320px and contrast");
} finally {
  if (generation) {
    const state = await drain();
    if (state.phase !== "open" && state.generation === generation) await drain({ action: "resume", generation });
  }
  if (terminal) {
    const state = await call(`${terminalRoot}/${terminal.id}`);
    if (state.status === "running") await call(`${terminalRoot}/${terminal.id}/stop`, {});
  }
  await browser.close();
}
