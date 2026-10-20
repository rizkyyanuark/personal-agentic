import { expectValue, selectValue } from "./value-picker.mjs";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";
import { observeAssets, waitForScene, verifyRefresh } from "./cockpit-overlay.mjs";

const expect = playwrightExpect.configure({ timeout: 30000 });
const active = run => ["queued", "starting", "running", "waiting"].includes(run.status);
const shellQuote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;

async function withDeadline(operation, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds); })]);
  } finally { clearTimeout(timer); }
}

async function holdMutation(page, pattern, method) {
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { arrived = resolve; });
  const inFlight = new Set();
  let count = 0;
  const handler = async route => {
    if (route.request().method() !== method) return route.continue();
    let finish;
    const settled = new Promise(resolve => { finish = resolve; });
    inFlight.add(settled);
    try { count++; arrived(); await gate; await route.continue(); }
    finally { finish(); inFlight.delete(settled); }
  };
  await page.route(pattern, handler);
  return { started, release, count: () => count, dispose: async () => { release(); await Promise.all([...inFlight]); await page.unroute(pattern, handler); } };
}

export async function verifyActionFeedbackExisting({ page, request, call, state, until, directory }) {
  assert.equal(process.env.AE_TEST_DISPOSABLE, "true", "Use an explicitly disposable service");
  const hostId = process.env.AE_TEST_WORKSTATION_ID;
  const workdir = process.env.AE_TEST_WORKDIR;
  assert(hostId && workdir, "Provide the dedicated candidate SSH workstation and disposable workdir");
  const proof = { providerTasksStarted: 0, transportFaults: [], scenarios: [] };
  const suffix = crypto.randomUUID().slice(0, 8);
  const proofPath = path.join(directory, "action-feedback-existing.json");
  const manifestPath = path.join(directory, "action-feedback-document-manifest.json");
  const persist = () => writeFile(proofPath, JSON.stringify(proof, null, 2));
  const dismiss = async () => {
    const buttons = page.getByRole("button", { name: "Dismiss notification", exact: true });
    while (await buttons.count()) {
      const count = await buttons.count();
      await buttons.first().click();
      await expect.poll(() => buttons.count()).toBeLessThan(count);
    }
  };
  try {
    console.log("Existing feedback: project team");
    const original = await state();
    const template = original.agents.find(agent => !agent.deleted_at);
    assert(template, "A real candidate agent template is required");
    const members = [];
    for (const name of [`TeamA${suffix}`, `TeamB${suffix}`]) {
      members.push(await call("/agents", { ...template, id: "", project_id: null, reports_to: null, runtime_id: null,
        name, model: "", reasoning: "", workdir: null, enabled: false, deleted_at: null }));
    }
    const projectWorkdir = (await call("/workspaces/probe", { path: "/workdir" })).workspace;
    const project = await call("/groups", { id: "", name: `Feedback existing team ${suffix}`, description: "Disposable existing feedback regression",
      member_ids: null, project: { workdir: projectWorkdir, members: [] }, scope_levels: null });
    await page.goto(`/projects/${project.id}/structure`);
    await dismiss();
    const team = page.getByRole("region", { name: "Project team and reporting structure", exact: true });
    await expect(team).toBeVisible();
    for (const member of members) {
      await selectValue(team.locator("#project-add-member"), member.id);
      await team.getByRole("button", { name: "Add to team", exact: true }).click();
    }
    await selectValue(team.getByRole("combobox", { name: `Project manager for ${members[0].name}`, exact: true }), members[1].id);
    await selectValue(team.getByRole("combobox", { name: `Project manager for ${members[1].name}`, exact: true }), members[0].id);
    const invalid = page.waitForResponse(response => new URL(response.url()).pathname === "/api/groups" && response.request().method() === "POST");
    await team.getByRole("button", { name: "Save team", exact: true }).click();
    assert.equal((await invalid).status(), 400);
    await expect(team.getByRole("alert")).toContainText("cycle");
    await expectValue(team.getByRole("combobox", { name: `Project manager for ${members[0].name}`, exact: true }), members[1].id);
    assert.deepEqual((await state()).groups.find(item => item.id === project.id).project.members, []);
    await selectValue(team.getByRole("combobox", { name: `Project manager for ${members[1].name}`, exact: true }), "");
    const save = await holdMutation(page, "**/api/groups", "POST");
    try {
      await team.getByRole("button", { name: "Save team", exact: true }).click();
      await save.started;
      await expect(team.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
      await expect(team.locator("#project-add-member")).toBeDisabled();
      await page.screenshot({ path: path.join(directory, "feedback-existing-team-pending.png") });
      save.release();
      const expectedMembers = [{ agent_id: members[0].id, manager_id: members[1].id }, { agent_id: members[1].id, manager_id: null }];
      await until(async () => JSON.stringify((await state()).groups.find(item => item.id === project.id).project.members) === JSON.stringify(expectedMembers));
      await expect(team.getByRole("button", { name: "Save team", exact: true })).toBeEnabled();
      await expect(team.getByRole("alert")).toHaveCount(0);
      assert.equal(save.count(), 1);
      await expect(page.locator(".action-toast")).toHaveCount(0);
      proof.scenarios.push({ name: "ProjectTeam actual cycle refusal, retained selections and pending save", projectId: project.id, rejectedStatus: 400, savedMembers: expectedMembers, validSaveRequests: 1, newResultToasts: 0 });
      proof.transportFaults.push("Held actual ProjectTeam POST before forwarding unchanged to observe its existing Saving state");
    } finally { await save.dispose(); }
    await persist();

    console.log("Existing feedback: Live Preview refresh");
    const beforePreview = (await state()).runs.map(run => run.id).sort();
    const previousViewport = page.viewportSize();
    proof.preview = { viewport: { width: 720, height: 600 }, stages: [], webglConsole: [] };
    const stage = async name => { proof.preview.stages.push(name); console.log(`Live Preview: ${name}`); await persist(); };
    const webglConsole = message => {
      if (proof.preview.webglConsole.length < 20 && /webgl|swiftshader|gpu|render/i.test(message.text())) proof.preview.webglConsole.push(message.text().slice(0, 500));
    };
    page.on("console", webglConsole);
    observeAssets(page);
    try {
      await page.setViewportSize(proof.preview.viewport);
      assert.equal(await page.evaluate(() => devicePixelRatio), 1, "Use one device pixel per CSS pixel for this software-GPU regression");
      await withDeadline((async () => {
        await page.goto("/organization/live-preview", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("dialog", { name: "Live Preview", exact: true })).toBeVisible({ timeout: 60000 });
        await stage("dialog visible");
        await waitForScene(page);
        await stage("actual WebGL canvas and required assets ready");
        await expect(page.locator(".live-preview-connection")).toHaveAttribute("data-connection", "live");
        let delayActive = true;
        const inFlight = new Set();
        const delayState = async route => {
          if (!delayActive) {
            try { await route.continue(); } catch {}
            return;
          }
          let finish;
          const done = new Promise(r => { finish = r; });
          inFlight.add(done);
          try {
            await new Promise(r => setTimeout(r, 150));
            await route.continue();
          } catch (e) {
            if (!String(e?.message).includes("already handled")) throw e;
          } finally {
            finish();
            inFlight.delete(done);
          }
        };
        await page.route("**/api/cockpit/state", delayState);
        try {
          await verifyRefresh(page, "default");
        } finally {
          delayActive = false;
          await Promise.all([...inFlight]);
          await page.unroute("**/api/cockpit/state", delayState);
        }
        proof.transportFaults.push("Delayed /api/cockpit/state by 200ms for multi-frame rotation sampling on fast local runner");
        await stage("normal and reduced-motion refresh assertions passed");
        await expect(page.locator(".action-toast")).toHaveCount(0);
        assert.deepEqual((await state()).runs.map(run => run.id).sort(), beforePreview);
        await page.screenshot({ path: path.join(directory, "feedback-existing-preview-refresh.png"), timeout: 15000 });
        await page.getByRole("button", { name: "Close Live Preview", exact: true }).click();
      })(), 120000, "Real Live Preview regression");
    } finally {
      page.off("console", webglConsole);
      await withDeadline(page.setViewportSize(previousViewport), 10000, "Restore regression viewport");
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
    proof.scenarios.push({ name: "Live Preview real refresh preserves its original local status and motion", viewport: proof.preview.viewport, devicePixelRatio: 1, normalMotion: "rendered rotation sampled", reducedMotion: "rotation disabled", actualHttp: 200, newProviderRuns: 0, duplicateToasts: 0 });
    await persist();

    console.log("Existing feedback: Markdown document and ChatActivity");
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const saveManifest = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    if (!manifest) {
      const ssh = (await call("/workspaces/probe", { path: workdir, harness: "antigravity", ssh_host: hostId })).workspace;
      const catalog = await call(`/harness/settings?harness=antigravity&ssh_host=${encodeURIComponent(hostId)}`, undefined, "GET");
      const model = catalog.models.find(item => item.slug.includes("flash"))?.slug ?? catalog.model;
      const agent = await call("/agents", { ...template, id: "", project_id: null, reports_to: null, runtime_id: null,
        name: `Document${suffix}`, harness: "antigravity", model, reasoning: "", agents_md: "", permission: "workspace-write",
        instructions: "This is a disposable UI regression. Reply with exactly the Markdown requested. Do not call tools, edit files, delegate, browse, or inspect credentials.",
        workdir: ssh, enabled: true, deleted_at: null, timeout_seconds: 90 });
      const group = await call("/groups", { id: "", name: `Feedback document ${suffix}`, description: "One actual exact-link reply in a dedicated test workdir", member_ids: [agent.id], scope_levels: null });
      const filename = `feedback-regression-${suffix}.md`;
      manifest = { agentId: agent.id, groupId: group.id, filename, model, messageId: crypto.randomUUID(), runId: null };
      await saveManifest();
      await page.goto(`/groups/${group.id}/chat`);
      await call("/messages", { id: manifest.messageId, group_id: group.id, side_chat_id: null,
        body: `Reply exactly [Feedback report](${filename}). Do not call tools, read or write files, browse, delegate, or add any other text.`,
        recipients: [agent.id], reply_to: null, artifacts: [] });
      proof.providerTasksStarted = 1;
      const observed = await until(async () => (await state()).runs.find(run => run.message_id === manifest.messageId));
      manifest.runId = observed.id; await saveManifest();
      await expect(page.getByRole("button", { name: /^Chat activity: (Queued|Working)$/ })).toBeVisible();
      proof.activeChatActivityObserved = true;
    } else {
      proof.reusedActualDocumentRun = true;
      assert((await state()).groups.some(group => group.id === manifest.groupId), "Document proof belongs to this disposable candidate");
      await page.goto(`/groups/${manifest.groupId}/chat`);
    }
    const run = await until(async () => {
      const current = (await state()).runs.find(item => item.id === manifest.runId || item.message_id === manifest.messageId);
      return current && !active(current) && current;
    }, 120000);
    assert.equal(run.status, "succeeded", run.error || run.output);
    assert.equal(run.exit_code, 0);
    assert(run.native_session_id, "A confirmed real native session is required");
    assert(run.output.includes(`[Feedback report](${manifest.filename})`), "The native reply must publish the actual link");
    manifest.runId = run.id; await saveManifest();
    await expect(page.getByRole("button", { name: "Chat activity: Done", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Chat activity: Done", exact: true }).click();
    await expect(page.getByRole("button", { name: "Close run details", exact: true })).toBeVisible();
    await expect(page.locator(".inspector-body .details").first()).toContainText(run.native_session_id);
    await page.getByRole("button", { name: "Close run details", exact: true }).click();

    const sourceText = "# Feedback regression report\n\nReal persisted Markdown for existing interaction checks.\n";
    const fileRoute = `/api/runs/${run.id}/files?${new URLSearchParams({ path: manifest.filename })}`;
    let source = await request.get(fileRoute);
    if (!source.ok()) {
      assert(run.artifact_errors.some(error => error.path.includes(manifest.filename)), "The missing source must have produced a real completion capture error");
      const python = `from pathlib import Path; p=Path(${JSON.stringify(manifest.filename)}); assert not p.exists(); p.write_text(${JSON.stringify(sourceText)}, encoding="utf-8"); print("FEEDBACK_DOCUMENT_CREATED")`;
      const terminal = await call(`/agents/${manifest.agentId}/terminal`, { id: crypto.randomUUID(), command: `python3 -c ${shellQuote(python)}` });
      const done = await until(async () => {
        const item = await call(`/agents/${manifest.agentId}/terminal/${terminal.id}`, undefined, "GET");
        return item.status !== "running" && item;
      });
      assert.equal(done.exit_code, 0, done.error || done.output);
      assert(done.output.includes("FEEDBACK_DOCUMENT_CREATED"));
      proof.fixtureTerminalId = terminal.id;
      source = await request.get(fileRoute);
    }
    assert.equal(source.status(), 200);
    assert.equal(await source.text(), sourceText);
    await page.getByRole("link", { name: "Feedback report", exact: true }).click();
    const preview = page.getByRole("complementary", { name: "Markdown preview", exact: true });
    await expect(preview.getByRole("heading", { name: "Feedback regression report", exact: true })).toBeVisible();
    let document = await call(`/runs/${run.id}/document?${new URLSearchParams({ path: manifest.filename })}`, undefined, "GET");
    if (!document.artifact) {
      assert(document.can_import, "Real completed reply must allow historical recovery");
      const gate = await holdMutation(page, `**/api/runs/${run.id}/artifacts`, "POST");
      try {
        await preview.getByRole("button", { name: "Recover document", exact: true }).click();
        await gate.started;
        await expect(preview.getByRole("button", { name: "Saving current version…", exact: true })).toBeDisabled();
        gate.release();
        await expect(preview.getByRole("status").filter({ hasText: "Current version saved at import" })).toBeVisible();
        assert.equal(gate.count(), 1);
      } finally { await gate.dispose(); }
      document = await call(`/runs/${run.id}/document?${new URLSearchParams({ path: manifest.filename })}`, undefined, "GET");
      manifest.recoveredArtifactId = document.artifact?.id; await saveManifest();
    } else {
      assert.equal(document.artifact.id, manifest.recoveredArtifactId, "Only reuse an earlier verified recovery in this candidate");
    }
    assert.equal(document.artifact.source.capture_kind, "historical_import");
    assert(document.can_export);
    assert.equal(await (await request.get(`/api/artifacts/${document.artifact.id}`)).text(), sourceText);
    await expect(page.locator(".action-toast")).toHaveCount(0);

    if (!manifest.indexed) {
      const gate = await holdMutation(page, `**/api/artifacts/${document.artifact.id}/index`, "POST");
      try {
        await preview.getByRole("button", { name: "Add to knowledge", exact: true }).click();
        await gate.started;
        await expect(preview.getByRole("button", { name: "Adding…", exact: true })).toBeDisabled();
        gate.release();
        await expect(preview.getByRole("button", { name: "Added to knowledge", exact: true })).toBeDisabled({ timeout: 180000 });
      } finally { await gate.dispose(); }
      manifest.indexed = true; await saveManifest();
    }
    const indexed = (await state()).artifacts.find(item => item.id === document.artifact.id);
    assert.equal(indexed.status, "indexed");
    assert(indexed.in_knowledge);
    await expect(preview.getByRole("status").filter({ hasText: `Searchable in ` })).toBeVisible();
    await preview.getByRole("button", { name: "Export to workdir", exact: true }).click();
    const destination = manifest.exportPath ?? `feedback-export-${suffix}/report.md`;
    await preview.getByLabel("Destination in workdir", { exact: true }).fill(destination);
    if (!manifest.exportPath) {
      const gate = await holdMutation(page, `**/api/artifacts/${document.artifact.id}/export`, "POST");
      try {
        await preview.getByRole("button", { name: "Export copy", exact: true }).click();
        await gate.started;
        await expect(preview.getByRole("button", { name: "Exporting…", exact: true })).toBeDisabled();
        gate.release();
        await expect(preview.getByRole("status").filter({ hasText: "Exported to " })).toBeVisible();
        assert.equal(gate.count(), 1);
      } finally { await gate.dispose(); }
      manifest.exportPath = destination; await saveManifest();
    }
    const exported = await request.get(`/api/runs/${run.id}/files?${new URLSearchParams({ path: destination })}`);
    assert.equal(exported.status(), 200);
    assert.equal(await exported.text(), sourceText);
    const refused = page.waitForResponse(response => new URL(response.url()).pathname === `/api/artifacts/${document.artifact.id}/export` && response.request().method() === "POST");
    await preview.getByRole("button", { name: "Export copy", exact: true }).click();
    assert.equal((await refused).status(), 400);
    await expect(preview.getByRole("alert")).toContainText(/exist/i);
    await expect(preview.getByLabel("Destination in workdir", { exact: true })).toHaveValue(destination);
    await expect(page.locator(".action-toast")).toHaveCount(0);
    await page.screenshot({ path: path.join(directory, "feedback-existing-markdown.png") });
    proof.scenarios.push({ name: "Markdown existing Recover, Add/index and Export feedback", runId: run.id, nativeSession: run.native_session_id,
      status: run.status, exitCode: run.exit_code, model: manifest.model, artifactId: document.artifact.id,
      captureKind: "historical_import", indexStatus: indexed.status, actualExportBytes: Buffer.byteLength(sourceText), existingDestinationStatus: 400,
      pendingStates: ["Saving current version…", "Adding…", "Exporting…"], duplicateToasts: 0 });
    proof.scenarios.push({ name: "ChatActivity real terminal completion opens actual run evidence", runId: run.id, status: "Done", fakeRunRows: 0 });
    await page.getByRole("button", { name: "Close Markdown preview", exact: true }).click();
    await persist();
    return proof;
  } catch (error) {
    proof.failure = error instanceof Error ? error.message : String(error);
    await persist();
    throw error;
  }
}
