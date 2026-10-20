import assert from "node:assert/strict";
import { expect as playwrightExpect } from "@playwright/test";

const expect = playwrightExpect.configure({ timeout: 30000 });

export async function readValue(control) {
  await expect(control).toBeVisible();
  assert((await control.innerText()).trim(), "The picker must show its selected label");
  const value = await control.getAttribute("data-value");
  assert.notEqual(value, null, "The visible picker must identify its current choice");
  return value;
}

export async function expectValue(control, value, label) {
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("data-value", value);
  await expect(control).not.toHaveText("");
  if (label !== undefined) await expect(control).toContainText(label);
}

export async function openPicker(control) {
  await expect(control).toBeEnabled();
  if ((await control.getAttribute("aria-expanded")) !== "true") await control.click();
  await expect(control).toHaveAttribute("aria-expanded", "true");
  const popupId = await control.getAttribute("aria-controls");
  assert(popupId, "The trigger must expose the active popup to assistive technology");
  return control.page().locator(`[id=${JSON.stringify(popupId)}]`);
}

export async function selectValue(control, value) {
  const popup = await openPicker(control);
  const option = popup.getByRole("option").and(control.page().locator(`[data-value=${JSON.stringify(value)}]`));
  await expect(option).toBeVisible();
  await expect(option).toBeEnabled();
  const label = (await option.locator(".value-picker-item-label").innerText()).trim();
  assert(label, "The chosen option must show its real label");
  const search = popup.locator('[data-slot="combobox-input"]');
  if (await search.count()) {
    await search.fill(label);
    await expect(option).toBeVisible();
  }
  await option.click();
  await expect(popup).toBeHidden();
  await expectValue(control, value, label);
}

export async function readOptions(control) {
  const popup = await openPicker(control);
  const options = await popup.getByRole("option").evaluateAll(elements => elements.map(element => {
    const group = element.closest('[role="group"]');
    const groupLabelId = group?.getAttribute("aria-labelledby");
    return {
      value: element.getAttribute("data-value"),
      label: element.querySelector(".value-picker-item-label")?.textContent?.trim() ?? "",
      disabled: element.getAttribute("aria-disabled") === "true" || element.hasAttribute("data-disabled"),
      selected: element.getAttribute("aria-selected") === "true" || element.hasAttribute("data-selected"),
      group: (groupLabelId && document.getElementById(groupLabelId)?.textContent?.trim()) || "direct",
    };
  }));
  await control.page().keyboard.press("Escape");
  await expect(popup).toBeHidden();
  return options;
}
