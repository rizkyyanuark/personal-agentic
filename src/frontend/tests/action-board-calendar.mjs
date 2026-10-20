import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { selectValue } from "./value-picker.mjs";

const expect = playwrightExpect.configure({ timeout: 30000 });
const DAY = 24 * 60 * 60 * 1000;

export async function fillActionDateTime(page, local, { chooseDay = false } = {}) {
  const [date, time] = local.split("T");
  assert(date && time, "Supply an explicit local date and time");
  await page.locator("#action-start").click();
  const popup = page.getByRole("dialog", { name: "Choose planned date", exact: true });
  await expect(popup).toBeVisible();
  await popup.getByLabel("Date (YYYY-MM-DD)", { exact: true }).fill(date);
  if (chooseDay) await popup.locator(`button[data-day="${date}"]`).first().click();
  else await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await page.locator("#action-time").fill(time);
}

export async function verifyActionBoardCalendar({ page, request, call, state, until, org, base, directory }) {
  const target = new URL(base);
  assert.equal(process.env.AE_TEST_DISPOSABLE, "true", "Use a disposable local organization");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Action board calendar tests require a loopback candidate");
  assert(process.env.AE_TEST_ORG && path.resolve(org) !== path.resolve("../../org"), "Use an explicitly separate organization");

  const suffix = crypto.randomUUID().slice(0, 8);
  const initialRuns = new Set((await state()).runs.map(run => run.id));
  const createdActions = new Set();
  const receipt = { timezones: [], providerTasks: 0, authentication: null };
  const browser = page.context().browser();
  assert(browser, "A real browser is required");
  const auth = await page.context().storageState();

  const template = (await state()).agents[0];
  assert(template, "Candidate requires a real agent profile template");
  const agent = await call("/agents", {
    ...template,
    id: "",
    project_id: null,
    name: `ActionCal${suffix}`,
    reports_to: null,
    runtime_id: null,
    workdir: null,
    enabled: true,
    deleted_at: null,
  });

  const group = await call("/groups", {
    id: "",
    name: `Action Board ${suffix}`,
    description: "Disposable future-only action board calendar verification",
    member_ids: [agent.id],
    scope_levels: null,
  });
  receipt.groupId = group.id;
  receipt.unattachedAgentId = agent.id;

  const year = new Date().getFullYear() + 2;
  const todayLocal = async candidate => candidate.evaluate(() => {
    const date = new Date();
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });

  try {
    for (const timeZone of ["Asia/Jakarta", "America/Los_Angeles"]) {
      const context = await browser.newContext({ baseURL: base, storageState: auth, timezoneId: timeZone, viewport: { width: 1280, height: 900 } });
      const candidate = await context.newPage();
      const errors = [];
      candidate.on("pageerror", error => errors.push(error.message));
      const locks = [];
      const layouts = [];
      let nativeZoom = null;
      let mutations = 0;
      candidate.on("request", value => {
        if (["POST", "PUT"].includes(value.method()) && /\/api\/actions(?:\/|$)/.test(value.url())) mutations += 1;
      });

      try {
        await candidate.goto(`${base}/groups/${group.id}/actions`);
        await expect(candidate.getByRole("heading", { name: "Action board", exact: true })).toBeVisible();

        // 1. Create backlog action with blank planned start
        await candidate.getByRole("button", { name: "New action", exact: true }).click();
        let dialog = candidate.getByRole("dialog", { name: "New action", exact: true });
        const title = `Action ${timeZone} ${suffix}`;
        await dialog.getByLabel("Title", { exact: true }).fill(title);
        await dialog.getByLabel("Task / instructions", { exact: true }).fill("Plan action without starting an execution run.");
        await selectValue(dialog.getByLabel("Person in charge (PIC)", { exact: true }), agent.id);
        await expect(dialog.locator("#action-timezone")).toContainText(timeZone);

        // Blank planned start -> button is "Save to backlog"
        const saveBacklogBtn = dialog.getByRole("button", { name: "Save to backlog", exact: true });
        await expect(saveBacklogBtn).toBeVisible();
        await saveBacklogBtn.click();
        await expect(dialog).toHaveCount(0);

        let action = await until(async () => (await state()).actions.find(a => a.title === title), 15000);
        createdActions.add(action.id);
        assert.equal(action.planned_start, null, "Blank planned start persists as null");
        assert.equal(action.status, "backlog", "Action remains in backlog");
        const backlogRevision = action.revision;

        if (!receipt.authentication) {
          const anonymous = await browser.newContext({ baseURL: base });
          try {
            const deniedSave = await anonymous.request.post("/api/actions", {
              headers: { Origin: target.origin },
              data: {
                id: action.id,
                revision: action.revision,
                group_id: group.id,
                title: "Unauthenticated change must be rejected",
                body: action.body,
                assignee_id: agent.id,
                planned_start: null,
              },
            });
            assert.equal(deniedSave.status(), 401, "Unauthenticated action save is rejected");
            const deniedInvoke = await anonymous.request.post(`/api/actions/${action.id}/invoke`, {
              headers: { Origin: target.origin },
              data: {},
            });
            assert.equal(deniedInvoke.status(), 401, "Unauthenticated action invocation is rejected");
            const afterDenied = (await state()).actions.find(item => item.id === action.id);
            assert.deepEqual(afterDenied, action, "Authentication failures leave the action unchanged");
            receipt.authentication = {
              actionId: action.id,
              saveHttpStatus: deniedSave.status(),
              invokeHttpStatus: deniedInvoke.status(),
              retainedRevision: afterDenied.revision,
              retainedStatus: afterDenied.status,
              runId: afterDenied.run_id,
            };
          } finally {
            await anonymous.close();
          }
        }

        // 2. Open action for editing
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });

        // Nested dismissal: Escape closes popup without closing parent dialog or submitting form
        const beforeMutations = mutations;
        await dialog.locator("#action-start").click();
        let popup = candidate.getByRole("dialog", { name: "Choose planned date", exact: true });
        await expect(popup).toBeVisible();
        await candidate.keyboard.press("Escape");
        await expect(candidate.getByRole("dialog", { name: "Choose planned date", exact: true })).toHaveCount(0);
        await expect(dialog).toBeVisible();
        await expect(dialog.locator("#action-start")).toBeFocused();
        assert.equal(mutations, beforeMutations, "Dismissing calendar popup cannot submit form");

        // 3. Schedule action with valid future date and time (preserving seconds)
        const local = `${year}-01-01T00:15:37`;
        await fillActionDateTime(candidate, local, { chooseDay: true });
        await expect(dialog.locator("#action-time")).toHaveValue("00:15:37");

        // Keyboard date selection: now that a day is selected, data-selected-single="true" exists
        await dialog.locator("#action-start").click();
        await candidate.locator('.schedule-calendar-day-button[data-selected-single="true"]').focus();
        await candidate.keyboard.press("ArrowRight");
        await candidate.keyboard.press("Enter");
        await expect(candidate.getByRole("dialog", { name: "Choose planned date", exact: true })).toHaveCount(0);
        assert.equal(mutations, beforeMutations, "Keyboard calendar selection cannot submit form");

        // Re-fill local date and time before saving
        await fillActionDateTime(candidate, local);
        const scheduleBtn = dialog.getByRole("button", { name: "Schedule action", exact: true });
        await expect(scheduleBtn).toBeVisible();
        await scheduleBtn.click();
        await expect(dialog).toHaveCount(0);

        action = await until(async () => (await state()).actions.find(a => a.id === action.id), 15000);
        const expectedInstant = await candidate.evaluate(value => new Date(value).toISOString(), local);
        assert.equal(new Date(action.planned_start).toISOString(), expectedInstant, "Planned start stores exact UTC instant");
        assert.equal(action.status, "scheduled");

        // 4. Independent component edit: change only date, verify seconds preserved
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
        await expect(dialog.locator("#action-time")).toHaveValue("00:15:37");

        const editDate = `${year}-01-02`;
        await dialog.locator("#action-start").click();
        popup = candidate.getByRole("dialog", { name: "Choose planned date", exact: true });
        await popup.getByLabel("Date (YYYY-MM-DD)", { exact: true }).fill(editDate);
        await popup.getByRole("button", { name: "Done", exact: true }).click();
        await expect(popup).toHaveCount(0);
        await expect(dialog.locator("#action-time")).toHaveValue("00:15:37"); // seconds retained!

        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog).toHaveCount(0);

        action = (await state()).actions.find(a => a.id === action.id);
        const expectedDateEditInstant = await candidate.evaluate(value => new Date(value).toISOString(), `${editDate}T00:15:37`);
        assert.equal(new Date(action.planned_start).toISOString(), expectedDateEditInstant, "Date-only edit preserves time and seconds");

        // Independent component edit: change only time, verify date preserved
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
        await dialog.locator("#action-time").fill("14:22:51");
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog).toHaveCount(0);

        action = (await state()).actions.find(a => a.id === action.id);
        const expectedTimeEditInstant = await candidate.evaluate(value => new Date(value).toISOString(), `${editDate}T14:22:51`);
        assert.equal(new Date(action.planned_start).toISOString(), expectedTimeEditInstant, "Time-only edit preserves date");

        // 5. Validation errors: incomplete, invalid, window, today past
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });

        // Incomplete: time empty with date set
        await dialog.locator("#action-time").fill("");
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("complete date and time");
        assert.equal(new Date((await state()).actions.find(a => a.id === action.id).planned_start).toISOString(), expectedTimeEditInstant);

        // Non-date string entered in calendar date input
        await dialog.locator("#action-start").click();
        popup = candidate.getByRole("dialog", { name: "Choose planned date", exact: true });
        const dateInput = popup.getByLabel("Date (YYYY-MM-DD)", { exact: true });
        await dateInput.fill("invalid-date-string");
        await expect(dateInput).toHaveAttribute("aria-invalid", "true");
        await popup.getByRole("button", { name: "Done", exact: true }).click();
        await expect(popup).toHaveCount(0);
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("complete date and time");

        // Invalid date
        await fillActionDateTime(candidate, `${year}-02-30T12:00:00`);
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("complete date and time");

        // Beyond 3650 days
        const upper = await candidate.evaluate(() => {
          const date = new Date(Date.now() + 3651 * 24 * 60 * 60 * 1000);
          const pad = value => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T12:00:00`;
        });
        await fillActionDateTime(candidate, upper);
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("within ten years");

        // Today in the past
        const today = await todayLocal(candidate);
        await fillActionDateTime(candidate, `${today}T00:00:00`);
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("future date and time");

        // 6. Leap year boundary
        const nextLeap = Array.from({ length: 10 }, (_, offset) => new Date().getFullYear() + offset + 1).find(value => value % 4 === 0 && (value % 100 !== 0 || value % 400 === 0));
        assert(nextLeap, "A leap year exists inside the scheduling window");
        const leapLocal = `${nextLeap}-02-29T23:45:19`;
        await fillActionDateTime(candidate, leapLocal, { chooseDay: true });
        await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
        await expect(dialog).toHaveCount(0);

        action = (await state()).actions.find(a => a.id === action.id);
        const expectedLeapInstant = await candidate.evaluate(value => new Date(value).toISOString(), leapLocal);
        assert.equal(new Date(action.planned_start).toISOString(), expectedLeapInstant);

        // 7. Clear / backlog restoration: clear button restores null backlog
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
        await expect(dialog.locator("#action-time")).toHaveValue("23:45:19");

        const clearBtn = dialog.getByRole("button", { name: "Clear planned start", exact: true });
        await expect(clearBtn).toBeVisible();
        await clearBtn.click();
        await expect(dialog.locator("#action-time")).toHaveValue("");

        // Submitting with cleared planned start persists null and restores backlog
        await dialog.getByRole("button", { name: "Save to backlog", exact: true }).click();
        await expect(dialog).toHaveCount(0);

        action = (await state()).actions.find(a => a.id === action.id);
        assert.equal(action.planned_start, null, "Cleared planned start persists as null");
        assert.equal(action.status, "backlog", "Action returned to backlog");

        // 8. Run now ignores an incomplete planned start and unattached fixture tests invoke failure recovery
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
        // Enter only time without date (incomplete date/time draft)
        await dialog.locator("#action-time").fill("10:00:00");
        const titleField = dialog.locator("#action-title");
        await titleField.fill("");
        const beforeInvalidRunNow = mutations;
        await dialog.locator('button[value="now"]').click();
        await expect(titleField).toBeFocused();
        assert.equal(await titleField.evaluate(input => input.validity.valueMissing), true);
        assert.equal(mutations, beforeInvalidRunNow, "Run now retains required title validation before any save or invoke");
        const missingTitleMutationRequests = mutations - beforeInvalidRunNow;
        await expect(dialog.locator("#action-time")).toHaveValue("10:00:00");
        await titleField.fill(title);

        let saveCalls = 0;
        let invokeCalls = 0;
        let releaseGate = null;
        const gatePromise = new Promise(resolve => { releaseGate = resolve; });
        let gateCaptured = false;
        const beforeRunNowRevision = action.revision;

        const actionRouteHandler = async route => {
          const req = route.request();
          if (req.method() === "POST") {
            if (req.url().endsWith("/api/actions")) {
              saveCalls += 1;
              gateCaptured = true;
              await gatePromise;
            } else if (req.url().includes("/invoke")) {
              invokeCalls += 1;
            }
          }
          await route.continue();
        };

        await candidate.route("**/api/actions**", actionRouteHandler);

        // Run now bypasses date validation, saves with planned_start: null, then attempts invoke
        const runNowBtn = dialog.locator('button[value="now"]');
        await expect(runNowBtn).toBeVisible();
        await expect(runNowBtn).toHaveText(/Run now/);
        const firstClick = runNowBtn.click();

        // Wait until gate is captured
        await expect.poll(() => gateCaptured).toBe(true);

        // Double activation check: button is immediately disabled and aria-busy while pending
        await expect(runNowBtn).toBeDisabled();
        await expect(runNowBtn).toHaveAttribute("aria-busy", "true");
        const pendingBeforeRelease = {
          requestHeld: gateCaptured,
          disabled: await runNowBtn.isDisabled(),
          ariaBusy: await runNowBtn.getAttribute("aria-busy"),
        };

        // Attempt second activation while first is pending
        await runNowBtn.click({ force: true }).catch(() => {});

        // Release gate and wait for settlement
        releaseGate();
        await firstClick;

        // Save succeeded, invoke failed because agent is unattached
        await expect(candidate.locator(".action-toast:not([data-ending-style])").filter({ hasText: "but its launch was not confirmed" })).toHaveCount(1);
        await expect(dialog.locator(".action-result")).toHaveCount(0); // single outcome: toast only

        await candidate.unroute("**/api/actions**", actionRouteHandler);

        assert.equal(saveCalls, 1, "Exactly one Save POST request made");
        assert.equal(invokeCalls, 1, "Exactly one Invoke POST request made");

        action = (await state()).actions.find(a => a.id === action.id);
        assert.equal(action.planned_start, null, "Run now saved with null planned start");
        assert.equal(action.status, "backlog");
        assert.equal(action.run_id, null, "Invoke failed without starting a run");
        assert.equal(action.revision, beforeRunNowRevision + 1, "Run now saves exactly one acknowledged revision");
        const runNow = {
          saveRequests: saveCalls,
          invokeRequests: invokeCalls,
          pendingGuardedBeforeRelease: gateCaptured,
          pendingBeforeRelease,
          missingTitleMutationRequests,
          revisionBefore: beforeRunNowRevision,
          savedRevision: action.revision,
          plannedStart: action.planned_start,
          status: action.status,
          runId: action.run_id,
        };

        // Refresh action list recovery button is visible; verify GET-only retry without repeating mutations
        const preRefreshMutations = mutations;
        const refreshBtn = dialog.getByRole("button", { name: "Refresh action list", exact: true });
        await expect(refreshBtn).toBeVisible();
        await refreshBtn.click();
        await expect(dialog).toHaveCount(0);
        assert.equal(mutations, preRefreshMutations, "Refresh action list sends zero POST or PUT mutations");
        const afterRefresh = (await state()).actions.find(item => item.id === action.id);
        assert.deepEqual(afterRefresh, action, "Read-only refresh retains the acknowledged action revision and values");
        const refresh = {
          mutationRequests: mutations - preRefreshMutations,
          retainedRevision: afterRefresh.revision,
          retainedStatus: afterRefresh.status,
          runId: afterRefresh.run_id,
        };

        // Persist in-flight states directly so lock checks never require provider work.
        const sqliteDbPath = path.join(org, ".state/app.sqlite3");
        for (const status of ["queued", "running"]) {
          const fixture = {
            id: crypto.randomUUID().replaceAll("-", ""),
            group_id: group.id,
            title: `${status} Action Fixture ${timeZone} ${suffix}`,
            body: "Persisted in-flight state; no execution run is started.",
            assignee_id: agent.id,
            planned_start: new Date(Date.now() + DAY).toISOString(),
            status,
            created_by: "owner",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            revision: 1,
            run_id: null,
            error: null,
          };
          const fixtureDb = new DatabaseSync(sqliteDbPath);
          try {
            fixtureDb.prepare("INSERT INTO action_items (id, data) VALUES (?, ?)").run(fixture.id, JSON.stringify(fixture));
          } finally {
            fixtureDb.close();
          }
          try {
            await candidate.goto(`${base}/groups/${group.id}/actions`);
            await expect(candidate.getByRole("button", { name: `Edit ${fixture.title}`, exact: true })).toBeDisabled();
            const persisted = (await state()).actions.find(item => item.id === fixture.id);
            assert.deepEqual(persisted, fixture, `The real backend reads the persisted ${status} fixture`);

            await candidate.getByRole("button", { name: fixture.title, exact: true }).click();
            const lockedDialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
            await expect(lockedDialog).toBeVisible();
            for (const selector of ["#action-group", "#action-title", "#action-body", "#action-pic", "#action-start", "#action-time", 'button[value="save"]', 'button[value="now"]']) {
              await expect(lockedDialog.locator(selector)).toBeDisabled();
            }
            await expect(lockedDialog.getByRole("button", { name: "Clear planned start", exact: true })).toBeDisabled();
            await expect(lockedDialog.locator("#action-time")).not.toHaveValue("");
            await expect(candidate.getByRole("dialog", { name: "Choose planned date", exact: true })).toHaveCount(0);

            const apiRejectRes = await request.post("/api/actions", {
              data: {
                id: fixture.id,
                revision: fixture.revision,
                group_id: fixture.group_id,
                title: fixture.title,
                body: fixture.body,
                assignee_id: fixture.assignee_id,
                planned_start: null,
              },
            });
            assert.equal(apiRejectRes.status(), 400);
            const rejectJson = await apiRejectRes.json();
            assert(
              rejectJson.error?.includes("Stop or wait for this action before editing"),
              `API rejects edit on ${status} action with its authoritative lock error`,
            );
            const retained = (await state()).actions.find(item => item.id === fixture.id);
            assert.deepEqual(retained, persisted, `Rejected ${status} edit retains all persisted values`);
            locks.push({
              fixtureId: fixture.id,
              fixtureSource: "Disposable SQLite row with no execution run",
              status: retained.status,
              revision: retained.revision,
              plannedStart: retained.planned_start,
              runId: retained.run_id,
              httpStatus: apiRejectRes.status(),
              error: rejectJson.error,
              titleOpenedEditor: true,
              disabledControls: ["group", "title", "body", "PIC", "date", "time", "clear", "save", "run now"],
            });
            await lockedDialog.getByRole("button", { name: "Close", exact: true }).click();
            await expect(lockedDialog).toHaveCount(0);
          } finally {
            const cleanupDb = new DatabaseSync(sqliteDbPath);
            try {
              cleanupDb.prepare("DELETE FROM action_items WHERE id = ?").run(fixture.id);
            } finally {
              cleanupDb.close();
            }
          }
        }
        await candidate.goto(`${base}/groups/${group.id}/actions`);

        // 9. Viewport responsiveness: 390x650 mobile viewport
        await candidate.setViewportSize({ width: 390, height: 650 });
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
        const startFieldMobile = dialog.locator("#action-start");
        await startFieldMobile.scrollIntoViewIfNeeded();
        await startFieldMobile.click(); // normal click without force
        popup = candidate.getByRole("dialog", { name: "Choose planned date", exact: true });
        await expect(popup).toBeVisible();

        let box = await popup.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= 390, "Planned date popup stays within mobile viewport");
        let mobileOverflow = await candidate.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert(!mobileOverflow, "No page horizontal overflow at 390px mobile viewport");

        // Verify date/time/clear/submit operable on mobile with normal clicks
        await popup.getByRole("button", { name: "Done", exact: true }).click(); // normal click
        await expect(popup).toHaveCount(0);
        const timeFieldMobile = dialog.locator("#action-time");
        await timeFieldMobile.scrollIntoViewIfNeeded();
        await timeFieldMobile.fill("09:15:00");
        const clearBtnMobile = dialog.getByRole("button", { name: "Clear planned start", exact: true });
        await clearBtnMobile.scrollIntoViewIfNeeded();
        await clearBtnMobile.click(); // normal click
        await expect(timeFieldMobile).toHaveValue("");
        const saveBtnMobile = dialog.getByRole("button", { name: "Save to backlog", exact: true });
        await saveBtnMobile.scrollIntoViewIfNeeded();
        await saveBtnMobile.click(); // normal click
        await expect(dialog).toHaveCount(0);
        const mobileSaved = (await state()).actions.find(item => item.id === action.id);
        assert.equal(mobileSaved.planned_start, null);
        assert.equal(mobileSaved.status, "backlog");
        layouts.push({
          name: "mobile",
          viewport: candidate.viewportSize(),
          popup: box,
          horizontalOverflow: mobileOverflow,
          savedRevision: mobileSaved.revision,
          controlsExercised: ["date", "Done", "time", "clear", "save"],
        });

        // 9b. Reduced-height viewport (1024x420)
        await candidate.setViewportSize({ width: 1024, height: 420 });
        await candidate.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
        const startFieldReduced = dialog.locator("#action-start");
        await startFieldReduced.scrollIntoViewIfNeeded();
        await startFieldReduced.click(); // normal click without force
        popup = candidate.getByRole("dialog", { name: "Choose planned date", exact: true });
        await expect(popup).toBeVisible();
        box = await popup.boundingBox();
        assert(box && box.height > 0 && box.x >= 0 && box.x + box.width <= 1024, "Planned date popup renders in reduced-height viewport");
        let reducedHeightOverflow = await candidate.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert(!reducedHeightOverflow, "No page horizontal overflow in reduced-height viewport");

        // Normal clicks on date/time/clear/submit in reduced-height viewport
        await popup.getByRole("button", { name: "Done", exact: true }).click(); // normal click
        await expect(popup).toHaveCount(0);
        const timeFieldReduced = dialog.locator("#action-time");
        await timeFieldReduced.scrollIntoViewIfNeeded();
        await timeFieldReduced.fill("10:20:30");
        const clearBtnReduced = dialog.getByRole("button", { name: "Clear planned start", exact: true });
        await clearBtnReduced.scrollIntoViewIfNeeded();
        await clearBtnReduced.click(); // normal click
        await expect(timeFieldReduced).toHaveValue("");
        const saveBtnReduced = dialog.getByRole("button", { name: "Save to backlog", exact: true });
        await saveBtnReduced.scrollIntoViewIfNeeded();
        await saveBtnReduced.click(); // normal click
        await expect(dialog).toHaveCount(0);
        const reducedHeightSaved = (await state()).actions.find(item => item.id === action.id);
        assert.equal(reducedHeightSaved.planned_start, null);
        assert.equal(reducedHeightSaved.status, "backlog");
        layouts.push({
          name: "reduced-height",
          viewport: candidate.viewportSize(),
          popup: box,
          horizontalOverflow: reducedHeightOverflow,
          savedRevision: reducedHeightSaved.revision,
          controlsExercised: ["date", "Done", "time", "clear", "save"],
        });

        // 9c. 200% layout zoom check using real browser layout zoom (Chromium profile preferences)
        const profileRoot = path.resolve(directory);
        const zoomProfile = await mkdtemp(path.join(profileRoot, "action-board-zoom-profile-"));
        let zoomContext = null;
        try {
          const zoomValue = Math.log(2) / Math.log(1.2);
          const host = new URL(base).host;
          const hostname = new URL(base).hostname;
          const hexDefault = Buffer.from("Default").toString("hex");
          const defaultZoomDict = {
            x: zoomValue,
            "": zoomValue,
            "0": zoomValue,
            [hexDefault]: zoomValue,
            ["x" + hexDefault]: zoomValue,
          };
          const perHostDict = {
            [host]: { zoom_level: zoomValue, last_modified: "13300000000000000" },
            [hostname]: { zoom_level: zoomValue, last_modified: "13300000000000000" },
            "localhost": { zoom_level: zoomValue, last_modified: "13300000000000000" },
            "127.0.0.1": { zoom_level: zoomValue, last_modified: "13300000000000000" },
          };
          const preferences = {
            partition: {
              default_zoom_level: defaultZoomDict,
              per_host_zoom_levels: {
                x: perHostDict,
                "": perHostDict,
                "0": perHostDict,
                [hexDefault]: perHostDict,
                ["x" + hexDefault]: perHostDict,
              },
            },
          };
          await mkdir(path.join(zoomProfile, "Default"), { recursive: true });
          await writeFile(path.join(zoomProfile, "Default", "Preferences"), JSON.stringify(preferences));
          await writeFile(path.join(zoomProfile, "Preferences"), JSON.stringify(preferences));
          zoomContext = await chromium.launchPersistentContext(zoomProfile, {
            baseURL: base,
            ...(process.env.AE_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AE_TEST_BROWSER_EXECUTABLE } : { channel: "msedge" }),
            headless: true,
            viewport: { width: 1440, height: 1000 },
            args: ["--window-size=1440,1000"],
          });
          await zoomContext.addCookies(await page.context().cookies(base));
          const zoomPage = zoomContext.pages()[0] ?? await zoomContext.newPage();
          try {
            const client = await zoomContext.newCDPSession(zoomPage);
            await client.send("Page.setZoomFactor", { zoomFactor: 2 });
          } catch {}

          await zoomPage.goto(`${base}/groups/${group.id}/actions`);
          const zoom = await zoomPage.evaluate(() => ({
            innerWidth,
            outerWidth,
            devicePixelRatio,
            visualViewportScale: visualViewport?.scale ?? null,
            cssZoom: getComputedStyle(document.documentElement).zoom,
          }));
          assert(zoom.devicePixelRatio >= 1.9 && zoom.devicePixelRatio <= 2.1, `Native 200% browser zoom must produce DPR near 2; actual ${JSON.stringify(zoom)}`);
          assert(zoom.innerWidth >= 690 && zoom.innerWidth <= 750, "Native browser zoom must halve viewport");
          assert(zoom.visualViewportScale === 1 && ["1", "normal"].includes(zoom.cssZoom), "Real layout zoom, not CSS zoom or pinch");

          await zoomPage.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
          const zoomDialog = zoomPage.getByRole("dialog", { name: "Edit action", exact: true });
          await expect(zoomDialog).toBeVisible();

          const startFieldZoom = zoomDialog.locator("#action-start");
          await startFieldZoom.scrollIntoViewIfNeeded();
          await startFieldZoom.click(); // normal click without force
          const zoomPopup = zoomPage.getByRole("dialog", { name: "Choose planned date", exact: true });
          await expect(zoomPopup).toBeVisible();

          const zoomBox = await zoomPopup.boundingBox();
          assert(zoomBox && zoomBox.x >= 0 && zoomBox.x + zoomBox.width <= zoom.innerWidth + 2, "Popup fits inside zoomed viewport");
          const zoomOverflow = await zoomPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          assert(!zoomOverflow, "No horizontal overflow under 200% zoom");

          // Operable date/time/clear/submit under 200% zoom with normal clicks
          await zoomPopup.getByRole("button", { name: "Done", exact: true }).click(); // normal click
          await expect(zoomPopup).toHaveCount(0);

          const timeFieldZoom = zoomDialog.locator("#action-time");
          await timeFieldZoom.scrollIntoViewIfNeeded();
          await timeFieldZoom.fill("11:22:33");

          const zoomClearBtn = zoomDialog.getByRole("button", { name: "Clear planned start", exact: true });
          await zoomClearBtn.scrollIntoViewIfNeeded();
          await zoomClearBtn.click(); // normal click
          await expect(timeFieldZoom).toHaveValue("");

          const zoomSaveBtn = zoomDialog.getByRole("button", { name: "Save to backlog", exact: true });
          await zoomSaveBtn.scrollIntoViewIfNeeded();
          await zoomSaveBtn.click(); // normal click
          await expect(zoomDialog).toHaveCount(0);
          const zoomSaved = (await state()).actions.find(item => item.id === action.id);
          assert.equal(zoomSaved.planned_start, null);
          assert.equal(zoomSaved.status, "backlog");
          nativeZoom = {
            factor: 2,
            metrics: zoom,
            popup: zoomBox,
            horizontalOverflow: zoomOverflow,
            savedRevision: zoomSaved.revision,
            controlsExercised: ["date", "Done", "time", "clear", "save"],
          };

          await zoomPage.screenshot({ path: path.join(directory, `action-board-calendar-zoom-200-${timeZone.replaceAll("/", "-")}.png`) });
        } finally {
          if (zoomContext) await zoomContext.close();
          await rm(zoomProfile, { recursive: true, force: true }).catch(() => {});
        }

        const screenshotPath = path.join(directory, `action-board-calendar-${timeZone.replaceAll("/", "-")}.png`);
        await candidate.screenshot({ path: screenshotPath });

        if (await dialog.isVisible()) {
          await candidate.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
        }

        const finalAction = (await state()).actions.find(item => item.id === action.id);
        receipt.timezones.push({
          timeZone,
          id: action.id,
          local,
          storedInstant: expectedInstant,
          leapLocal,
          exactDatePreserved: expectedDateEditInstant,
          exactTimePreserved: expectedTimeEditInstant,
          unattachedInvokeFailedRetainingSave: true,
          seconds: true,
          backlogRevision,
          runNow,
          refresh,
          locks,
          layouts,
          nativeZoom,
          finalAction: {
            revision: finalAction.revision,
            status: finalAction.status,
            plannedStart: finalAction.planned_start,
            runId: finalAction.run_id,
          },
        });
        assert.deepEqual(errors, [], "No browser JavaScript errors");
      } finally {
        await context.close();
      }
    }

    // 10. DST transition in America/Los_Angeles
    const springYear = new Date().getFullYear() + 1;
    const secondSunday = new Date(Date.UTC(springYear, 2, 1));
    secondSunday.setUTCDate(1 + ((7 - secondSunday.getUTCDay()) % 7) + 7);
    const springDay = secondSunday.toISOString().slice(0, 10);

    const fall = new Date(Date.UTC(springYear, 10, 1));
    fall.setUTCDate(1 + ((7 - fall.getUTCDay()) % 7));
    const fallDay = fall.toISOString().slice(0, 10);
    const repeatedInstant = `${fallDay}T09:30:43.000Z`;

    // Create action during repeated local hour
    const dstAction = await call("/actions", {
      id: crypto.randomUUID(),
      revision: 0,
      group_id: group.id,
      title: `DST Action ${suffix}`,
      body: "DST verification",
      assignee_id: agent.id,
      planned_start: repeatedInstant,
    });
    createdActions.add(dstAction.id);

    const context = await browser.newContext({ baseURL: base, storageState: auth, timezoneId: "America/Los_Angeles" });
    try {
      const candidate = await context.newPage();
      await candidate.goto(`${base}/groups/${group.id}/actions`);

      await candidate.getByRole("button", { name: `Edit ${dstAction.title}`, exact: true }).click();
      const dialog = candidate.getByRole("dialog", { name: "Edit action", exact: true });
      await expect(dialog.locator("#action-time")).toHaveValue("01:30:43");

      // Save unchanged preserves the exact original second occurrence instant
      await dialog.getByRole("button", { name: "Schedule action", exact: true }).click();
      await expect(dialog).toHaveCount(0);

      const retained = (await state()).actions.find(a => a.id === dstAction.id);
      assert.equal(new Date(retained.planned_start).toISOString(), repeatedInstant, "Repeated-hour editing preserves original second occurrence");

      // Spring gap: 2:30 AM does not exist
      await candidate.getByRole("button", { name: `Edit ${dstAction.title}`, exact: true }).click();
      const gapLocal = `${springDay}T02:30:43`;
      await fillActionDateTime(candidate, gapLocal);
      await candidate.getByRole("dialog", { name: "Edit action", exact: true }).getByRole("button", { name: "Schedule action", exact: true }).click();
      await expect(candidate.locator(".schedule-error")).toContainText("does not exist because the clocks change");

      receipt.dst = { rejectedGap: gapLocal, repeatedInstantPreserved: repeatedInstant };
    } finally {
      await context.close();
    }

    // 11. Real backend authoritative bounds check
    const backendRejection = await request.post("/api/actions", {
      data: {
        id: crypto.randomUUID(),
        revision: 0,
        group_id: group.id,
        title: "Backend upper bound",
        body: "Out of window",
        assignee_id: agent.id,
        planned_start: new Date(Date.now() + 3651 * DAY).toISOString(),
      },
    });
    assert(backendRejection.status() >= 400, "Backend remains authoritative for its future window");

    // 12. Verify zero provider runs were started
    assert(!(await state()).runs.some(run => !initialRuns.has(run.id)), "Action board calendar verification starts no provider task");

    await writeFile(path.join(directory, "action-board-calendar.json"), JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    for (const id of createdActions) {
      if ((await state()).actions.some(a => a.id === id)) {
        try { await call(`/actions/${id}/cancel`, undefined, "POST"); } catch {}
        try { await call(`/actions/${id}`, undefined, "DELETE"); } catch {}
      }
    }
    if ((await state()).groups.some(g => g.id === group.id && !g.archived_at)) {
      await call(`/groups/${group.id}/archive`, undefined, "POST");
    }
  }
}
