import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";
import { expectValue, openPicker, readOptions, readValue, selectValue } from "./value-picker.mjs";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyValueControls({ page, call, state, until, org, base, directory }) {
  assert.equal(process.env.AE_TEST_DISPOSABLE, "true", "Use a disposable local candidate");
  assert(process.env.AE_TEST_ORG && path.resolve(org) !== path.resolve("../../org"), "Use an explicitly separate organization");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Value-control verification requires a loopback candidate");
  const suffix = crypto.randomUUID().slice(0, 8);
  const initial = await state();
  const template = initial.agents[0] ?? initial.deleted_agents[0];
  assert(template, "The disposable organization must have an agent profile template");
  const workspaceId = await readValue(page.getByRole("combobox", { name: "Workspace", exact: true }));
  assert.equal(workspaceId, "default", "Controller-only form checks require the disposable bootstrap owner's workspace");
  const member = `@picker-${suffix}:example.invalid`;
  const createdAgents = [];
  const createdGroups = [];
  const createdActions = [];
  let runtime;
  let memberAdded = false;
  const requests = [];
  const observe = value => {
    const url = new URL(value.url());
    if (url.pathname.startsWith("/api/")) requests.push({ path: url.pathname, method: value.method(), body: ["POST", "PUT"].includes(value.method()) ? value.postDataJSON() : null });
  };
  page.on("request", observe);
  const mutationCount = route => requests.filter(value => value.path === route && ["POST", "PUT", "DELETE"].includes(value.method)).length;
  const catalogCount = () => requests.filter(value => /^\/api\/(harness|codex)\/settings$/.test(value.path)).length;
  const proof = { scenarios: [], providerTasksStarted: 0, mocks: false, limitations: [] };
  const createAgent = async (name, reportsTo = null) => {
    const agent = await call("/agents", { ...template, id: "", name, position: "Control verification", project_id: null, runtime_id: null, workdir: null, reports_to: reportsTo, model: "", reasoning: "", enabled: true, deleted_at: null, revision: 1 });
    createdAgents.push(agent.id);
    return agent;
  };
  try {
    const manager = await createAgent(`Picker manager ${suffix}`);
    const worker = await createAgent(`Picker worker ${suffix}`, manager.id);
    const firstGroup = await call("/groups", { id: "", name: `Picker first ${suffix}`, description: "Disposable selection metadata", member_ids: [manager.id, worker.id] });
    createdGroups.push(firstGroup.id);
    const secondGroup = await call("/groups", { id: "", name: `Picker second ${suffix}`, description: "Disposable selection metadata", member_ids: [manager.id, worker.id] });
    createdGroups.push(secondGroup.id);

    await call(`/tenants/${workspaceId}/members`, { user: member, role: "member" });
    memberAdded = true;
    await page.goto("/settings/workspace");
    const role = page.getByRole("combobox", { name: `Role for ${member}`, exact: true });
    await expectValue(role, "member", "Member");
    assert.deepEqual((await readOptions(role)).map(option => option.value), ["member", "owner"]);
    await expect(page.getByRole("combobox", { name: "Role for owner", exact: true })).toBeDisabled();
    const updatesBefore = mutationCount(`/api/tenants/${workspaceId}/members`);
    await openPicker(role);
    await page.keyboard.press("End");
    await expectValue(role, "member", "Member");
    assert.equal(mutationCount(`/api/tenants/${workspaceId}/members`), updatesBefore, "Keyboard highlighting must not save a role");
    await page.keyboard.press("Escape");
    await expect(role).toBeFocused();
    await selectValue(role, "owner");
    assert.equal(mutationCount(`/api/tenants/${workspaceId}/members`), updatesBefore + 1, "A committed role choice sends one mutation");
    const savedMembers = await call(`/tenants/${workspaceId}/members`, undefined, "GET");
    assert.equal(savedMembers.find(value => value.user === member)?.role, "owner");
    await page.reload();
    await expectValue(role, "owner", "Owner");
    await selectValue(page.locator("#invite-role"), "owner");
    await selectValue(page.locator("#invite-role"), "member");
    proof.scenarios.push({ name: "Bounded roles, self ownership lock, highlight without mutation and one committed persisted update", member });

    const workspace = page.getByRole("combobox", { name: "Workspace", exact: true });
    const popup = await openPicker(workspace);
    const search = popup.locator('[data-slot="combobox-input"]');
    const catalogsBeforeSearch = catalogCount();
    const mutationsBeforeSearch = requests.filter(value => ["POST", "PUT", "DELETE"].includes(value.method)).length;
    await search.fill(`No matching workspace ${suffix}`);
    await expect(popup.getByRole("status")).toHaveText("No options match.");
    await expect(popup.getByRole("option")).toHaveCount(0);
    await expectValue(workspace, workspaceId);
    await search.fill("");
    await expect(popup.getByRole("option").and(page.locator(`[data-value=${JSON.stringify(workspaceId)}]`))).toBeVisible();
    assert.equal(catalogCount(), catalogsBeforeSearch, "Search only filters the authorized in-memory list");
    assert.equal(requests.filter(value => ["POST", "PUT", "DELETE"].includes(value.method)).length, mutationsBeforeSearch);
    await page.keyboard.press("Escape");
    await expect(workspace).toBeFocused();
    proof.scenarios.push({ name: "No-results search, restored list, retained selection and zero discovery/mutation requests" });

    await page.goto(`/organization/agents/${worker.id}/profile`);
    const managerPicker = page.getByLabel("Reports to", { exact: true });
    await expectValue(managerPicker, manager.id, manager.name);
    await selectValue(managerPicker, "");
    const savesBefore = mutationCount(`/api/agents/${worker.id}`);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await until(async () => (await state()).agents.find(agent => agent.id === worker.id)?.reports_to === null, 15000);
    assert.equal(mutationCount(`/api/agents/${worker.id}`), savesBefore + 1);
    await page.reload();
    await expectValue(managerPicker, "", "Organization owner");
    proof.scenarios.push({ name: "A valid empty Owner choice persists as null without substituting an agent", workerId: worker.id });

    await page.goto("/actions");
    await page.getByRole("button", { name: "New action", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "New action", exact: true });
    await selectValue(dialog.getByLabel("Project or group", { exact: true }), firstGroup.id);
    await selectValue(dialog.getByLabel("Person in charge (PIC)", { exact: true }), worker.id);
    await selectValue(dialog.getByLabel("Project or group", { exact: true }), secondGroup.id);
    const pic = dialog.getByLabel("Person in charge (PIC)", { exact: true });
    await expectValue(pic, "", "Choose an agent");
    await dialog.getByLabel("Title", { exact: true }).fill(`Picker backlog ${suffix}`);
    await dialog.getByLabel("Task / instructions", { exact: true }).fill("Metadata only. This backlog action must not execute.");
    const actionsBefore = mutationCount("/api/actions");
    await dialog.getByRole("button", { name: "Save to backlog", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(pic).toBeFocused();
    assert.equal(mutationCount("/api/actions"), actionsBefore, "A required empty PIC blocks real form submission");
    assert.equal(await dialog.locator("form").evaluate(form => form.checkValidity()), false);
    await selectValue(pic, worker.id);
    await dialog.getByRole("button", { name: "Save to backlog", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const savedAction = await until(async () => (await state()).actions.find(action => action.title === `Picker backlog ${suffix}`), 15000);
    createdActions.push(savedAction.id);
    assert.equal(savedAction.group_id, secondGroup.id);
    assert.equal(savedAction.assignee_id, worker.id);
    assert.equal(savedAction.status, "backlog");
    assert.equal(savedAction.run_id, null);
    proof.scenarios.push({ name: "Project/PIC dependency reset, required validation and persisted backlog values", actionId: savedAction.id });

    runtime = await call("/runtimes", { name: `Unconnected picker runtime ${suffix}` });
    await page.goto("/organization");
    await page.getByRole("button", { name: "Add agent", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Add your agent", exact: true });
    const runtimePicker = dialog.getByRole("combobox", { name: "Registered runtime", exact: true });
    await expectValue(runtimePicker, "", "Controller / SSH");
    await selectValue(runtimePicker, runtime.id);
    await expect(dialog.locator("#agent-harness")).toBeDisabled();
    await expect(dialog.locator("#agent-model")).toBeDisabled();
    await expect(dialog.getByRole("alert")).toContainText("Connect this runtime");
    await call(`/runtimes/${runtime.id}`, {}, "DELETE");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(dialog.getByRole("alert")).toContainText("revoked");
    const revokedChoice = (await readOptions(runtimePicker)).find(option => option.value === runtime.id);
    assert(revokedChoice?.disabled && revokedChoice.selected, "Revoked selected runtime remains visible, disabled and selected");
    await selectValue(runtimePicker, "");
    const reportsTo = dialog.getByLabel("Reports to", { exact: true });
    await expectValue(reportsTo, "", "Organization owner");
    await selectValue(reportsTo, manager.id);
    assert.equal(await dialog.locator("form").evaluate(form => new FormData(form).get("reports_to")), manager.id);
    const fixtureHarness = process.env.AE_TEST_SELECTION_HARNESS;
    const fixtureWorkdir = process.env.AE_TEST_WORKDIR;
    if (fixtureHarness && fixtureWorkdir) {
      await selectValue(dialog.locator("#agent-harness"), fixtureHarness);
      await expect(dialog.locator("#agent-model")).toBeEnabled();
      await dialog.locator("#agent-workdir").fill(fixtureWorkdir);
      const name = `FormData picker ${suffix}`;
      await dialog.getByLabel("Name", { exact: true }).fill(name);
      await dialog.getByRole("button", { name: "Create agent", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const created = await until(async () => (await state()).agents.find(agent => agent.name === name), 15000);
      createdAgents.push(created.id);
      assert.equal(created.reports_to, manager.id);
      assert.equal(created.harness, fixtureHarness);
      proof.scenarios.push({ name: "New-agent FormData completes through real native discovery, workdir validation and creation API", agentId: created.id });
    } else {
      await page.keyboard.press("Escape");
      proof.limitations.push("New-agent Reports to selection and real FormData exercised; creation requires AE_TEST_SELECTION_HARNESS and AE_TEST_WORKDIR for an available local native fixture and was not exercised.");
    }
    proof.scenarios.push({ name: "Unconnected/revoked runtime states remain truthful without fallback", runtimeId: runtime.id });
    proof.limitations.push("No user-facing Reset control exists in the audited forms; browser reset behavior needs a separate real caller when one is introduced.");

    await page.goto("/organization/live-preview");
    const preview = page.locator(".live-preview-window");
    await expect(preview).toBeVisible();
    const team = page.getByRole("combobox", { name: "Team", exact: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 500 }]) {
      await page.setViewportSize(viewport);
      const teamPopup = await openPicker(team);
      const option = teamPopup.getByRole("option").first();
      await expect(option).toBeVisible();
      const box = await option.boundingBox();
      assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, "Nested picker stays inside the viewport");
      assert(await option.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), "A nested option is above the Live Preview overlay and receives pointer input");
      await page.screenshot({ path: path.join(directory, `value-controls-live-preview-${viewport.width}.png`) });
      await page.keyboard.press("Escape");
      await expect(teamPopup).toBeHidden();
      await expect(preview).toBeVisible();
      await expect(team).toBeFocused();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.getByRole("button", { name: "Close Live Preview", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 980 });
    const after = await state();
    assert.deepEqual(after.runs.map(run => run.id).sort(), initial.runs.map(run => run.id).sort(), "Control verification starts no provider tasks");
    proof.scenarios.push({ name: "Nested Live Preview popup pointer order, child Escape, focus restoration, scrolling and narrow viewport" });
    await writeFile(path.join(directory, "value-controls.json"), JSON.stringify(proof, null, 2));
    return proof;
  } finally {
    page.off("request", observe);
    for (const id of createdActions) await call(`/actions/${id}`, undefined, "DELETE");
    for (const id of createdGroups.reverse()) await call(`/groups/${id}`, undefined, "DELETE");
    for (const id of createdAgents.reverse()) await call(`/agents/${id}`, undefined, "DELETE");
    if (runtime && !(await call("/runtimes", undefined, "GET")).find(value => value.id === runtime.id)?.revoked) await call(`/runtimes/${runtime.id}`, {}, "DELETE");
    if (memberAdded) {
      await call(`/tenants/${workspaceId}/members`, { user: member, role: "member" }, "PUT");
      await call(`/tenants/${workspaceId}/members`, { user: member }, "DELETE");
    }
  }
}
