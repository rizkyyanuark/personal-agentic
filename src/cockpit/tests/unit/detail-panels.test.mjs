import assert from 'node:assert/strict';
import test from 'node:test';

import { setupDetailPanels } from '../../src/client/ui/detail-panels.js';

class FakeClassList {
  values = new Set();

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force = !this.contains(name)) {
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }

  remove(name) {
    this.values.delete(name);
  }
}

class FakeElement extends EventTarget {
  classList = new FakeClassList();
  attributes = new Map();
  children = [];
  hidden = false;
  inert = false;

  constructor(documentRef, tagName = 'DIV') {
    super();
    this.documentRef = documentRef;
    this.tagName = tagName;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  append(node) {
    this.insertBefore(node, null);
  }

  insertBefore(node, sibling) {
    if (node.parentElement) {
      const siblings = node.parentElement.children;
      siblings.splice(siblings.indexOf(node), 1);
    }
    const index = sibling ? this.children.indexOf(sibling) : this.children.length;
    this.children.splice(index, 0, node);
    node.parentElement = this;
  }

  get nextElementSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get lastElementChild() {
    return this.children.at(-1);
  }

  contains(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }

  querySelector(selector) {
    return selector === '.panel-scroll' ? this.scroll : null;
  }

  querySelectorAll(selector) {
    return selector === 'button' ? this.buttons || [] : [];
  }

  focus() {
    this.documentRef.activeElement = this;
  }

  click() {
    this.dispatchEvent(new Event('click'));
  }
}

function fixture(
  width = 1440,
  { hidden = false, leftMinimized = false, rightMinimized = false, storage = null } = {}
) {
  const documentRef = { activeElement: null };
  const node = (tag) => new FakeElement(documentRef, tag);
  documentRef.body = node();
  const workspace = node();
  const left = node();
  const right = node();
  const content = node();
  const details = node();
  const grid = node();
  const toggle = node('BUTTON');
  const minLeft = node('BUTTON');
  const minRight = node('BUTTON');
  const taskButton = node('BUTTON');
  const rightScroll = node();
  rightScroll.append(taskButton);
  left.scroll = node();
  right.scroll = rightScroll;
  left.buttons = [minLeft];
  right.buttons = [minRight, taskButton];
  left.append(minLeft);
  left.append(left.scroll);
  right.append(minRight);
  right.append(rightScroll);
  content.append(left);
  content.append(right);
  details.append(content);
  workspace.append(toggle);
  workspace.append(details);
  workspace.append(grid);
  workspace.classList.toggle('panels-hidden', hidden);
  left.classList.toggle('minimized', leftMinimized);
  right.classList.toggle('minimized', rightMinimized);
  const selectors = new Map([
    ['.workspace', workspace],
    ['.side-panel.left', left],
    ['.side-panel.right', right],
    ['.detail-panel', details]
  ]);
  const ids = new Map([
    ['agentGrid', grid],
    ['mobilePanelContent', content],
    ['btnToggleSidebars', toggle],
    ['btnMinLeft', minLeft],
    ['btnMinRight', minRight]
  ]);
  documentRef.querySelector = (selector) => selectors.get(selector);
  documentRef.getElementById = (id) => ids.get(id);
  const mediaQueries = new Map();
  const windowRef = new EventTarget();
  windowRef.matchMedia = (query) => {
    if (!mediaQueries.has(query)) {
      const media = new EventTarget();
      media.limit = Number(query.match(/\d+/)[0]);
      media.matches = width <= media.limit;
      mediaQueries.set(query, media);
    }
    return mediaQueries.get(query);
  };
  if (storage) windowRef.localStorage = storage;
  const controller = setupDetailPanels({ documentRef, windowRef });

  return {
    controller,
    documentRef,
    windowRef,
    workspace,
    left,
    right,
    content,
    toggle,
    minLeft,
    minRight,
    taskButton,
    rightScroll,
    resize(nextWidth) {
      const changed = [];
      for (const media of mediaQueries.values()) {
        const matches = nextWidth <= media.limit;
        if (matches !== media.matches) changed.push(media);
        media.matches = matches;
      }
      for (const media of changed) media.dispatchEvent(new Event('change'));
    },
    key(key) {
      const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
      windowRef.dispatchEvent(event);
      return event;
    }
  };
}

function assertReachableDock(f) {
  assert.equal(f.content.hidden, false);
  assert.equal(f.right.hidden, false);
  assert.equal(f.right.inert, false);
  assert.equal(f.minRight.hidden, false);
  assert.equal(f.workspace.classList.contains('panels-hidden'), false);
}

test('initial mobile opens the drawer even with saved desktop hidden/minimized state', () => {
  const f = fixture(390, { hidden: true, leftMinimized: true, rightMinimized: true });
  assertReachableDock(f);
  assert.equal(f.controller.isMobileOpen(), true);
  assert.equal(f.minRight.getAttribute('aria-expanded'), 'true');
  assert.equal(f.documentRef.body.classList.contains('min-right'), false);
  assert.equal(f.toggle.hidden, true);

  f.resize(1440);
  assert.equal(f.workspace.classList.contains('panels-hidden'), true);
  assert.equal(f.left.classList.contains('minimized'), true);
  assert.equal(f.right.classList.contains('minimized'), true);
  assert.equal(f.toggle.hidden, false);
  assert.equal(f.right.inert, true);
});

test('desktop preferences survive mobile docking and every mobile entry opens again', () => {
  const f = fixture();
  f.minLeft.click();
  f.toggle.click();
  f.resize(390);
  assertReachableDock(f);
  assert.equal(f.controller.isMobileOpen(), true);

  f.controller.collapseMobile();
  assertReachableDock(f);
  assert.equal(f.controller.isMobileOpen(), false);
  assert.equal(f.right.classList.contains('minimized'), true);
  assert.equal(f.documentRef.body.classList.contains('min-right'), true);
  assert.equal(f.minRight.getAttribute('aria-expanded'), 'false');
  f.minRight.click();
  assert.equal(f.controller.isMobileOpen(), true);

  f.resize(1440);
  assert.equal(f.workspace.classList.contains('panels-hidden'), true);
  assert.equal(f.left.classList.contains('minimized'), true);
  assert.equal(f.right.classList.contains('minimized'), false);
  assert.equal(f.documentRef.body.classList.contains('min-right'), false);
  f.resize(390);
  assertReachableDock(f);
  assert.equal(f.controller.isMobileOpen(), true);
});

test('mobile H toggles only the dock and Escape consumes the first collapse with visible focus', () => {
  const f = fixture(390);
  f.key('H');
  assertReachableDock(f);
  assert.equal(f.controller.isMobileOpen(), false);
  f.key('h');
  assert.equal(f.controller.isMobileOpen(), true);
  f.taskButton.focus();
  const firstEscape = f.key('Escape');
  assert.equal(firstEscape.defaultPrevented, true);
  assert.equal(f.documentRef.activeElement, f.minRight);
  assert.equal(f.rightScroll.inert, true);
  assertReachableDock(f);
  assert.equal(f.key('Escape').defaultPrevented, false);
  f.controller.expandMobile();
  assert.equal(f.controller.isMobileOpen(), true);
  assert.equal(f.rightScroll.inert, false);
});

test('H does not steal typing and programmatic card collapse keeps the dock reachable', () => {
  const f = fixture(390);
  f.documentRef.activeElement = new FakeElement(f.documentRef, 'INPUT');
  f.key('h');
  assert.equal(f.controller.isMobileOpen(), true);
  f.documentRef.activeElement = new FakeElement(f.documentRef);
  f.documentRef.activeElement.isContentEditable = true;
  f.key('H');
  assert.equal(f.controller.isMobileOpen(), true);
  f.controller.collapseMobile();
  assertReachableDock(f);
  assert.equal(f.controller.isMobileOpen(), false);
});

test('the shared Escape contract collapses before a camera reset and permits the next reset', () => {
  const f = fixture(390);
  let resets = 0;
  f.windowRef.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!f.controller.isMobileOpen()) resets += 1;
  });
  f.key('Escape');
  assert.equal(resets, 0);
  assert.equal(f.controller.isMobileOpen(), false);
  f.key('Escape');
  assert.equal(resets, 1);
});

test('820 is mobile while tablet keeps desktop toggle and narrow activity-panel visibility', () => {
  const f = fixture(821);
  assert.equal(f.toggle.hidden, false);
  assert.equal(f.left.hidden, true);
  assert.equal(f.controller.isMobileOpen(), false);
  f.resize(820);
  assert.equal(f.toggle.hidden, true);
  assert.equal(f.controller.isMobileOpen(), true);
  f.resize(1180);
  assert.equal(f.left.hidden, true);
  assert.equal(f.toggle.hidden, false);
  f.resize(1181);
  assert.equal(f.left.hidden, false);
  assert.equal(f.left.inert, false);
});

test('disposing the controller removes keyboard and mode listeners', () => {
  const f = fixture(390);
  f.controller.dispose();
  f.key('H');
  assert.equal(f.controller.isMobileOpen(), true);
  f.resize(1440);
  assert.equal(f.toggle.hidden, true);
});

test('persists desktop preference to localStorage when available', () => {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val))
  };
  const f = fixture(1440, { storage });
  f.toggle.click();
  assert.equal(storage.getItem('cockpit.lapang'), '1');
  f.minLeft.click();
  assert.equal(storage.getItem('cockpit.min.left'), '1');
  f.minRight.click();
  assert.equal(storage.getItem('cockpit.min.right'), '1');
});

test('loads desktop preference from localStorage on startup when available', () => {
  const map = new Map([
    ['cockpit.lapang', '1'],
    ['cockpit.min.left', '1'],
    ['cockpit.min.right', '0']
  ]);
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val))
  };
  const f = fixture(1440, { storage });
  assert.equal(f.workspace.classList.contains('panels-hidden'), true);
  assert.equal(f.left.classList.contains('minimized'), true);
  assert.equal(f.right.classList.contains('minimized'), false);
  assert.equal(f.toggle.textContent, 'Tampilkan panel');
});
