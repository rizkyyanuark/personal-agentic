import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });
const DAY = 24 * 60 * 60 * 1000;

export async function fillScheduleDateTime(page, local, { chooseDay = false } = {}) {
  const [date, time] = local.split("T");
  assert(date && time, "Supply an explicit local date and time");
  await page.locator("#task-start").click();
  const popup = page.getByRole("dialog", { name: "Choose send date", exact: true });
  await expect(popup).toBeVisible();
  await popup.getByLabel("Date (YYYY-MM-DD)", { exact: true }).fill(date);
  if (chooseDay) await popup.locator(`button[data-day="${date}"]`).first().click();
  else await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await page.locator("#task-time").fill(time);
}

export async function verifyScheduleCalendar({ page, request, call, state, until, org, base, directory }) {
  const target = new URL(base);
  assert.equal(process.env.AE_TEST_DISPOSABLE, "true", "Use a disposable local organization");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Calendar tests require a loopback candidate");
  assert(process.env.AE_TEST_ORG && path.resolve(org) !== path.resolve("../../org"), "Use an explicitly separate organization");
  const suffix = crypto.randomUUID().slice(0, 8);
  const group = await call("/groups", { id: "", name: `Calendar ${suffix}`, description: "Disposable future-only calendar verification" });
  const initialRuns = new Set((await state()).runs.map(run => run.id));
  const created = new Set();
  const receipt = { groupId: group.id, timezones: [], providerTasks: 0 };
  const browser = page.context().browser();
  assert(browser, "A real browser is required");
  const auth = await page.context().storageState();
  const year = new Date().getFullYear() + 2;
  const todayLocal = async candidate => candidate.evaluate(() => {
    const date = new Date();
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
  const inputFor = name => ({ name, body: "Future-only metadata verification. No agent is requested.", repeat_minutes: null });
  try {
    for (const timeZone of ["Asia/Jakarta", "America/Los_Angeles"]) {
      const context = await browser.newContext({ baseURL: base, storageState: auth, timezoneId: timeZone, viewport: { width: 1280, height: 900 } });
      const candidate = await context.newPage();
      const errors = [];
      candidate.on("pageerror", error => errors.push(error.message));
      const requests = [];
      let mutations = 0;
      candidate.on("request", value => {
        if (["POST", "PUT"].includes(value.method()) && /\/api\/(?:groups\/[^/]+\/)?schedules(?:\/|$)/.test(value.url())) mutations += 1;
        if (value.method() === "POST" && value.url().endsWith(`/api/groups/${group.id}/schedules`)) requests.push(value.postDataJSON());
      });
      try {
        await candidate.goto(`${base}/groups/${group.id}/scheduled-tasks`);
        await expect(candidate.getByRole("heading", { name: "Scheduled tasks", exact: true })).toBeVisible();
        await candidate.getByRole("button", { name: "New task", exact: true }).click();
        let dialog = candidate.getByRole("dialog", { name: "New scheduled task", exact: true });
        const name = `Calendar ${timeZone} ${suffix}`;
        await dialog.getByLabel("Name", { exact: true }).fill(name);
        await dialog.getByLabel("Custom message", { exact: true }).fill(inputFor(name).body);
        await expect(dialog.locator("#task-timezone")).toContainText(timeZone);
        const local = `${year}-01-01T00:15:37`;
        await fillScheduleDateTime(candidate, local, { chooseDay: true });
        await expect(dialog.locator("#task-time")).toHaveValue("00:15:37");
        await dialog.locator("#task-start").focus();
        await candidate.keyboard.press("Enter");
        await expect(candidate.getByRole("dialog", { name: "Choose send date", exact: true })).toBeVisible();
        await candidate.keyboard.press("Escape");
        await expect(candidate.getByRole("dialog", { name: "Choose send date", exact: true })).toHaveCount(0);
        await expect(dialog).toBeVisible();
        await expect(dialog.locator("#task-start")).toBeFocused();
        assert.equal(requests.length, 0, "Calendar navigation and dismissal cannot submit the form");
        await dialog.locator("#task-start").click();
        await candidate.locator('.schedule-calendar-day-button[data-selected-single="true"]').focus();
        await candidate.keyboard.press("ArrowRight");
        await candidate.keyboard.press("Enter");
        await expect(candidate.getByRole("dialog", { name: "Choose send date", exact: true })).toHaveCount(0);
        await expect(dialog.locator("#task-time")).toHaveValue("00:15:37");
        assert.equal(mutations, 0, "Keyboard calendar selection cannot submit the form");
        await fillScheduleDateTime(candidate, local);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        const saved = await until(async () => (await state()).schedules.find(value => value.name === name), 15000);
        created.add(saved.id);
        const expectedInstant = await candidate.evaluate(value => new Date(value).toISOString(), local);
        assert.equal(new Date(saved.start_at).toISOString(), expectedInstant);
        assert.equal(requests.length, 1, "Exactly one real create mutation");
        assert.equal(requests[0].start_at, expectedInstant);
        assert.equal(saved.repeat_minutes, null);
        assert.equal(saved.last_sent_at, null);
        const card = candidate.getByRole("article", { name, exact: true });
        await card.getByRole("button", { name: "Pause", exact: true }).click();
        await expect(card).toContainText("Paused");
        await card.getByRole("button", { name: "Edit", exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit scheduled task", exact: true });
        await expect(dialog.locator("#task-time")).toHaveValue("00:15:37");
        await dialog.locator("#task-start").click();
        let popup = candidate.getByRole("dialog", { name: "Choose send date", exact: true });
        await expect(popup.getByLabel("Date (YYYY-MM-DD)", { exact: true })).toHaveValue(`${year}-01-01`);
        await popup.getByRole("button", { name: "Done", exact: true }).click();
        await dialog.getByLabel("Name", { exact: true }).fill(`${name} edited`);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        let edited = (await state()).schedules.find(value => value.id === saved.id);
        assert.equal(new Date(edited.start_at).toISOString(), expectedInstant);
        assert.equal(edited.enabled, false, "Editing a paused schedule keeps it paused");

        await candidate.getByRole("article", { name: `${name} edited`, exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit scheduled task", exact: true });
        await fillScheduleDateTime(candidate, `${year}-02-30T12:00:00`);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("complete date and time");
        assert.equal(new Date((await state()).schedules.find(value => value.id === saved.id).start_at).toISOString(), expectedInstant);
        const upper = await candidate.evaluate(() => {
          const date = new Date(Date.now() + 3651 * 24 * 60 * 60 * 1000);
          const pad = value => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T12:00:00`;
        });
        await fillScheduleDateTime(candidate, upper);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("within ten years");
        const today = await todayLocal(candidate);
        await fillScheduleDateTime(candidate, `${today}T00:00:00`);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("future date and time");

        const nextLeap = Array.from({ length: 10 }, (_, offset) => new Date().getFullYear() + offset + 1).find(value => value % 4 === 0 && (value % 100 !== 0 || value % 400 === 0));
        assert(nextLeap, "A leap year exists inside the scheduling window");
        const leapLocal = `${nextLeap}-02-29T23:45:19`;
        await fillScheduleDateTime(candidate, leapLocal, { chooseDay: true });
        await dialog.getByLabel("Custom message", { exact: true }).fill(" ");
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog.locator(".action-result")).toHaveCount(0);
        await expect(dialog.locator("#task-time")).toHaveValue("23:45:19");
        const rejection = candidate.locator(".action-toast:not([data-ending-style])").filter({ hasText: "Schedule save not confirmed" });
        await expect(rejection).toHaveCount(1);
        await rejection.getByRole("button", { name: "Dismiss notification", exact: true }).click();
        await expect(rejection).toHaveCount(0);
        await dialog.locator("#task-start").click();
        popup = candidate.getByRole("dialog", { name: "Choose send date", exact: true });
        await expect(popup.getByLabel("Date (YYYY-MM-DD)", { exact: true })).toHaveValue(`${nextLeap}-02-29`);
        await popup.getByRole("button", { name: "Done", exact: true }).click();
        await dialog.getByLabel("Custom message", { exact: true }).fill(inputFor(name).body);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        edited = (await state()).schedules.find(value => value.id === saved.id);
        assert.equal(new Date(edited.start_at).toISOString(), await candidate.evaluate(value => new Date(value).toISOString(), leapLocal));
        assert.equal(edited.enabled, false);

        await candidate.getByRole("article", { name: `${name} edited`, exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
        dialog = candidate.getByRole("dialog", { name: "Edit scheduled task", exact: true });
        const beforeMissing = mutations;
        await dialog.locator("#task-time").fill("");
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog.locator("#task-time")).toBeFocused();
        assert.equal(mutations, beforeMissing, "Incomplete time cannot submit a request");
        const fixtureNow = await candidate.evaluate(value => new Date(`${value}-06-01T12:00:00`).getTime(), year);
        await candidate.clock.setFixedTime(new Date(fixtureNow));
        const exactUpper = await candidate.evaluate(() => {
          const date = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
          const pad = value => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        });
        await fillScheduleDateTime(candidate, exactUpper);
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog.locator(".schedule-error")).toContainText("within ten years");
        assert.equal(mutations, beforeMissing, "Exact upper bound is rejected before a request");
        const clockToday = await todayLocal(candidate);
        const futureToday = `${clockToday}T12:00:01`;
        await fillScheduleDateTime(candidate, futureToday, { chooseDay: true });
        await dialog.getByRole("button", { name: "Save task", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        edited = (await state()).schedules.find(value => value.id === saved.id);
        assert.equal(new Date(edited.start_at).toISOString(), await candidate.evaluate(value => new Date(value).toISOString(), futureToday));
        assert.equal(edited.enabled, false);

        await candidate.setViewportSize({ width: 390, height: 650 });
        await candidate.getByRole("article", { name: `${name} edited`, exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
        await candidate.locator("#task-start").click();
        popup = candidate.getByRole("dialog", { name: "Choose send date", exact: true });
        await expect(popup).toBeVisible();
        const box = await popup.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= 390, "Calendar stays within mobile viewport");
        await candidate.screenshot({ path: path.join(directory, `schedule-calendar-${timeZone.replaceAll("/", "-")}.png`) });
        await candidate.keyboard.press("Escape");
        await candidate.getByRole("dialog", { name: "Edit scheduled task", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
        receipt.timezones.push({ timeZone, id: saved.id, local, storedInstant: expectedInstant, leapLocal, futureToday, exactWindowRejected: true, clockFixture: "Browser Date fixed to a future day; real API and scheduler retain their real clock", pausedPreserved: true, realApiFailureRetainedDraft: true, seconds: true });
        assert.deepEqual(errors, [], "No browser JavaScript errors");
      } finally {
        await context.close();
      }
    }

    const springYear = new Date().getFullYear() + 1;
    const secondSunday = new Date(Date.UTC(springYear, 2, 1));
    secondSunday.setUTCDate(1 + ((7 - secondSunday.getUTCDay()) % 7) + 7);
    const springDay = secondSunday.toISOString().slice(0, 10);
    const fall = new Date(Date.UTC(springYear, 10, 1));
    fall.setUTCDate(1 + ((7 - fall.getUTCDay()) % 7));
    const fallDay = fall.toISOString().slice(0, 10);
    const repeatedInstant = `${fallDay}T09:30:43.000Z`;
    const repeatTask = await call(`/groups/${group.id}/schedules`, { ...inputFor(`DST ${suffix}`), start_at: repeatedInstant, repeat_minutes: 37 });
    created.add(repeatTask.id);
    await call(`/schedules/${repeatTask.id}/enabled`, { enabled: false }, "PUT");
    const context = await browser.newContext({ baseURL: base, storageState: auth, timezoneId: "America/Los_Angeles" });
    try {
      const candidate = await context.newPage();
      await candidate.goto(`${base}/groups/${group.id}/scheduled-tasks`);
      await candidate.getByRole("article", { name: repeatTask.name, exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
      const dialog = candidate.getByRole("dialog", { name: "Edit scheduled task", exact: true });
      await expect(dialog.locator("#task-time")).toHaveValue("01:30:43");
      await dialog.getByRole("button", { name: "Save task", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const retained = (await state()).schedules.find(value => value.id === repeatTask.id);
      assert.equal(new Date(retained.start_at).toISOString(), repeatedInstant, "Repeated-hour editing preserves the original second occurrence");
      assert.equal(retained.repeat_minutes, 37);
      assert.equal(retained.enabled, false);
      await candidate.getByRole("article", { name: repeatTask.name, exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
      await fillScheduleDateTime(candidate, `${springDay}T02:30:43`);
      await candidate.getByRole("dialog", { name: "Edit scheduled task", exact: true }).getByRole("button", { name: "Save task", exact: true }).click();
      await expect(candidate.locator(".schedule-error")).toContainText("does not exist because the clocks change");
      receipt.dst = { rejectedGap: `${springDay}T02:30:43`, repeatedInstantPreserved: repeatedInstant, customRepeat: 37, paused: true };
    } finally {
      await context.close();
    }
    const rejected = await request.post(`/api/groups/${group.id}/schedules`, { data: { ...inputFor("Backend upper bound"), start_at: new Date(Date.now() + 3651 * DAY).toISOString() } });
    assert(rejected.status() >= 400, "Real backend remains authoritative for its future window");
    assert(!(await state()).runs.some(run => !initialRuns.has(run.id)), "Future-only calendar verification starts no provider task");
    await writeFile(path.join(directory, "schedule-calendar.json"), JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    for (const id of created) {
      if ((await state()).schedules.some(value => value.id === id)) await call(`/schedules/${id}`, undefined, "DELETE");
    }
    if ((await state()).groups.some(value => value.id === group.id && !value.archived_at)) await call(`/groups/${group.id}/archive`, undefined, "POST");
  }
}
