import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import {
  DESK_CONFIGS,
  CHARACTER_CONFIGS,
  ROOM_LAYOUT
} from '../../src/client/scene/office-layout.js';
import {
  getHomeCameraView,
  getRoomCenterCameraView,
  getWorkstationCameraView
} from '../../src/client/scene/camera-views.js';
import { allocateCharacterSeats } from '../../src/client/scene/seat-registry.js';
import { OFFICE_ROLES } from '../../src/shared/office-contract.js';
import { createTextEnlargementFixture } from '../helpers/text-enlargement.mjs';
import { installMotionObserver, runMotionRegression } from './motion.mjs';

const origin = process.env.COCKPIT_URL || 'http://127.0.0.1:8095';
const viewportMatrix = [
  { name: 'mobile-320', width: 320, height: 760 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 }
];
function selectViewports(filter) {
  if (filter === undefined) return viewportMatrix;
  const names = filter.split(',').map((name) => name.trim());
  const allowed = viewportMatrix.map(({ name }) => name);
  if (names.some((name) => name.length === 0)) {
    throw new Error(
      `COCKPIT_VIEWPORTS requires comma-separated viewport names without empty items. Allowed: ${allowed.join(', ')}`
    );
  }
  const requested = new Set(names);
  const invalid = [...requested].filter((name) => !allowed.includes(name));
  if (invalid.length) {
    throw new Error(
      `Unknown COCKPIT_VIEWPORTS names: ${invalid.join(', ')}. Allowed: ${allowed.join(', ')}`
    );
  }
  return viewportMatrix.filter(({ name }) => requested.has(name));
}
const viewports = selectViewports(process.env.COCKPIT_VIEWPORTS);
const workstationKeys = DESK_CONFIGS.map(({ key }) => key).sort();
const roleKeys = CHARACTER_CONFIGS.map(({ key }) => key).sort();
const cameraTolerance = 0.03;

function assertVector(actual, expected, description) {
  assert.equal(actual.length, expected.length, description);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) < cameraTolerance,
      `${description}: coordinate ${index}, ${value} != ${expected[index]}`
    );
  });
}

async function readCharacterAnchors(page) {
  return page.evaluate(() =>
    Object.entries(window.__characters).map(([key, entity]) => ({
      key,
      position: entity.root.position.toArray(),
      heading: entity.root.rotation.y
    }))
  );
}

function assertFrozenCharacterAnchors(actual, expected, description) {
  assert.deepEqual(
    actual.map(({ key }) => key).sort(),
    expected.map(({ key }) => key).sort(),
    `${description}: character identities unchanged`
  );
  for (const anchor of expected) {
    const character = actual.find(({ key }) => key === anchor.key);
    assertVector(character.position, anchor.position, `${description}: ${anchor.key} position`);
    const angle = Math.atan2(
      Math.sin(character.heading - anchor.heading),
      Math.cos(character.heading - anchor.heading)
    );
    assert.ok(Math.abs(angle) < 0.001, `${description}: ${anchor.key} heading unchanged`);
  }
}

async function cameraViewFor(page, roleKey = null) {
  const { aspect, fov } = await page.evaluate(() => ({
    aspect: window.__camera.aspect,
    fov: window.__camera.fov
  }));
  const view = !roleKey
    ? getHomeCameraView(aspect, fov)
    : roleKey === 'hq_lab_director'
      ? getRoomCenterCameraView(aspect, fov)
      : getWorkstationCameraView(roleKey, aspect, fov);
  return { position: view.position.toArray(), target: view.target.toArray() };
}

async function waitForCamera(page, expected, description) {
  await page.waitForFunction(
    ({ position, target, tolerance }) => {
      const camera = window.__camera;
      const controls = window.__controls;
      if (!camera || !controls) return false;
      return (
        camera.position
          .toArray()
          .every((value, index) => Math.abs(value - position[index]) < tolerance) &&
        controls.target
          .toArray()
          .every((value, index) => Math.abs(value - target[index]) < tolerance)
      );
    },
    { polling: 100, timeout: 10000 },
    { ...expected, tolerance: cameraTolerance }
  );
  const actual = await page.evaluate(() => ({
    position: window.__camera.position.toArray(),
    target: window.__controls.target.toArray()
  }));
  assertVector(actual.position, expected.position, `${description}: position`);
  assertVector(actual.target, expected.target, `${description}: target`);
  return actual;
}

async function assertDpr(page, expected, description) {
  const viewport = page.viewport();
  const waitBudgetMs = expected > 1 ? 60000 : 10000;
  const readMetrics = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('#scene canvas');
      const host = document.getElementById('scene');
      const rect = canvas.getBoundingClientRect();
      return {
        devicePixelRatio: window.devicePixelRatio,
        rendererPixelRatio: window.__renderer.getPixelRatio(),
        diagnosticPixelRatio: Number(canvas.dataset.pixelRatio),
        viewport: [innerWidth, innerHeight],
        buffer: [canvas.width, canvas.height],
        css: [rect.width, rect.height],
        host: [host.clientWidth, host.clientHeight],
        cameraAspect: window.__camera.aspect,
        contextLost: window.__renderer.getContext().isContextLost()
      };
    });
  try {
    await page.waitForFunction(
      (ratio, width, height) => {
        const canvas = document.querySelector('#scene canvas');
        const host = document.getElementById('scene');
        return (
          innerWidth === width &&
          innerHeight === height &&
          devicePixelRatio === ratio &&
          window.__renderer.getPixelRatio() === ratio &&
          Number(canvas?.dataset.pixelRatio) === ratio &&
          Math.abs(canvas.width - host.clientWidth * ratio) <= 1 &&
          Math.abs(canvas.height - host.clientHeight * ratio) <= 1 &&
          Math.abs(window.__camera.aspect - host.clientWidth / host.clientHeight) < 0.001
        );
      },
      { polling: 100, timeout: waitBudgetMs },
      expected,
      viewport.width,
      viewport.height
    );
  } catch (error) {
    console.error(`${description}: DPR verification failed`, {
      expected: { ratio: expected, viewport: [viewport.width, viewport.height] },
      actual: await readMetrics()
    });
    throw error;
  }
  const actual = await readMetrics();
  assert.deepEqual(actual.viewport, [viewport.width, viewport.height], `${description}: viewport`);
  assert.equal(actual.devicePixelRatio, expected, `${description}: native DPR`);
  assert.equal(actual.rendererPixelRatio, expected, `${description}: renderer DPR`);
  assert.equal(actual.diagnosticPixelRatio, expected, `${description}: diagnostic DPR`);
  actual.buffer.forEach((size, index) => {
    assert.ok(
      Math.abs(size - actual.host[index] * expected) <= 1,
      `${description}: buffer coordinate ${index}`
    );
    assert.ok(
      Math.abs(size / actual.css[index] - expected) < 0.01,
      `${description}: actual buffer/CSS ratio ${index}`
    );
  });
  assert.ok(
    Math.abs(actual.cameraAspect - actual.host[0] / actual.host[1]) < 0.001,
    `${description}: resized camera aspect`
  );
}

async function assertHeaderText(page, description) {
  const overflow = await page.evaluate(() => {
    const failures = [];
    for (const button of document.querySelectorAll('.header-actions .control-button')) {
      const bounds = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      if (
        button.hidden ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        bounds.width === 0 ||
        bounds.height === 0
      )
        continue;
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent;
        const start = text.search(/\S/);
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, text.trimEnd().length);
        for (const rect of range.getClientRects()) {
          if (
            rect.left < bounds.left - 1 ||
            rect.right > bounds.right + 1 ||
            rect.top < bounds.top - 1 ||
            rect.bottom > bounds.bottom + 1
          ) {
            failures.push({
              id: button.id,
              text: text.trim(),
              textBounds: [rect.left, rect.top, rect.right, rect.bottom],
              buttonBounds: [bounds.left, bounds.top, bounds.right, bounds.bottom]
            });
          }
        }
      }
    }
    return failures;
  });
  assert.deepEqual(overflow, [], `${description}: header action text stays inside button bounds`);
}

async function assertTabAndMetricText(page, description) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  const result = await page.evaluate(() => {
    const inside = (rect, bounds) =>
      rect.left >= bounds.left - 1 &&
      rect.right <= bounds.right + 1 &&
      rect.top >= bounds.top - 1 &&
      rect.bottom <= bounds.bottom + 1;
    const overlaps = (first, second) =>
      Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1 &&
      Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1;
    const coordinates = (rect) => [rect.left, rect.top, rect.right, rect.bottom];
    const rendered = (element) => {
      const rect = element.getBoundingClientRect();
      if (element.closest('[hidden]') || rect.width === 0 || rect.height === 0) return false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0
        )
          return false;
      }
      return true;
    };
    const textRects = (element) => {
      const entries = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent;
        const start = text.search(/\S/);
        if (start < 0 || !rendered(node.parentElement)) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, text.trimEnd().length);
        const fieldBounds = node.parentElement.getBoundingClientRect();
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) {
            entries.push({ text: text.trim(), rect, fieldBounds });
          }
        }
      }
      return entries;
    };
    const tabs = [...document.querySelectorAll('#statusPanel [role="tab"]')]
      .filter(rendered)
      .map((button) => ({
        id: button.id,
        bounds: button.getBoundingClientRect(),
        text: textRects(button)
      }));
    const metrics = [...document.querySelectorAll('.metrics .metric')]
      .filter(rendered)
      .map((metric, index) => ({
        id: metric.id || `metric-${index}`,
        bounds: metric.getBoundingClientRect(),
        cardBounds: metric.closest('.metrics').getBoundingClientRect(),
        text: textRects(metric)
      }));
    const tabFailures = [];
    const metricFailures = [];
    for (const [entries, failures] of [
      [tabs, tabFailures],
      [metrics, metricFailures]
    ]) {
      for (const entry of entries) {
        if (entry.text.length === 0) failures.push({ id: entry.id, reason: 'No rendered text' });
        if (entry.cardBounds && !inside(entry.bounds, entry.cardBounds)) {
          failures.push({
            id: entry.id,
            reason: 'Metric outside its card',
            bounds: coordinates(entry.bounds),
            cardBounds: coordinates(entry.cardBounds)
          });
        }
        for (const text of entry.text) {
          if (
            !inside(text.rect, entry.bounds) ||
            (entry.cardBounds &&
              (!inside(text.rect, entry.cardBounds) || !inside(text.rect, text.fieldBounds)))
          ) {
            failures.push({
              id: entry.id,
              reason: 'Text outside its container',
              text: text.text,
              textBounds: coordinates(text.rect),
              bounds: coordinates(entry.bounds),
              fieldBounds: coordinates(text.fieldBounds)
            });
          }
          for (const neighbor of entries) {
            if (neighbor === entry) continue;
            if (entry.cardBounds && overlaps(text.rect, neighbor.bounds)) {
              failures.push({
                id: entry.id,
                neighbor: neighbor.id,
                reason: 'Text overlaps neighboring metric cell',
                text: text.text,
                textBounds: coordinates(text.rect),
                neighborBounds: coordinates(neighbor.bounds)
              });
            }
          }
        }
      }
      const text = entries.flatMap((entry) =>
        entry.text.map((fragment) => ({ ...fragment, id: entry.id }))
      );
      for (let first = 0; first < text.length; first += 1) {
        for (let second = first + 1; second < text.length; second += 1) {
          if (overlaps(text[first].rect, text[second].rect)) {
            failures.push({
              reason: 'Text fragments overlap',
              first: { id: text[first].id, text: text[first].text },
              second: { id: text[second].id, text: text[second].text }
            });
          }
        }
      }
    }
    const headerBottom = document.querySelector('.top-bar').getBoundingClientRect().bottom;
    const panelGaps =
      innerWidth > 820
        ? [...document.querySelectorAll('.side-panel')].filter(rendered).map((panel) => ({
            id: panel.id || panel.className,
            gap: panel.getBoundingClientRect().top - headerBottom
          }))
        : [];
    return { tabs: tabs.length, metrics: metrics.length, tabFailures, metricFailures, panelGaps };
  });
  assert.ok(result.tabs >= 2, `${description}: visible tabs measured`);
  assert.ok(result.metrics >= 3, `${description}: visible metric cells measured`);
  assert.deepEqual(
    result.tabFailures,
    [],
    `${description}: tab labels and count badges stay in their buttons without text overlap`
  );
  assert.deepEqual(
    result.metricFailures,
    [],
    `${description}: metric labels and values stay in their cells without neighboring overlap`
  );
  for (const panel of result.panelGaps) {
    assert.ok(
      panel.gap >= 7,
      `${description}: ${panel.id} leaves at least 8px below the header (1px tolerance), actual ${panel.gap}px`
    );
  }
}

async function assertTabChevron(page, description) {
  const actual = await page.evaluate(() => {
    const button = document.getElementById('btnMinRight');
    const bounds = button.getBoundingClientRect();
    const header = button.closest('.panel-header').getBoundingClientRect();
    const tabs = document.querySelector('#statusPanel [role="tablist"]').getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2
    );
    return {
      reachable:
        !button.hidden &&
        !button.closest('[inert]') &&
        bounds.width >= 44 &&
        bounds.height >= 44 &&
        bounds.left >= 0 &&
        bounds.right <= innerWidth + 1 &&
        bounds.top >= 0 &&
        bounds.bottom <= innerHeight + 1 &&
        (hit === button || button.contains(hit)),
      insideHeader:
        bounds.left >= header.left - 1 &&
        bounds.right <= header.right + 1 &&
        bounds.top >= header.top - 1 &&
        bounds.bottom <= header.bottom + 1,
      boundedScrollport:
        tabs.width > 0 && tabs.left >= header.left - 1 && tabs.right <= bounds.left + 1
    };
  });
  assert.equal(actual.reachable, true, `${description}: chevron remains visible and reachable`);
  assert.equal(actual.insideHeader, true, `${description}: chevron stays inside tab header`);
  assert.equal(actual.boundedScrollport, true, `${description}: tab scrollport reserves chevron`);
}

async function assertTabReveal(page, activeId, description) {
  await page.waitForFunction(
    (id) => {
      const tab = document.getElementById(id);
      const tablist = tab.closest('[role="tablist"]');
      const bounds = tab.getBoundingClientRect();
      const port = tablist.getBoundingClientRect();
      const left = port.left + tablist.clientLeft;
      const top = port.top + tablist.clientTop;
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.left >= left - 1 &&
        bounds.right <= left + tablist.clientWidth + 1 &&
        bounds.top >= top - 1 &&
        bounds.bottom <= top + tablist.clientHeight + 1
      );
    },
    { timeout: 10000 },
    activeId
  );
  await assertTabAndMetricText(page, description);
  await assertTabChevron(page, description);
}

async function assertAgentCardText(page, description) {
  const overflow = await page.evaluate(() => {
    const failures = [];
    for (const card of document.querySelectorAll('.agent-card')) {
      const cardBounds = card.getBoundingClientRect();
      for (const selector of ['.agent-character-name', '.agent-status']) {
        const field = card.querySelector(selector);
        if (!field) {
          failures.push({ id: card.id, selector, reason: 'Missing field' });
          continue;
        }
        const fieldBounds = field.getBoundingClientRect();
        const inside = (rect, bounds) =>
          rect.left >= bounds.left - 1 &&
          rect.right <= bounds.right + 1 &&
          rect.top >= bounds.top - 1 &&
          rect.bottom <= bounds.bottom + 1;
        if (
          fieldBounds.width === 0 ||
          fieldBounds.height === 0 ||
          !inside(fieldBounds, cardBounds)
        ) {
          failures.push({ id: card.id, selector, reason: 'Field outside card or hidden' });
        }
        const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent;
          const start = text.search(/\S/);
          if (start < 0) continue;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, text.trimEnd().length);
          for (const rect of range.getClientRects()) {
            if (!inside(rect, cardBounds) || !inside(rect, fieldBounds)) {
              failures.push({
                id: card.id,
                selector,
                text: text.trim(),
                textBounds: [rect.left, rect.top, rect.right, rect.bottom],
                fieldBounds: [
                  fieldBounds.left,
                  fieldBounds.top,
                  fieldBounds.right,
                  fieldBounds.bottom
                ],
                cardBounds: [cardBounds.left, cardBounds.top, cardBounds.right, cardBounds.bottom]
              });
            }
          }
        }
      }
    }
    return failures;
  });
  assert.deepEqual(overflow, [], `${description}: full agent names and status text stay in cards`);
  const waiting = await page.evaluate(() =>
    [...document.querySelectorAll('.agent-card[data-state="menunggu_persetujuan"]')].map(
      (card) => ({
        text: card.querySelector('.agent-status').textContent.trim(),
        title: card.querySelector('.agent-status').title,
        name: card.getAttribute('aria-label')
      })
    )
  );
  for (const card of waiting) {
    assert.equal(card.text, 'Menunggu', `${description}: compact waiting pill`);
    assert.equal(card.title, 'Menunggu keputusan', `${description}: complete status title`);
    assert.ok(
      card.name.includes('Menunggu keputusan'),
      `${description}: complete accessible meaning`
    );
  }
}

async function assertAgentCardAlignment(page, description) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.agent-card')].map((card) => {
      const top = card.getBoundingClientRect().top;
      return {
        id: card.id,
        status: card.querySelector('.agent-status').getBoundingClientRect().top - top,
        task: card.querySelector('.agent-task').getBoundingClientRect().top - top,
        activity: card.querySelector('.agent-activity').getBoundingClientRect().top - top
      };
    })
  );
  for (const field of ['status', 'task', 'activity']) {
    const tops = rows.map((row) => row[field]);
    assert.ok(
      Math.max(...tops) - Math.min(...tops) <= 1,
      `${description}: shared ${field} row ${JSON.stringify(rows)}`
    );
  }
  await assertAgentCardText(page, description);
}

async function assertMobileDock(page, collapsed, description) {
  if ((await page.evaluate(() => innerWidth)) > 820) return;
  await page.waitForFunction(
    (expected) => {
      const panel = document.getElementById('statusPanel');
      const rect = panel.getBoundingClientRect();
      const style = getComputedStyle(panel);
      return (
        panel.classList.contains('minimized') === expected &&
        !panel.inert &&
        !panel.closest('[hidden]') &&
        style.display !== 'none' &&
        Number(style.opacity) > 0.99 &&
        rect.left >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight + 1
      );
    },
    { timeout: 10000 },
    collapsed
  );
  const actual = await page.evaluate(() => {
    const panel = document.getElementById('statusPanel');
    const rect = panel.getBoundingClientRect();
    const header = panel.querySelector('.panel-header').getBoundingClientRect();
    const cards = document.getElementById('agentGrid').getBoundingClientRect();
    const button = document.getElementById('btnMinRight');
    return {
      expanded: button.getAttribute('aria-expanded'),
      bodyHidden: getComputedStyle(panel.querySelector('.panel-scroll')).display === 'none',
      headerVisible:
        header.height >= 44 && header.top >= rect.top - 1 && header.bottom <= rect.bottom + 1,
      buttonVisible: !button.hidden && button.getBoundingClientRect().width >= 44,
      feedMatches:
        document.getElementById('feedListMobile').innerHTML ===
        document.getElementById('feedList').innerHTML,
      gap: rect.top - cards.bottom,
      tabs: ['tabTasks', 'tabAbout', 'tabFeed'].map((id) => {
        const tab = document.getElementById(id);
        return (
          !tab.hidden &&
          getComputedStyle(tab).display !== 'none' &&
          tab.getBoundingClientRect().width > 0
        );
      })
    };
  });
  assert.equal(actual.expanded, String(!collapsed), `${description}: dock aria-expanded`);
  assert.equal(actual.bodyHidden, collapsed, `${description}: only scrolling body collapses`);
  assert.equal(actual.headerVisible, true, `${description}: tab row remains inside visible panel`);
  assert.equal(actual.buttonVisible, true, `${description}: reopen control remains visible`);
  assert.equal(
    actual.feedMatches,
    true,
    `${description}: mobile Activity mirrors the public desktop feed state`
  );
  assert.deepEqual(actual.tabs, [true, true, true], `${description}: all mobile tabs available`);
  assert.ok(actual.gap >= 7, `${description}: card/drawer clearance ${actual.gap}px`);
  await assertTabAndMetricText(page, description);
  await assertTabChevron(page, description);
}

async function mobilePanelResizeRegression(page) {
  await page.click('#btnToggleSidebars');
  await assertPanels(page, true, 'resize fixture: desktop panels hidden');
  for (const width of [820, 507, 390, 320]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await assertMobileDock(page, false, `resize ${width}: mobile panel reachable`);
    await assertAgentCardAlignment(page, `resize ${width}: shared card rows`);
    await page.click('#card-hq_lab_director');
    await assertMobileDock(page, true, `resize ${width}: card selection leaves dock`);
    await page.click('#tabFeed');
    await assertMobileDock(page, false, `resize ${width}: Activity tab opens drawer`);
    await page.keyboard.press('Escape');
    await assertMobileDock(page, true, `resize ${width}: Escape leaves dock`);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      'btnMinRight',
      `resize ${width}: Escape focuses visible chevron`
    );
    await page.click('#btnMinRight');
    await assertMobileDock(page, false, `resize ${width}: chevron restores drawer`);
    await page.click('#tabTasks');
    await tabTextKeyboardRegression(page, `resize ${width}: tab scrollport navigation`);
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await assertPanels(page, true, 'resize fixture: previous desktop preference restored');
  await page.click('#btnToggleSidebars');
  await assertPanels(page, false, 'resize fixture: desktop panels restored');
  await resetCamera(page, 'resize fixture: reset selection');
}

async function assertLabels(page, focusedRole, description) {
  await page.waitForFunction(
    ({ focused, roles }) => {
      const wide = document.getElementById('scene').clientWidth >= 600;
      return roles.every((role) => {
        const entity = window.__characters[role.key];
        let labelObject;
        entity?.root.traverse((object) => {
          if (object.isCSS2DObject) labelObject = object;
        });
        const tag = labelObject?.element.querySelector('.agent-tag');
        if (!tag) return false;
        const rect = tag.getBoundingClientRect();
        const style = getComputedStyle(tag);
        const visible =
          tag.isConnected &&
          !tag.hidden &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
        const projected = labelObject
          .getWorldPosition(new window.__THREE.Vector3())
          .project(window.__camera);
        const inFrustum =
          Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1;
        const expectedVisible = (focused ? role.key === focused : wide) && inFrustum;
        const stage = document.querySelector('.office-stage').getBoundingClientRect();
        return (
          labelObject.visible === expectedVisible &&
          visible === expectedVisible &&
          (!visible ||
            (tag.textContent ===
              (focused
                ? `${role.name} · ${role.role}${role.slug === 'hq' ? ' · HQ' : ''}`
                : role.name) &&
              rect.left >= stage.left - 1 &&
              rect.right <= stage.right + 1 &&
              rect.top >= stage.top - 1 &&
              rect.bottom <= stage.bottom + 1))
        );
      });
    },
    { timeout: 10000 },
    { focused: focusedRole, roles: OFFICE_ROLES }
  );
  const actual = await page.evaluate(() => ({
    width: document.getElementById('scene').clientWidth,
    labels: Object.entries(window.__characters).map(([key, entity]) => {
      let labelObject;
      entity.root.traverse((object) => {
        if (object.isCSS2DObject) labelObject = object;
      });
      const tag = labelObject.element.querySelector('.agent-tag');
      const rect = tag.getBoundingClientRect();
      const style = getComputedStyle(tag);
      const projected = labelObject
        .getWorldPosition(new window.__THREE.Vector3())
        .project(window.__camera);
      return {
        key,
        text: tag.textContent,
        objectVisible: labelObject.visible,
        inFrustum:
          Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1,
        visible:
          tag.isConnected &&
          !tag.hidden &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
      };
    })
  }));
  assert.deepEqual(
    actual.labels.map(({ key }) => key).sort(),
    roleKeys,
    `${description}: five label identities`
  );
  const expectedKeys = actual.labels
    .filter(
      (label) => (focusedRole ? label.key === focusedRole : actual.width >= 600) && label.inFrustum
    )
    .map((label) => label.key)
    .sort();
  const visible = actual.labels.filter(({ visible }) => visible);
  assert.deepEqual(
    visible.map(({ key }) => key).sort(),
    expectedKeys,
    `${description}: visible labels follow stage width, focus and real character frustum`
  );
  for (const label of actual.labels) {
    assert.equal(
      label.objectVisible,
      expectedKeys.includes(label.key),
      `${description}: ${label.key} CSS2D visibility`
    );
  }
  for (const label of visible) {
    const role = OFFICE_ROLES.find(({ key }) => key === label.key);
    assert.equal(
      label.text,
      focusedRole ? `${role.name} · ${role.role}${role.slug === 'hq' ? ' · HQ' : ''}` : role.name,
      `${description}: ${label.key} label text`
    );
  }
}

async function assertResponsivePanelWidth(page, description) {
  const actual = await page.evaluate(() => {
    if (window.innerWidth > 820) return null;
    const workspace = document.querySelector('.workspace');
    const style = getComputedStyle(workspace);
    const contentWidth =
      workspace.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const panels = [...document.querySelectorAll('.side-panel')]
      .filter((panel) => {
        const panelStyle = getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();
        return (
          panelStyle.display !== 'none' &&
          panelStyle.visibility !== 'hidden' &&
          Number(panelStyle.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((panel) => ({ name: panel.className, width: panel.getBoundingClientRect().width }));
    return { contentWidth, panels };
  });
  if (!actual) return;
  for (const panel of actual.panels) {
    assert.ok(
      Math.abs(panel.width - actual.contentWidth) <= 24,
      `${description}: ${panel.name} spans workspace content width (${panel.width} vs ${actual.contentWidth})`
    );
  }
}

async function assertPanels(page, hidden, description) {
  await page.waitForFunction(
    (expected) => {
      const isMobile = window.innerWidth <= 1180;
      const panels = [...document.querySelectorAll('.side-panel')].filter((panel) => {
        if (isMobile && panel.classList.contains('left')) return false;
        return true;
      });
      return (
        document.querySelector('.workspace').classList.contains('panels-hidden') === expected &&
        panels.every((panel) => {
          const style = getComputedStyle(panel);
          return (style.display === 'none' || Number(style.opacity) < 0.01) === expected;
        })
      );
    },
    { timeout: 10000 },
    hidden
  );
  const actual = await page.$eval('#btnToggleSidebars', (button) => ({
    expanded: button.getAttribute('aria-expanded'),
    text: button.textContent.trim()
  }));
  assert.equal(actual.expanded, String(!hidden), `${description}: panel toggle aria-expanded`);
  assert.equal(
    actual.text,
    hidden ? 'Tampilkan panel' : 'Sembunyikan panel',
    `${description}: panel toggle action text`
  );
  await assertDpr(page, 1, `${description}: aspect and DPR preserved`);
  await assertHeaderText(page, description);
  await assertResponsivePanelWidth(page, description);
}

async function assertTab(page, activeId, description, keyboard = false) {
  const actual = await page.evaluate(() => ({
    focus: document.activeElement.id,
    tabs: ['tabTasks', 'tabAbout', 'tabFeed'].map((id) => {
      const tab = document.getElementById(id);
      const pane = document.getElementById(tab.getAttribute('aria-controls'));
      return {
        id,
        selected: tab.getAttribute('aria-selected'),
        tabIndex: tab.tabIndex,
        paneHidden: pane.hidden,
        paneActive: pane.classList.contains('active')
      };
    })
  }));
  for (const tab of actual.tabs) {
    const active = tab.id === activeId;
    assert.equal(tab.selected, String(active), `${description}: ${tab.id} selected`);
    assert.equal(tab.tabIndex, active ? 0 : -1, `${description}: ${tab.id} tab order`);
    assert.equal(tab.paneHidden, !active, `${description}: ${tab.id} pane visibility`);
    assert.equal(tab.paneActive, active, `${description}: ${tab.id} pane class`);
  }
  if (keyboard) assert.equal(actual.focus, activeId, `${description}: keyboard tab focus`);
  await assertTabReveal(page, activeId, description);
}

async function tabTextKeyboardRegression(page, description) {
  const feedVisible = await page.$eval('#tabFeed', (tab) => !tab.hidden);
  const lastTab = feedVisible ? 'tabFeed' : 'tabAbout';
  await page.focus('#tabTasks');
  for (const [key, active] of [
    ['Home', 'tabTasks'],
    ['ArrowRight', 'tabAbout'],
    ...(feedVisible ? [['ArrowRight', 'tabFeed']] : []),
    ['Home', 'tabTasks'],
    ['ArrowLeft', lastTab],
    ['ArrowRight', 'tabTasks'],
    ['End', lastTab],
    ['Home', 'tabTasks']
  ]) {
    await page.keyboard.press(key);
    await assertTab(page, active, `${description}: ${key} reveals ${active}`, true);
  }
}

async function panelControls(page, description) {
  const mobile = (await page.evaluate(() => innerWidth)) <= 820;
  const isToggleVisible = await page.evaluate(() => {
    const btn = document.getElementById('btnToggleSidebars');
    return Boolean(btn && !btn.hidden && getComputedStyle(btn).display !== 'none');
  });

  if (isToggleVisible) {
    await page.click('#btnToggleSidebars');
    await assertPanels(page, true, `${description}: hide panels`);
    await page.click('#btnToggleSidebars');
    await assertPanels(page, false, `${description}: show panels`);
  }
  await page.keyboard.press('h');
  if (mobile) await assertMobileDock(page, true, `${description}: H collapses to reachable dock`);
  else await assertPanels(page, true, `${description}: H shortcut hides panels`);
  await page.keyboard.press('h');
  if (mobile) await assertMobileDock(page, false, `${description}: H restores drawer`);
  else await assertPanels(page, false, `${description}: H shortcut restores panels`);

  const isLeftVisible = await page.evaluate(() => {
    const left = document.querySelector('.side-panel.left');
    return Boolean(left && !left.hidden && getComputedStyle(left).display !== 'none');
  });
  const panelList = isLeftVisible
    ? [
        ['#btnMinLeft', '.side-panel.left'],
        ['#btnMinRight', '.side-panel.right']
      ]
    : [['#btnMinRight', '.side-panel.right']];

  for (const [button, panel] of panelList) {
    for (const minimized of [true, false]) {
      await page.click(button);
      const actual = await page.$eval(panel, (element) => ({
        minimized: element.classList.contains('minimized'),
        expanded: element.querySelector('.icon-button').getAttribute('aria-expanded'),
        contentHidden: getComputedStyle(element.querySelector('.panel-scroll')).display === 'none'
      }));
      assert.equal(actual.minimized, minimized, `${description}: ${panel} minimize/restore`);
      assert.equal(actual.expanded, String(!minimized), `${description}: ${panel} aria-expanded`);
      assert.equal(actual.contentHidden, minimized, `${description}: ${panel} content visibility`);
      await assertDpr(page, 1, `${description}: ${panel} aspect and DPR preserved`);
      await assertResponsivePanelWidth(page, `${description}: ${panel} minimize/restore`);
      await assertAgentCardAlignment(page, `${description}: ${panel} minimize/restore`);
      if (mobile) await assertMobileDock(page, minimized, `${description}: chevron dock state`);
    }
  }

  await page.click('#tabAbout');
  await assertTab(page, 'tabAbout', `${description}: about tab click`);
  const feedVisible = await page.$eval('#tabFeed', (tab) => !tab.hidden);
  for (const [key, active] of [
    ['ArrowLeft', 'tabTasks'],
    ['ArrowRight', 'tabAbout'],
    ...(feedVisible
      ? [
          ['ArrowRight', 'tabFeed'],
          ['ArrowRight', 'tabTasks']
        ]
      : []),
    ['Home', 'tabTasks'],
    ['End', feedVisible ? 'tabFeed' : 'tabAbout']
  ]) {
    await page.keyboard.press(key);
    await assertTab(page, active, `${description}: ${key} tab navigation`, true);
  }
  await page.click('#tabTasks');
  await assertTab(page, 'tabTasks', `${description}: queue tab click`);
  console.log(
    `PASS ${description}: hide/show panels, H shortcut, minimize/restore both panels, queue/about tabs and keyboard navigation`
  );
}

async function syntheticTabAndMetricTextRegression(browser) {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console error: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    failures.push(`request failed: ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  try {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({
      width: viewports[0].width,
      height: viewports[0].height,
      deviceScaleFactor: 1
    });
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response?.status(), 200, 'Synthetic text enlargement: page HTTP status');
    await page.waitForFunction(() => window.__virtualOfficeReady === true, { timeout: 45000 });
    await page.waitForSelector('.agent-card:nth-child(5)', { timeout: 30000 });
    for (const viewport of viewports) {
      const description = `${viewport.name}: synthetic 200% tab and metric text enlargement`;
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1
      });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const fixture = await page.evaluateHandle(createTextEnlargementFixture);
      const baseline = await fixture.evaluate((state) => state.baseline);
      try {
        for (const group of ['tab', 'metric']) {
          assert.ok(
            baseline.fontSizes.some((entry) => entry.group === group),
            `${description}: ${group} text hosts captured before enlargement`
          );
        }
        for (const entry of baseline.fontSizes) {
          assert.ok(
            Number.isFinite(entry.size) && entry.size > 0,
            `${description}: ${entry.id} font`
          );
        }
        await fixture.evaluate((state) => state.apply());
        const actual = await fixture.evaluate((state) => state.inspect());
        assert.equal(actual.hostsConnected, true, `${description}: original text hosts connected`);
        assert.equal(
          actual.currentHostsMatch,
          true,
          `${description}: text-host identity unchanged`
        );
        assert.equal(
          actual.fontSizes.length,
          baseline.fontSizes.length,
          `${description}: every captured text host remains present`
        );
        for (const expected of baseline.fontSizes) {
          const enlarged = actual.fontSizes.find(({ index }) => index === expected.index);
          assert.ok(
            enlarged && Math.abs(enlarged.size - expected.size * 2) < 0.01,
            `${description}: ${expected.id} computed font doubles from ${expected.size}px to ${enlarged?.size}px`
          );
        }
        assert.deepEqual(
          actual.viewport,
          baseline.viewport,
          `${description}: CSS viewport unchanged`
        );
        assert.equal(actual.dpr, baseline.dpr, `${description}: native DPR unchanged`);
        assert.equal(actual.dpr, 1, `${description}: enlargement runs at DPR 1`);
        await assertTabAndMetricText(page, description);
        await tabTextKeyboardRegression(page, description);
        await page.screenshot({
          path: `artifacts/screenshots/${viewport.name}-synthetic-text-200.png`,
          fullPage: true
        });
      } finally {
        try {
          const restored = await fixture.evaluate((state) => state.restore());
          assert.equal(
            restored.hostsConnected,
            true,
            `${description}: hosts connected after cleanup`
          );
          assert.equal(
            restored.currentHostsMatch,
            true,
            `${description}: host identity after cleanup`
          );
          assert.equal(
            restored.inlineRestored,
            true,
            `${description}: original inline fonts restored`
          );
          for (const expected of baseline.fontSizes) {
            const actual = restored.fontSizes.find(({ index }) => index === expected.index);
            assert.ok(
              actual && Math.abs(actual.size - expected.size) < 0.01,
              `${description}: ${expected.id} font restored from ${actual?.size}px to ${expected.size}px`
            );
          }
          assert.deepEqual(
            restored.viewport,
            baseline.viewport,
            `${description}: cleanup viewport`
          );
          assert.equal(restored.dpr, baseline.dpr, `${description}: cleanup DPR`);
        } finally {
          await fixture.dispose();
        }
      }
      assert.deepEqual(failures, [], `${description}: console and request errors`);
      console.log(`PASS ${description}: computed font sizes doubled; viewport and DPR unchanged`);
    }
  } finally {
    await page.close();
  }
}

async function resetCamera(page, description, keyboardKey = null) {
  if (keyboardKey) await page.keyboard.press(keyboardKey);
  else await page.click('#btnResetCamera');
  await waitForCamera(page, await cameraViewFor(page), description);
  const selection = await page.evaluate(() => ({
    pressed: [...document.querySelectorAll('.agent-card[aria-pressed="true"]')].map(
      (card) => card.id
    ),
    workstation: document.querySelector('#scene canvas').dataset.selectedWorkstation || ''
  }));
  assert.deepEqual(selection.pressed, [], `${description}: role selection cleared`);
  assert.equal(selection.workstation, '', `${description}: workstation selection cleared`);
  await assertLabels(page, null, description);
}

async function focusRole(page, roleKey, description, keyboardKey = null) {
  const before = await page.evaluate(() => window.__camera.position.toArray());
  if (keyboardKey) {
    await page.focus(`#card-${roleKey}`);
    await page.keyboard.press(keyboardKey);
  } else {
    await page.click(`#card-${roleKey}`);
  }
  const actual = await waitForCamera(page, await cameraViewFor(page, roleKey), description);
  const selection = await page.evaluate(
    (key) => ({
      cardPressed: document.getElementById(`card-${key}`).getAttribute('aria-pressed'),
      pressed: [...document.querySelectorAll('.agent-card[aria-pressed="true"]')].map(
        (card) => card.id
      ),
      workstation: document.querySelector('#scene canvas').dataset.selectedWorkstation || '',
      hqWorkstation: Boolean(window.__workstations.hq_lab_director)
    }),
    roleKey
  );
  assert.equal(selection.cardPressed, 'true', `${description}: focused card state`);
  assert.deepEqual(selection.pressed, [`card-${roleKey}`], `${description}: one selected role`);
  assert.equal(
    selection.workstation,
    roleKey === 'hq_lab_director' ? '' : roleKey,
    `${description}: desk card selects its workstation; Orion remains deskless`
  );
  assert.equal(selection.hqWorkstation, false, `${description}: HQ has no workstation`);
  await assertMobileDock(page, true, `${description}: focus card preserves dock`);
  await assertLabels(page, roleKey, description);
  assert.ok(
    Math.hypot(...actual.position.map((value, index) => value - before[index])) > 0.1,
    `${description}: focus changes actual camera position`
  );
}

async function pointerFocus(page, roleKey, touch, description) {
  await page.$eval('#scene', (element) => element.scrollIntoView({ block: 'center' }));
  const point = await page.evaluate((key) => {
    const canvas = document.querySelector('#scene canvas');
    const rect = canvas.getBoundingClientRect();
    const world = window.__workstations[key].hitTarget.getWorldPosition(
      new window.__THREE.Vector3()
    );
    const projected = world.project(window.__camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
      inView: Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1
    };
  }, roleKey);
  assert.equal(point.inView, true, `${description}: target appears in home canvas`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await waitForCamera(page, await cameraViewFor(page, roleKey), description);
  const pressed = await page.$eval(`#card-${roleKey}`, (card) => card.getAttribute('aria-pressed'));
  assert.equal(pressed, 'true', `${description}: scene input selects role card`);
  await assertLabels(page, roleKey, description);
}

await mkdir('artifacts/screenshots', { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader'
  ]
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await installMotionObserver(page);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const failures = [];
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`console error: ${message.text()}`);
    });
    page.on('requestfailed', (request) => {
      failures.push(`request failed: ${request.url()} ${request.failure()?.errorText || ''}`);
    });

    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      hasTouch: viewport.width < 768
    });
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response?.status(), 200, `${viewport.name}: page HTTP status`);
    await page.waitForFunction(() => window.__virtualOfficeReady === true, { timeout: 45000 });
    await page.waitForSelector('.agent-card:nth-child(5)', { timeout: 30000 });

    const result = await page.evaluate(() => {
      const loading = document.getElementById('loading');
      const canvas = document.querySelector('#scene canvas');
      const interactive = [...document.querySelectorAll('button:not([hidden])')].map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.id || element.className, width: rect.width, height: rect.height };
      });
      return {
        ready: window.__virtualOfficeReady,
        loadingGone: loading?.classList.contains('gone') ?? false,
        canvasOrFallback: Boolean(canvas) || !document.getElementById('sceneFallback')?.hidden,
        workstationCount: Number(canvas?.dataset.workstationCount || 0),
        prototypeWorkstation: canvas?.dataset.prototypeWorkstation || '',
        workstations: Object.entries(window.__workstations || {}).map(([key, value]) => ({
          key,
          position: value.group.position.toArray(),
          inScene: window.__scene.getObjectById(value.group.id) === value.group
        })),
        characters: Object.entries(window.__characters || {}).map(([key, value]) => ({
          key,
          state: value.state,
          seatId: value.seat?.id ?? null,
          seatKind: value.seat?.kind ?? null,
          heading: value.root.rotation.y,
          position: value.root.position.toArray(),
          inScene: window.__scene.getObjectById(value.root.id) === value.root
        })),
        agentCards: [...document.querySelectorAll('.agent-card')].map((card) =>
          card.id.replace('card-', '')
        ),
        horizontalOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        undersizedControls: interactive.filter(({ width, height }) => width < 44 || height < 44),
        unlabeledButtons: interactive
          .filter(({ id }) => {
            const element = id ? document.getElementById(id) : null;
            return element && !element.textContent.trim() && !element.getAttribute('aria-label');
          })
          .map(({ id }) => id),
        documentLanguage: document.documentElement.lang,
        headings: document.querySelectorAll('h1').length
      };
    });

    assert.equal(failures.length, 0, `${viewport.name}: ${failures.join('; ')}`);
    assert.equal(result.ready, true, `${viewport.name}: readiness signal`);
    assert.equal(result.loadingGone, true, `${viewport.name}: loading overlay hidden`);
    assert.equal(result.canvasOrFallback, true, `${viewport.name}: visual or accessible fallback`);
    assert.equal(result.workstationCount, 4, `${viewport.name}: interactive workstation count`);
    assert.equal(result.prototypeWorkstation, 'data_engineer', `${viewport.name}: prototype role`);
    assert.deepEqual(
      result.workstations.map(({ key }) => key).sort(),
      workstationKeys,
      `${viewport.name}: exact four workstation roles`
    );
    for (const expected of DESK_CONFIGS) {
      const actual = result.workstations.find(({ key }) => key === expected.key);
      assertVector(
        actual.position,
        [expected.x, ROOM_LAYOUT.floorY, expected.z],
        `${viewport.name}: ${expected.key} layout`
      );
      assert.equal(
        actual.position[1],
        ROOM_LAYOUT.floorY,
        `${viewport.name}: ${expected.key} floor contact`
      );
      assert.equal(actual.inScene, true, `${viewport.name}: ${expected.key} workstation in scene`);
    }
    const rowCounts = Object.values(
      result.workstations.reduce((rows, { position }) => {
        rows[position[2]] = (rows[position[2]] || 0) + 1;
        return rows;
      }, {})
    );
    assert.deepEqual(
      rowCounts.sort(),
      [2, 2],
      `${viewport.name}: two clusters of two workstations`
    );
    assert.deepEqual(
      result.characters.map(({ key }) => key).sort(),
      roleKeys,
      `${viewport.name}: exact five characters including HQ`
    );
    const expectedSeats = allocateCharacterSeats({}, { allowIdleSeating: false });
    for (const expected of CHARACTER_CONFIGS) {
      const actual = result.characters.find(({ key }) => key === expected.key);
      assertVector(
        actual.position,
        expectedSeats[expected.key].position,
        `${viewport.name}: ${expected.key} reduced-motion bootstrap home anchor`
      );
      assert.equal(actual.inScene, true, `${viewport.name}: ${expected.key} character in scene`);
      assert.equal(
        actual.seatId,
        expectedSeats[expected.key].id,
        `${viewport.name}: ${expected.key} reduced-motion bootstrap home seat`
      );
      assert.equal(
        actual.seatKind,
        expectedSeats[expected.key].kind,
        `${viewport.name}: ${expected.key} reduced-motion bootstrap seat kind`
      );
      assert.ok(
        Math.abs(
          Math.atan2(
            Math.sin(actual.heading - expectedSeats[expected.key].heading),
            Math.cos(actual.heading - expectedSeats[expected.key].heading)
          )
        ) < 0.001,
        `${viewport.name}: ${expected.key} reduced-motion bootstrap heading`
      );
    }
    assert.deepEqual(
      result.agentCards.sort(),
      roleKeys,
      `${viewport.name}: five role card identities`
    );
    assert.ok(
      result.horizontalOverflow <= 1,
      `${viewport.name}: horizontal overflow ${result.horizontalOverflow}px`
    );
    assert.deepEqual(result.undersizedControls, [], `${viewport.name}: controls smaller than 44px`);
    assert.deepEqual(result.unlabeledButtons, [], `${viewport.name}: unlabeled buttons`);
    assert.equal(result.documentLanguage, 'id', `${viewport.name}: document language`);
    assert.equal(result.headings, 1, `${viewport.name}: one primary heading`);
    await assertDpr(page, 1, `${viewport.name}: initial DPR`);
    await waitForCamera(page, await cameraViewFor(page), `${viewport.name}: home camera`);
    await assertLabels(page, null, `${viewport.name}: home labels`);
    await assertHeaderText(page, viewport.name);
    await assertTabReveal(page, 'tabTasks', `${viewport.name}: initial tabs and metrics`);
    await assertAgentCardAlignment(page, viewport.name);
    await assertResponsivePanelWidth(page, `${viewport.name}: initial panel layout`);
    await assertMobileDock(page, false, `${viewport.name}: initially open drawer`);

    await page.screenshot({
      path: `artifacts/screenshots/${viewport.name}.png`,
      fullPage: true
    });
    if (viewport.name === 'desktop-1440') {
      await (
        await page.$('.office-stage')
      ).screenshot({
        path: 'artifacts/screenshots/desktop-1440-scene.png'
      });
    }
    await panelControls(page, viewport.name);
    if (viewport.name === 'desktop-1440') await mobilePanelResizeRegression(page);

    for (const roleKey of roleKeys) {
      await focusRole(page, roleKey, `${viewport.name}: focus ${roleKey}`);
      if (
        viewport.name === 'desktop-1440' ||
        ['data_engineer', 'hq_lab_director'].includes(roleKey)
      ) {
        await page.screenshot({
          path: `artifacts/screenshots/${viewport.name}-focus-${roleKey}.png`,
          fullPage: true
        });
      }
      await resetCamera(page, `${viewport.name}: reset after ${roleKey}`);
    }

    await focusRole(page, 'hq_lab_director', `${viewport.name}: keyboard Enter focus HQ`, 'Enter');
    await resetCamera(page, `${viewport.name}: reset after keyboard focus`);
    await focusRole(page, 'data_engineer', `${viewport.name}: keyboard Space focus Nova`, 'Space');
    await resetCamera(page, `${viewport.name}: reset after Space focus`);
    await focusRole(page, 'hq_lab_director', `${viewport.name}: focus before Escape reset`);
    await resetCamera(page, `${viewport.name}: Escape reset`, 'Escape');
    await pointerFocus(
      page,
      DESK_CONFIGS[DESK_CONFIGS.length - 1].key,
      viewport.width < 768,
      `${viewport.name}: ${viewport.width < 768 ? 'touch' : 'pointer'} scene focus`
    );
    await resetCamera(page, `${viewport.name}: reset after scene input`);

    if (viewport.name === 'desktop-1440') {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
      assert.equal(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
        false,
        'Animated focus uses no-preference'
      );
      for (const roleKey of ['hq_lab_director', 'data_engineer']) {
        await focusRole(page, roleKey, `Animated focus ${roleKey}`);
        await page.screenshot({
          path: `artifacts/screenshots/desktop-1440-animated-focus-${roleKey}.png`,
          fullPage: true
        });
        await resetCamera(page, `Animated reset after ${roleKey}`);
      }
      const motionEventCount = await page.evaluate(() => window.__motionQa.mediaTransitions.length);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      assert.equal(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
        true,
        'Stable matrix returns to reduced motion'
      );
      await page.waitForFunction(
        (count) =>
          window.__motionQa.mediaTransitions
            .slice(count)
            .some(({ reducedMotion }) => reducedMotion),
        { timeout: 10000 },
        motionEventCount
      );
      const beforeReducedMotion = await page.evaluate(
        (count) =>
          window.__motionQa.mediaTransitions.slice(count).find(({ reducedMotion }) => reducedMotion)
            .anchors,
        motionEventCount
      );
      assert.equal(beforeReducedMotion.length, 5, 'Reduced-motion observer captures five anchors');
      const reducedMotionObservedAt = await page.evaluate(() => performance.now());
      const frozenAnchors = await readCharacterAnchors(page);
      assertFrozenCharacterAnchors(
        frozenAnchors,
        beforeReducedMotion,
        'Reduced motion freezes current positions without teleporting'
      );
      await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
      await assertDpr(page, 1, 'Desktop resize before DPR scenarios');
      for (const ratio of [1.5, 2]) {
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: ratio });
        await assertDpr(page, ratio, `DPR ${ratio}: native buffer`);
        await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: ratio });
        await assertDpr(page, ratio, `DPR ${ratio}: after resize`);
        await resetCamera(page, `DPR ${ratio}: responsive reset`);
        await page.screenshot({
          path: `artifacts/screenshots/desktop-dpr-${ratio}-resize.png`,
          fullPage: true
        });
      }
      for (const ratio of [1.5, 2, 1]) {
        await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: ratio });
        await assertDpr(page, ratio, `DPR ${ratio}: changed density without CSS resize`);
      }
      await page.waitForFunction(
        (startedAt) => performance.now() - startedAt > 46000,
        { timeout: 50000 },
        reducedMotionObservedAt
      );
      assertFrozenCharacterAnchors(
        await readCharacterAnchors(page),
        frozenAnchors,
        'Reduced motion preserves actual character anchors after 46 seconds'
      );
      console.log(
        'PASS five frozen character anchors >45s; actual DPR 1.5/2 before and after resize'
      );
    }

    assert.deepEqual(failures, [], `${viewport.name}: console and request errors`);
    console.log(
      `PASS ${viewport.name}: four workstations, five characters/cards, five focus/reset views, keyboard and scene input`
    );
    await page.close();
  }
  await runMotionRegression(
    browser,
    origin,
    viewports.find(({ name }) => name === 'desktop-1440') || viewports[0]
  );
  await syntheticTabAndMetricTextRegression(browser);
} finally {
  await browser.close();
}
