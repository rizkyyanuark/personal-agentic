import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function verifyActionFeedback(harness) {
  const { page, call, state, until, org, directory } = harness;
  assert.equal(process.env.AE_TEST_DISPOSABLE, "true", "Feedback faults require a disposable organization");
  const pendingReleases = [];
  try {
  page.setDefaultTimeout(20000);
  const initial = await state();
  const template = initial.agents.find(agent => !agent.deleted_at);
  assert(template, "A real initial agent is required");
  const agent = await call("/agents", { ...template, id: "", runtime_id: undefined, name: `Feedback acceptance ${crypto.randomUUID().slice(0, 8)}`, position: "Feedback verifier", project_id: null, reports_to: null, instructions: "FEEDBACK_BASELINE", agents_md: "FEEDBACK_LEGACY_INSTRUCTIONS", workdir: null, model: "", reasoning: "", timeout_seconds: 90, enabled: true });
  const current = async () => (await state()).agents.find(value => value.id === agent.id);
  const editor = () => page.getByLabel("Role and task instructions");
  const status = () => page.locator(".inspector .action-status-area");
  const navigate = async (section = "instructions") => { await page.goto(`/organization/agents/${agent.id}/${section}`); await expect(page.locator(".inspector")).toBeVisible(); };
  const save = () => page.getByRole("button", { name: "Save changes", exact: true });
  const acceptDraft = async () => {
    await page.getByRole("button", { name: "Check saved profile", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keep my draft using saved revision", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Keep my draft using saved revision", exact: true }).click();
  };
  await navigate();
  await editor().fill("FEEDBACK_SLOW_SAVE");
  const before = await current();
  let release, intercepted, putCount = 0;
  const waitForRequest = new Promise(resolve => { intercepted = resolve; });
  const held = new Promise(resolve => { release = resolve; pendingReleases.push(resolve); });
  const slow = async route => {
    if (route.request().method() !== "PUT") return route.continue();
    putCount++; intercepted(); await held; await route.continue();
  };
  await page.route(`**/api/agents/${agent.id}`, slow);
  await save().click(); await waitForRequest;
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toHaveAttribute("aria-busy", "true");
  await expect(editor()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Close agent settings" })).toBeEnabled();
  await page.getByRole("button", { name: "Saving…", exact: true }).dispatchEvent("click");
  await page.screenshot({ path: path.join(directory, "feedback-agent-pending.png") });
  release();
  await expect(status()).toContainText("changes saved");
  await expect(status()).toContainText("next run");
  assert.equal(putCount, 1);
  assert.equal((await current()).revision, before.revision + 1);
  await page.unroute(`**/api/agents/${agent.id}`, slow);
  await expect(page.locator(".action-toast")).toHaveCount(0);
  await page.screenshot({ path: path.join(directory, "feedback-agent-saved.png") });
  await editor().fill("FEEDBACK_FAST_SAVE");
  await expect(page.locator('[data-draft-status="unsaved"]')).toBeVisible();
  await expect(status()).not.toContainText("changes saved");
  await save().click();
  await expect(status()).toContainText("changes saved");
  await navigate();
  await expect(editor()).toHaveValue("FEEDBACK_FAST_SAVE");
  const beforeRestore = await current();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const revision = page.locator(".session-list > div").filter({ has: page.getByText(`Revision ${before.revision}`, { exact: true }) });
  await revision.getByRole("button", { name: "Restore this revision", exact: true }).click();
  await expect(status()).toContainText("restored as a new revision");
  assert.equal((await current()).revision, beforeRestore.revision + 1);
  assert.equal((await current()).instructions, "FEEDBACK_BASELINE\n\nFEEDBACK_LEGACY_INSTRUCTIONS");
  assert.equal((await current()).agents_md, "");
  await expect(status()).toContainText("restored as a new revision");
  await page.getByRole("button", { name: "Instructions", exact: true }).click();

  let releaseSnapshot, receivedSnapshot;
  const snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; pendingReleases.push(resolve); });
  const snapshotReady = new Promise(resolve => { receivedSnapshot = resolve; });
  let snapshotUsed = false;
  const holdOldState = async route => {
    if (snapshotUsed) return route.continue();
    snapshotUsed = true;
    const response = await route.fetch();
    receivedSnapshot(); await snapshotGate; await route.fulfill({ response });
  };
  await page.route("**/api/state", holdOldState);
  const chatGroup = await call("/groups", { id: "", name: `Feedback chat ${crypto.randomUUID().slice(0, 8)}`, description: "Disposable feedback message acceptance", member_ids: [], scope_levels: null });
  await snapshotReady;
  await editor().fill("FEEDBACK_NEWER_THAN_SNAPSHOT"); await save().click();
  await expect(status()).toContainText("changes saved");
  releaseSnapshot();
  await page.unrouteAll({ behavior: "wait" });
  await expect(editor()).toHaveValue("FEEDBACK_NEWER_THAN_SNAPSHOT");
  await page.getByRole("button", { name: "Close agent settings" }).click();
  await page.getByRole("button", { name: `Configure ${template.name}`, exact: true }).first().click();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(editor()).toHaveValue([...new Set([template.instructions, template.agents_md].filter(value => value.trim()))].join("\n\n"));
  await navigate();

  await editor().fill("FEEDBACK_DRAFT_CONFLICT");
  const external = await current();
  await call(`/agents/${agent.id}`, { ...external, instructions: "FEEDBACK_EXTERNAL" }, "PUT");
  await expect(page.getByText("This profile has a newer saved revision. Your draft has been kept.", { exact: true })).toBeVisible();
  await expect(editor()).toHaveValue("FEEDBACK_DRAFT_CONFLICT");
  await expect(save()).toBeDisabled();
  await acceptDraft();
  await save().click();
  await expect(status()).toContainText("changes saved");
  assert.equal((await current()).instructions, "FEEDBACK_DRAFT_CONFLICT");

  await editor().fill("FEEDBACK_STALE_REQUEST");
  let unblockStale, staleReached;
  const staleGate = new Promise(resolve => { unblockStale = resolve; pendingReleases.push(resolve); });
  const staleArrived = new Promise(resolve => { staleReached = resolve; });
  const stale = async route => { if (route.request().method() === "PUT") { staleReached(); await staleGate; } await route.continue(); };
  await page.route(`**/api/agents/${agent.id}`, stale);
  await save().click(); await staleArrived;
  await call(`/agents/${agent.id}`, { ...await current(), instructions: "FEEDBACK_STALE_WINNER" }, "PUT");
  const rejected = page.waitForResponse(response => response.url().endsWith(`/api/agents/${agent.id}`) && response.request().method() === "PUT");
  unblockStale();
  assert.equal((await rejected).status(), 400);
  await expect(status()).toContainText("profile changed elsewhere");
  await expect(editor()).toHaveValue("FEEDBACK_STALE_REQUEST");
  await page.unroute(`**/api/agents/${agent.id}`, stale);
  await acceptDraft(); await save().click(); await expect(status()).toContainText("changes saved");

  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByLabel("Run timeout (seconds)").fill("5");
  const invalidResponse = page.waitForResponse(response => response.url().endsWith(`/api/agents/${agent.id}`) && response.request().method() === "PUT");
  await save().click(); assert.equal((await invalidResponse).status(), 400);
  await expect(status()).toContainText("between 10 and 14400");
  await page.getByLabel("Run timeout (seconds)").fill("90");
  await page.getByRole("button", { name: "Instructions", exact: true }).click();

  let acknowledged = false, refreshFailures = 0, refreshPuts = 0;
  const failRefresh = async route => {
    if (acknowledged) { refreshFailures++; return route.abort("failed"); }
    return route.continue();
  };
  const observedSave = async route => {
    if (route.request().method() !== "PUT") return route.continue();
    refreshPuts++;
    const response = await route.fetch(); acknowledged = response.ok();
    await route.fulfill({ response });
  };
  await page.route("**/api/state", failRefresh);
  await page.route(`**/api/agents/${agent.id}`, observedSave);
  await editor().fill("FEEDBACK_SAVED_REFRESH_FAILED"); await save().click();
  await expect(status()).toContainText("configuration saved, but the view could not refresh");
  assert(refreshFailures > 0);
  assert.equal((await current()).instructions, "FEEDBACK_SAVED_REFRESH_FAILED");
  await page.unroute("**/api/state", failRefresh);
  await page.getByRole("button", { name: "Retry refresh", exact: true }).click();
  await expect(status()).toContainText("view refreshed");
  assert.equal(refreshPuts, 1, "Refresh recovery must not repeat PUT");
  await page.unroute(`**/api/agents/${agent.id}`, observedSave);

  const profileFile = path.join(org, agent.id, "profile.json");
  const profileBackup = `${profileFile}.feedback-backup`;
  const committedBefore = await current();
  await rename(profileFile, profileBackup); await mkdir(profileFile);
  let postCommitStatus;
  try {
    await editor().fill("FEEDBACK_COMMITTED_FILE_FAILURE");
    const response = page.waitForResponse(value => value.url().endsWith(`/api/agents/${agent.id}`) && value.request().method() === "PUT");
    await save().click(); postCommitStatus = (await response).status();
    assert.equal(postCommitStatus, 400);
    await expect(status()).toContainText("Save not confirmed");
    await expect(editor()).toHaveValue("FEEDBACK_COMMITTED_FILE_FAILURE");
    const committed = await current();
    assert.equal(committed.revision, committedBefore.revision + 1);
    assert.equal(committed.instructions, "FEEDBACK_COMMITTED_FILE_FAILURE");
    assert.notEqual(await readFile(path.join(org, agent.id, "instructions.md"), "utf8"), committed.instructions);
    await acceptDraft();
    assert.equal((await current()).revision, committed.revision, "Read recovery cannot automatically repeat PUT");
  } finally { await rm(profileFile, { recursive: true }); await rename(profileBackup, profileFile); }

  await editor().fill("FEEDBACK_LOST_RESPONSE");
  let lostCount = 0;
  const lose = async route => {
    if (route.request().method() !== "PUT") return route.continue();
    lostCount++; await route.fetch(); await route.abort("failed");
  };
  await page.route(`**/api/agents/${agent.id}`, lose);
  await save().click(); await expect(status()).toContainText("Save not confirmed");
  await expect(editor()).toHaveValue("FEEDBACK_LOST_RESPONSE");
  assert.equal(lostCount, 1); assert.equal((await current()).instructions, "FEEDBACK_LOST_RESPONSE");
  await page.unroute(`**/api/agents/${agent.id}`, lose);
  await acceptDraft();
  await editor().fill("FEEDBACK_RECOVERED"); await save().click(); await expect(status()).toContainText("changes saved");

  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.getByLabel("Agent-owned scripts").check();
  await page.getByLabel("Script filename").fill("feedback.txt");
  await page.getByLabel("Script content").fill("FEEDBACK_SCRIPT_NOT_EXECUTED\n");
  await page.getByRole("button", { name: "Save script", exact: true }).click();
  await expect(status()).toContainText("script saved");
  assert.equal(await readFile(path.join(org, agent.id, "scripts", "feedback.txt"), "utf8"), "FEEDBACK_SCRIPT_NOT_EXECUTED\n");
  await page.getByLabel("Script filename").fill("../escape.txt");
  await page.getByRole("button", { name: "Save script", exact: true }).click();
  await expect(status()).toContainText("script save not confirmed");
  await expect(page.getByLabel("Script content")).toHaveValue("FEEDBACK_SCRIPT_NOT_EXECUTED\n");

  await navigate();
  await editor().fill("FEEDBACK_PANEL_CLOSED");
  let releaseClosed, closedArrived;
  const closedGate = new Promise(resolve => { releaseClosed = resolve; pendingReleases.push(resolve); });
  const reachedClosed = new Promise(resolve => { closedArrived = resolve; });
  const closePending = async route => { if (route.request().method() === "PUT") { closedArrived(); await closedGate; } await route.continue(); };
  await page.route(`**/api/agents/${agent.id}`, closePending);
  await save().click(); await reachedClosed;
  await page.getByRole("button", { name: "Close agent settings" }).click();
  await page.getByRole("button", { name: `Configure ${agent.name}`, exact: true }).click();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(editor()).toBeDisabled();
  releaseClosed();
  await expect(page.locator(".action-toast")).toContainText(`${agent.name}: changes saved`);
  await expect(editor()).toHaveValue("FEEDBACK_PANEL_CLOSED");
  await page.unroute(`**/api/agents/${agent.id}`, closePending);
  await until(async () => (await current()).instructions === "FEEDBACK_PANEL_CLOSED");
  await navigate();

  await page.goto(`/groups/${chatGroup.id}/chat`);
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await message.fill("FEEDBACK_CHAT_ACCEPTED");
  let releaseMessage, messageArrived;
  const messageGate = new Promise(resolve => { releaseMessage = resolve; pendingReleases.push(resolve); });
  const messageReady = new Promise(resolve => { messageArrived = resolve; });
  let sentRequests = 0;
  const holdMessage = async route => { if (route.request().method() === "POST") { sentRequests++; messageArrived(); await messageGate; } await route.continue(); };
  await page.route("**/api/messages", holdMessage);
  await page.getByRole("button", { name: "Send message", exact: true }).click(); await messageReady;
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Send message", exact: true }).dispatchEvent("click");
  await page.getByLabel("Upload attachment").setInputFiles({ name: "feedback-upload-during-send.txt", mimeType: "text/plain", buffer: Buffer.from("Unsent attachment added during real pending message\n") });
  await expect(page.locator(".compose-attachments")).toContainText("feedback-upload-during-send.txt");
  releaseMessage();
  await expect(page.locator(".message-bubble").filter({ hasText: "FEEDBACK_CHAT_ACCEPTED" })).toHaveCount(1);
  await expect(page.locator(".compose-attachments")).toContainText("feedback-upload-during-send.txt");
  assert.equal(sentRequests, 1);
  await page.unrouteAll({ behavior: "wait" });
  await message.fill("FEEDBACK_CHAT_RETRY_SAME_ID");
  const sentIds = [];
  let loseMessage = true;
  const messageFault = async route => {
    if (route.request().method() !== "POST") return route.continue();
    sentIds.push(route.request().postDataJSON().id);
    if (loseMessage) { await route.fetch(); return route.abort("failed"); }
    return route.continue();
  };
  await page.route("**/api/messages", messageFault);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".action-status-area").filter({ hasText: "acceptance could not be confirmed" })).toBeVisible();
  await expect(message).toHaveValue("FEEDBACK_CHAT_RETRY_SAME_ID");
  loseMessage = false;
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(message).toHaveValue("");
  assert.equal(sentIds.length, 2); assert.equal(sentIds[0], sentIds[1]);
  assert.equal((await call(`/groups/${chatGroup.id}/messages?main=true`, undefined, "GET")).filter(value => value.body === "FEEDBACK_CHAT_RETRY_SAME_ID").length, 1);
  await page.unrouteAll({ behavior: "wait" });

  await page.getByLabel("Upload attachment").setInputFiles({ name: "feedback-chat-attachment.txt", mimeType: "text/plain", buffer: Buffer.from("Real disposable attachment\n") });
  await expect(page.locator(".action-status-area").filter({ hasText: "Attachment stored and ready to send" })).toBeVisible();
  await expect(page.locator(".compose-attachments")).toContainText("feedback-chat-attachment.txt");
  let storedUpload;
  const lostUpload = async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); storedUpload = await response.json(); await route.abort("failed");
  };
  await page.route("**/api/artifacts", lostUpload);
  await page.getByLabel("Upload attachment").setInputFiles({ name: "feedback-unconfirmed-upload.txt", mimeType: "text/plain", buffer: Buffer.from("Real stored file with response lost\n") });
  await expect(page.locator(".action-status-area").filter({ hasText: "Upload could not be confirmed" })).toBeVisible();
  assert((await state()).artifacts.some(value => value.id === storedUpload.id));
  await page.unrouteAll({ behavior: "wait" });

  await message.fill("/btw");
  let releaseSideChat, sideChatReceived;
  const sideChatGate = new Promise(resolve => { releaseSideChat = resolve; pendingReleases.push(resolve); });
  const sideChatReady = new Promise(resolve => { sideChatReceived = resolve; });
  const holdSideChat = async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); sideChatReceived(); await sideChatGate; await route.fulfill({ response });
  };
  await page.route("**/api/messages", holdSideChat);
  await page.getByRole("button", { name: "Send message", exact: true }).click(); await sideChatReady;
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  const selectedView = page.url();
  releaseSideChat();
  await expect(page.getByRole("button", { name: "Knowledge", exact: true })).toHaveClass("active");
  await page.unrouteAll({ behavior: "wait" });
  assert.equal(page.url(), selectedView, "A delayed /btw response cannot navigate away from a newly selected view");

  const proof = { agentId: agent.id, duplicateSaveRequests: putCount, postCommitHttpStatus: postCommitStatus, lostResponseMutationCount: lostCount, injectedFaults: ["held real request", "aborted follow-up read", "materialized profile target directory collision", "lost response after real commit"], providerRunsForCore: (await state()).runs.length - initial.runs.length };
  assert.equal(proof.providerRunsForCore, 0);
  await writeFile(path.join(directory, "action-feedback-core.json"), JSON.stringify(proof, null, 2));
  console.log("PASS feedback core: real save/revision/script paths, duplicate guard, conflicts, post-commit HTTP400, lost response and remount recovery; zero provider runs");
  if (!harness.coreOnly) {
    const { verifyActionFeedbackSettings } = await import("./action-feedback-settings.mjs");
    const { verifyActionFeedbackOperations } = await import("./action-feedback-operations.mjs");
    proof.settings = await verifyActionFeedbackSettings(harness);
    proof.operations = await verifyActionFeedbackOperations(harness);
    const { verifyActionFeedbackExisting } = await import("./action-feedback-existing.mjs");
    proof.existing = await verifyActionFeedbackExisting(harness);
    const { verifyActionFeedbackAccessibility } = await import("./action-feedback-accessibility.mjs");
    proof.accessibility = await verifyActionFeedbackAccessibility(harness);
  }
  await page.screenshot({ path: path.join(directory, "feedback-final.png") });
  return proof;
  } finally {
    pendingReleases.forEach(release => release());
    await page.unrouteAll({ behavior: "wait" });
  }
}
