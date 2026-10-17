import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

async function holdMutation(page, pattern, method) {
  let release;
  let markStarted;
  let count = 0;
  let settle;
  const done = new Promise(resolve => { settle = resolve; });
  const started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const handler = async route => {
    if (route.request().method() !== method) return route.continue();
    count += 1;
    markStarted();
    try { await gate; await route.continue(); }
    finally { settle(); }
  };
  await page.route(pattern, handler);
  return {
    started,
    count: () => count,
    release,
    async dispose() { release(); if (count) await done; await page.unroute(pattern, handler); },
  };
}

export async function verifyActionFeedbackOperations({ page, request, call, state, until, org, directory, base }) {
  assert(process.env.AE_TEST_ORG && process.env.AE_TEST_URL && path.resolve(org) !== path.resolve("../../org"), "Use an explicit disposable service and organization");
  const suffix = crypto.randomUUID().slice(0, 8);
  const proof = { injectedFaults: [], providerTasks: 0 };
  const persistProof = () => writeFile(path.join(directory, "action-feedback-operations.json"), JSON.stringify(proof, null, 2));
  const template = (await state()).agents[0];
  assert(template, "Candidate requires a real agent profile template");
  const agent = await call("/agents", { ...template, id: "", project_id: null, name: `Ops${suffix}`, reports_to: null, runtime_id: null, workdir: null, enabled: true, deleted_at: null });
  const group = await call("/groups", { id: "", name: `Feedback operations ${suffix}`, description: "Disposable feedback acceptance", member_ids: [agent.id, process.env.AE_TEST_ACTION_RUN_AGENT].filter(Boolean), scope_levels: null });
  const groupPath = `/groups/${group.id}`;
  proof.groupId = group.id;
  proof.unattachedAgentId = agent.id;
  const localFuture = await page.evaluate(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  });
  const dismissToasts = async () => {
    const buttons = page.getByRole("button", { name: "Dismiss notification", exact: true });
    while (await buttons.count()) {
      const count = await buttons.count();
      await buttons.first().click();
      await expect.poll(() => buttons.count()).toBeLessThan(count);
    }
  };

  try {
    await page.goto(`${base}${groupPath}/scheduled-tasks`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "New scheduled task", exact: true });
    const scheduleName = `Feedback schedule ${suffix}`;
    await dialog.getByLabel("Name", { exact: true }).fill(scheduleName);
    await dialog.getByLabel("Custom message").fill(" ");
    await dialog.locator("#task-start").fill(localFuture);
    await dialog.getByRole("button", { name: "Save task", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Schedule save not confirmed");
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(scheduleName);
    assert(!(await state()).schedules.some(item => item.name === scheduleName));
    proof.scheduleRejection = { persisted: false, draftRetained: true, actualBackendRejection: true };
    await dialog.getByLabel("Custom message").fill(`@${agent.name} Reply only when this future schedule is intentionally due.`);
    const scheduleGate = await holdMutation(page, `**/api/groups/${group.id}/schedules`, "POST");
    try {
      await dialog.getByRole("button", { name: "Save task", exact: true }).click();
      await scheduleGate.started;
      const pending = dialog.getByRole("button", { name: "Saving schedule…", exact: true });
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveAttribute("aria-busy", "true");
      await pending.evaluate(button => { button.click(); button.click(); });
      scheduleGate.release();
      await expect(dialog).toHaveCount(0);
      assert.equal(scheduleGate.count(), 1);
    } finally { await scheduleGate.dispose(); }
    proof.injectedFaults.push("Schedule request delayed before forwarding unchanged to the real endpoint");
    const task = await until(async () => (await state()).schedules.find(item => item.name === scheduleName), 15000);
    await expect(page.locator(".action-toast-title").filter({ hasText: scheduleName })).toContainText("saved");
    assert(task.enabled && task.next_run_at && !task.last_sent_at);
    const scheduleCard = page.getByRole("article", { name: scheduleName, exact: true });
    const pauseGate = await holdMutation(page, `**/api/schedules/${task.id}/enabled`, "PUT");
    try {
      await scheduleCard.getByRole("button", { name: "Pause", exact: true }).click();
      await pauseGate.started;
      await expect(scheduleCard.getByRole("button", { name: "Pausing…", exact: true })).toHaveAttribute("aria-busy", "true");
      pauseGate.release();
      await expect(scheduleCard).toContainText("Paused");
    } finally { await pauseGate.dispose(); }
    await scheduleCard.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(scheduleCard).toContainText("Scheduled");
    await scheduleCard.getByRole("button", { name: `Delete ${scheduleName}`, exact: true }).click();
    await page.getByRole("dialog", { name: `Delete ${scheduleName}?`, exact: true }).getByRole("button", { name: "Delete task", exact: true }).click();
    await expect(scheduleCard).toHaveCount(0);
    assert(!(await state()).schedules.some(item => item.id === task.id));
    proof.schedule = { id: task.id, delayedRequests: 1, pauseResumePersisted: true, deleted: true, sentMessages: 0 };
    await page.screenshot({ path: path.join(directory, "feedback-schedules.png") });
    await dismissToasts();

    await page.goto(`${base}${groupPath}/knowledge`);
    const fileName = `feedback-evidence-${suffix}.txt`;
    const uploadGate = await holdMutation(page, "**/api/artifacts", "POST");
    try {
      await page.getByLabel("Upload attachment", { exact: true }).setInputFiles({ name: fileName, mimeType: "text/plain", buffer: Buffer.from("ACTION_FEEDBACK_STORED_FILE\nActual artifact upload and index status.\n") });
      await uploadGate.started;
      await expect(page.getByRole("button", { name: "Uploading files…", exact: true })).toBeDisabled();
      uploadGate.release();
      await expect(page.getByRole("button", { name: "Upload files", exact: true })).toBeEnabled();
      assert.equal(uploadGate.count(), 1);
    } finally { await uploadGate.dispose(); }
    const artifact = await until(async () => (await state()).artifacts.find(item => item.name === fileName), 15000);
    assert.equal(artifact.status, "stored");
    const downloaded = await request.get(`/api/artifacts/${artifact.id}`);
    assert.equal(await downloaded.text(), "ACTION_FEEDBACK_STORED_FILE\nActual artifact upload and index status.\n");
    await page.getByRole("button", { name: fileName, exact: true }).click();
    const indexGate = await holdMutation(page, `**/api/artifacts/${artifact.id}/index`, "POST");
    let indexResponse;
    try {
      const response = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === `/api/artifacts/${artifact.id}/index`);
      await page.getByRole("button", { name: "Make searchable", exact: true }).click();
      await indexGate.started;
      await expect(page.getByRole("button", { name: "Requesting search…", exact: true })).toHaveAttribute("aria-busy", "true");
      await expect(page.getByRole("row").filter({ hasText: fileName })).not.toContainText("Searchable");
      indexGate.release();
      indexResponse = await (await response).json();
      assert.equal(indexResponse.status, "indexing");
      await expect(page.locator(".action-result").filter({ hasText: "Search preparation accepted" })).toBeVisible();
    } finally { await indexGate.dispose(); }
    const indexed = await until(async () => {
      const item = (await state()).artifacts.find(value => value.id === artifact.id);
      return item && ["indexed", "failed"].includes(item.status) && item;
    }, 90000);
    const fileRow = page.getByRole("row").filter({ hasText: fileName });
    await expect(fileRow).toContainText(indexed.status === "indexed" ? "Searchable" : "Search failed");
    let deletes = 0;
    const countDelete = request => { if (request.method() === "DELETE" && new URL(request.url()).pathname === `/api/artifacts/${artifact.id}`) deletes += 1; };
    page.on("request", countDelete);
    const failState = route => route.abort("failed");
    await page.route("**/api/state", failState);
    try {
      await page.getByRole("button", { name: `Delete ${fileName}`, exact: true }).click();
      await expect(page.locator(".action-toast-title").filter({ hasText: "file list could not refresh" })).toContainText("deleted");
      assert(!(await state()).artifacts.some(item => item.id === artifact.id));
    } finally { await page.unroute("**/api/state", failState); }
    await page.getByRole("button", { name: "Refresh file list", exact: true }).click();
    await expect(fileRow).toHaveCount(0);
    assert.equal(deletes, 1, "Read-only recovery does not repeat the deletion");
    page.off("request", countDelete);
    proof.injectedFaults.push("Browser GET /api/state aborted after real artifact deletion; API verification reads were not intercepted");
    proof.knowledge = { id: artifact.id, contentVerified: true, acceptedIndexStatus: indexResponse.status, terminalIndexStatus: indexed.status, deleted: true, deleteRequestsAfterReadRetry: deletes };
    await page.screenshot({ path: path.join(directory, "feedback-knowledge.png") });
    await dismissToasts();

    await page.goto(`${base}${groupPath}/actions`);
    await page.getByRole("button", { name: "New action", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "New action", exact: true });
    const actionTitle = `Feedback backlog ${suffix}`;
    await dialog.getByLabel("Title", { exact: true }).fill(actionTitle);
    await dialog.getByLabel("Task / instructions", { exact: true }).fill("No task should launch while this action remains in backlog.");
    await dialog.getByLabel("Person in charge (PIC)", { exact: true }).selectOption(agent.id);
    const actionGate = await holdMutation(page, "**/api/actions", "POST");
    try {
      await dialog.getByRole("button", { name: "Save to backlog", exact: true }).click();
      await actionGate.started;
      await expect(dialog.getByRole("button", { name: "Saving action…", exact: true })).toHaveAttribute("aria-busy", "true");
      actionGate.release();
      await expect(dialog).toHaveCount(0);
      assert.equal(actionGate.count(), 1);
    } finally { await actionGate.dispose(); }
    let action = await until(async () => (await state()).actions.find(item => item.title === actionTitle), 15000);
    assert.equal(action.revision, 1);
    assert.equal(action.status, "backlog");
    await page.getByRole("button", { name: `Edit ${actionTitle}`, exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit action", exact: true });
    await editDialog.getByRole("button", { name: "Run now", exact: true }).click();
    await expect(editDialog.locator(".action-result")).toContainText("saved at revision 2, but its launch was not confirmed");
    action = (await state()).actions.find(item => item.id === action.id);
    assert.equal(action.revision, 2);
    assert.equal(action.status, "backlog");
    assert.equal(action.run_id, null);
    await editDialog.getByRole("button", { name: "Refresh action list", exact: true }).click();
    await expect(editDialog).toHaveCount(0);
    assert.equal((await state()).actions.find(item => item.id === action.id).revision, 2, "Reconciliation never repeats save or invoke");
    await page.getByRole("button", { name: `Edit ${actionTitle}`, exact: true }).click();
    await editDialog.getByLabel("Planned start (optional, your local time)").fill(localFuture.slice(0, 16));
    await editDialog.getByRole("button", { name: "Schedule action", exact: true }).click();
    await expect(editDialog).toHaveCount(0);
    action = (await state()).actions.find(item => item.id === action.id);
    assert.equal(action.status, "scheduled");
    await page.getByRole("button", { name: `Delete ${actionTitle}`, exact: true }).click();
    await page.getByRole("dialog", { name: "Delete action?", exact: true }).getByRole("button", { name: "Delete action", exact: true }).click();
    await until(async () => !(await state()).actions.some(item => item.id === action.id), 15000);
    proof.action = { id: action.id, backlogRevision: 1, retainedRevisionAfterInvokeRejection: 2, scheduledRevision: action.revision, deleted: true, rejectedInvocationCreatedRun: false };
    await persistProof();

    const runAgentId = process.env.AE_TEST_ACTION_RUN_AGENT;
    assert(runAgentId, "AE_TEST_ACTION_RUN_AGENT must identify the dedicated authorized real native agent for queued/cancel proof");
    const runAgent = (await state()).agents.find(item => item.id === runAgentId);
    assert(runAgent?.workdir && runAgent.permission === "read-only", "Controlled run uses an actual attached read-only agent");
    const controlled = await call("/actions", { id: crypto.randomUUID(), revision: 0, group_id: group.id, title: `Feedback controlled run ${suffix}`, body: "Use your shell tool to execute exactly sleep 30 in the current workdir. Do not edit files, read credentials, run any other command, or delegate. After it finishes reply FEEDBACK_SLEEP_COMPLETE. The owner may cancel this verification.", assignee_id: runAgentId, planned_start: null });
    await page.reload();
    const invokeGate = await holdMutation(page, `**/api/actions/${controlled.id}/invoke`, "POST");
    let queued;
    try {
      const response = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === `/api/actions/${controlled.id}/invoke`);
      await page.getByRole("button", { name: `Run ${controlled.title}`, exact: true }).click();
      await invokeGate.started;
      await expect(page.getByRole("button", { name: `Queuing ${controlled.title}`, exact: true })).toHaveAttribute("aria-busy", "true");
      invokeGate.release();
      queued = await (await response).json();
      assert.equal(queued.status, "queued");
    } finally { await invokeGate.dispose(); }
    proof.providerTasks += 1;
    const nativeRun = await until(async () => {
      const snapshot = await state();
      const run = snapshot.runs.find(item => item.id === queued.run_id);
      if (run && !["queued", "starting", "running", "waiting"].includes(run.status)) throw new Error(`Controlled native run ended before cancellation: ${run.status}`);
      return run?.pid && run.status === "running" && run;
    }, 90000);
    const cancellation = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === `/api/actions/${controlled.id}/cancel`);
    await page.getByRole("button", { name: `Stop ${controlled.title}`, exact: true }).click();
    const cancelResult = await (await cancellation).json();
    await expect(page.locator(".action-result").filter({ hasText: controlled.title })).toContainText(cancelResult.status === "cancelled" ? "cancelled" : "Cancellation requested");
    const terminal = await until(async () => {
      const item = (await state()).actions.find(value => value.id === controlled.id);
      return item && !["queued", "running"].includes(item.status) && item;
    }, 90000);
    assert.equal(terminal.status, "cancelled");
    proof.controlledRun = { actionId: controlled.id, runId: queued.run_id, actualNativePid: nativeRun.pid, invokeAcknowledgment: queued.status, cancellationAcknowledgment: cancelResult.status, terminalState: terminal.status, agentId: runAgentId };
    await page.screenshot({ path: path.join(directory, "feedback-action-cancelled.png") });
    assert(!(await state()).schedules.some(item => item.group_id === group.id), "No schedule can launch unintended work");
    await persistProof();
    return proof;
  } catch (error) {
    proof.failure = error instanceof Error ? error.message : String(error);
    await persistProof();
    throw error;
  }
}
