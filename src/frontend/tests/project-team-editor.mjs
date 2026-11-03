import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { expect as playwrightExpect } from "@playwright/test";
import { selectValue } from "./value-picker.mjs";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyProjectTeamEditor({ page, call, teamProject, existingAgent, org, directory, base }) {
  assert(process.env.AE_TEST_DISPOSABLE === "true" && new URL(base).hostname === "127.0.0.1");
  const start = await call("/state", undefined, "GET");
  const suffix = crypto.randomUUID().slice(0, 8);
  const editor = () => page.getByRole("region", { name: "Project team and reporting structure", exact: true });
  const heading = () => editor().getByRole("heading", { name: "Project team", exact: true });
  const structure = group => `/projects/${group.id}/structure`;
  const navigate = async url => page.evaluate(url => { history.pushState(null, "", url); window.dispatchEvent(new Event("ae:navigate")); }, url);
  const available = async () => {
    await expect(editor()).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage team", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hide team editor", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Deleted agents", exact: true })).toHaveCount(0);
  };
  const proof = { checks: [], viewports: [], runsBefore: start.runs.length, mutationsFromNavigation: 0, mocks: false };
  await page.goto(`${base}${structure(teamProject)}`);
  await available();
  const mutations = [];
  const track = request => { if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(request.method()); };
  page.on("request", track);
  try {
    await selectValue(editor().locator("#project-add-member"), existingAgent.id);
    await editor().getByRole("button", { name: "Add to team", exact: true }).click();
    await expect(editor().locator(".project-team-row")).toHaveCount(1);
    await page.locator(".project-structure-view").evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.locator(".project-structure-view").evaluate(node => { node.scrollTop = 0; });
    await expect(editor().locator(".project-team-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "Structure", exact: true }).click(); await available();
    await expect(editor().locator(".project-team-row")).toHaveCount(0);
    await page.reload(); await available();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 980 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await available();
      await editor().locator("#project-add-member").focus();
      await page.keyboard.press("Tab");
      await expect(editor().getByRole("button", { name: "Create project agent", exact: true })).toBeFocused();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal page overflow");
      await page.screenshot({ path: path.join(directory, `project-team-${width}.png`), fullPage: true });
      proof.viewports.push(width);
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Add agent", exact: true }).click();
    const agentDialog = page.getByRole("dialog", { name: "Add your agent", exact: true });
    await expect(agentDialog).toBeVisible();
    await expect.poll(() => agentDialog.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape"); await expect(agentDialog).toHaveCount(0);
    await page.goto(`${base}/organization`);
    await expect(page.getByRole("button", { name: "Deleted agents", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Deleted agents", exact: true }).click();
    const deletedDialog = page.getByRole("dialog"); await expect(deletedDialog).toBeVisible();
    await page.keyboard.press("Escape"); await expect(deletedDialog).toHaveCount(0);
    assert.equal(mutations.length, 0, "Viewing/navigation and unsaved draft edits cannot mutate data");
  } finally { page.off("request", track); }
  assert.deepEqual((await call("/state", undefined, "GET")).groups.find(g => g.id === teamProject.id).project.members, teamProject.project.members);
  proof.checks.push("Project team visible on entry/reload/re-entry without Manage team or Hide; keyboard/mobile/reduced-motion, cancelled dialog focus and Organization action; zero mutations before save");

  const peers = start.agents.filter(a => !a.project_id && !a.deleted_at).slice(0, 2);
  assert.equal(peers.length, 2, "Two real organization agents from the maintained suite");
  const other = await call("/groups", { ...teamProject, id: "", name: `Team persistence ${suffix}` });
  await page.goto(`${base}${structure(teamProject)}`);
  await navigate(structure(other)); await available();
  await navigate(structure(teamProject)); await available();
  await navigate(structure(other)); await available();
  for (const agent of peers) {
    await selectValue(editor().locator("#project-add-member"), agent.id);
    await editor().getByRole("button", { name: "Add to team", exact: true }).click();
  }
  await selectValue(editor().getByRole("combobox", { name: `Project manager for ${peers[1].name}`, exact: true }), peers[0].id);
  await editor().getByRole("button", { name: "Save team", exact: true }).click();
  await expect.poll(async () => (await call("/state", undefined, "GET")).groups.find(g => g.id === other.id).project.members).toEqual([
    { agent_id: peers[0].id, manager_id: null }, { agent_id: peers[1].id, manager_id: peers[0].id },
  ]);
  await page.reload(); await available();
  await expect(editor().locator(".project-team-row")).toHaveCount(2);
  await selectValue(editor().getByRole("combobox", { name: `Project manager for ${peers[0].name}`, exact: true }), peers[1].id);
  const rejected = page.waitForResponse(r => r.url().endsWith("/api/groups") && r.request().method() === "POST");
  await editor().getByRole("button", { name: "Save team", exact: true }).click();
  assert.equal((await rejected).status(), 400);
  await expect(page.getByText(/Project reporting lines contain a cycle/, { exact: false })).toBeVisible();
  await selectValue(editor().getByRole("combobox", { name: `Project manager for ${peers[0].name}`, exact: true }), "");
  await editor().getByRole("button", { name: `Remove ${peers[1].name} from project`, exact: true }).click();
  await editor().getByRole("button", { name: "Save team", exact: true }).click();
  await expect.poll(async () => (await call("/state", undefined, "GET")).groups.find(g => g.id === other.id).project.members.length).toBe(1);
  for (const peer of peers) assert.equal((await call("/state", undefined, "GET")).agents.find(a => a.id === peer.id).reports_to, peer.reports_to);
  proof.checks.push("Cross-project isolation; real members/Reports to persisted on reload; cycle rejected; removal saved; organization reporting unchanged");

  async function projectDialog(name, workdir = org) {
    await page.getByRole("button", { name: "Add group or section", exact: true }).click();
    await page.getByRole("menuitem", { name: "Create project", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create a project", exact: true });
    await dialog.locator("#group-name").fill(name);
    await dialog.locator("#project-workdir").fill(workdir);
    return dialog;
  }
  const cancel = await projectDialog(`Team cancel ${suffix}`);
  await page.keyboard.press("Escape"); await expect(cancel).toHaveCount(0);
  assert(!(await call("/state", undefined, "GET")).groups.some(g => g.name === `Team cancel ${suffix}`));
  const failed = await projectDialog(`Team invalid ${suffix}`, path.join(org, `missing-${suffix}`));
  const failedResponse = page.waitForResponse(r => r.url().endsWith("/api/groups") && r.request().method() === "POST");
  await failed.getByRole("button", { name: "Create project", exact: true }).click();
  assert.equal((await failedResponse).status(), 400); await expect(failed).toBeVisible();
  await page.keyboard.press("Escape"); await expect(failed).toHaveCount(0);
  const createdName = `Team creation ${suffix}`;
  const dialog = await projectDialog(createdName);
  await dialog.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(editor()).toBeVisible();
  const created = (await call("/state", undefined, "GET")).groups.find(g => g.name === createdName); assert(created);
  await editor().getByRole("button", { name: "Create project agent", exact: true }).click();
  const agentDialog = page.getByRole("dialog", { name: "Add your agent", exact: true });
  await agentDialog.locator("#agent-name").fill(`Dedicated ${suffix}`);
  await agentDialog.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(agentDialog).toHaveCount(0); await expect(editor()).toBeVisible();
  await expect(page.locator(".inspector")).toContainText(`Dedicated ${suffix}`);
  assert(!(await heading().evaluate(n => n === document.activeElement)), "Inline editor does not steal profile focus");
  await page.reload(); await available();
  proof.checks.push("Actual project and dedicated agent creation show the inline editor/profile; reload retains editor; cancellation/failure preserves the current project");

  for (const kind of ["project", "agent"]) {
    await page.goto(`${base}${structure(created)}`); await available();
    let submit;
    if (kind === "project") submit = (await projectDialog(`Team late ${suffix}`)).getByRole("button", { name: "Create project", exact: true });
    else {
      await page.getByRole("button", { name: "Add agent", exact: true }).click();
      const agent = page.getByRole("dialog", { name: "Add your agent", exact: true });
      await agent.locator("#agent-name").fill(`Dedicated late ${suffix}`);
      submit = agent.getByRole("button", { name: "Create agent", exact: true });
    }
    let release, started, finished, deliveryError;
    const gate = new Promise(resolve => { release = resolve; });
    const arrived = new Promise(resolve => { started = resolve; });
    const done = new Promise(resolve => { finished = resolve; });
    const pattern = kind === "project" ? "**/api/groups" : "**/api/agents";
    const handler = async route => {
      if (route.request().method() !== "POST") return route.continue();
      try { const response = await route.fetch(); assert(response.ok()); started(); await gate; await route.fulfill({ response }); }
      catch (error) {
        if (!/Route is already handled/i.test(error.message) || !route.request().failure()) deliveryError = error;
      }
      finally { finished(); }
    };
    await page.route(pattern, handler);
    try {
      await submit.click(); await Promise.race([arrived, new Promise((_, reject) => setTimeout(() => reject(new Error("Creation request did not reach its real response")), 15000))]);
      await navigate("/groups/general/chat");
      await expect(page).toHaveURL(`${base}/groups/general/chat`);
      release(); await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error("Creation delivery did not settle")), 15000))]);
      if (deliveryError) throw deliveryError;
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
      await expect(editor()).toHaveCount(0); await expect(page.locator(".inspector")).toHaveCount(0);
      await navigate(structure(created)); await available();
    } finally { release(); await page.unroute(pattern, handler); }
  }
  proof.checks.push("Held real project/agent creation completion cannot redirect or reopen after navigation");

  const emptyWorkspace = await call("/tenants", { name: `Team isolation ${suffix}` });
  await page.goto(`${base}${structure(created)}`);
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), emptyWorkspace.id);
  await expect(editor()).toHaveCount(0);
  const foreign = await page.request.post("/api/groups", { data: { ...created, name: "must-not-save" } });
  assert(!foreign.ok(), "Another workspace cannot mutate the project");
  await selectValue(page.getByRole("combobox", { name: "Workspace", exact: true }), "default");
  await navigate(structure(created)); await available();
  const token = (await readFile(path.join(org, ".state/owner.key"), "utf8")).trim();
  await page.request.post("/api/logout"); await page.goto(base); await expect(editor()).toHaveCount(0);
  const anon = await page.request.post("/api/groups", { data: created }); assert.equal(anon.status(), 401);
  assert.equal((await page.request.post("/api/login", { data: { token } })).status(), 200);
  await page.goto(`${base}${structure(teamProject)}`); await available();
  const end = await call("/state", undefined, "GET");
  assert.equal(end.runs.length, start.runs.length);
  for (const artifact of start.artifacts) assert.deepEqual(end.artifacts.find(a => a.id === artifact.id), artifact);
  proof.runsAfter = end.runs.length;
  proof.checks.push("Workspace isolation, logout and anonymous mutation guard; zero new runs and preserved artifacts");
  await writeFile(path.join(directory, "project-team-editor.json"), JSON.stringify(proof, null, 2));
  return proof;
}
