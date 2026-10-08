import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createTextEnlargementFixture } from '../helpers/text-enlargement.mjs';

function documentFixture() {
  const view = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 1,
    Node: { TEXT_NODE: 3 },
    getComputedStyle(element) {
      const inline = element.style.getPropertyValue('font-size');
      let size;
      if (inline) size = parseFloat(inline) * (inline.endsWith('rem') ? 16 : 1);
      else if (element.baseSize === null)
        size = parseFloat(this.getComputedStyle(element.parent).fontSize);
      else
        size = typeof element.baseSize === 'function' ? element.baseSize(this) : element.baseSize;
      return { fontSize: `${size}px` };
    }
  };
  const doc = { defaultView: view, hosts: [], querySelectorAll: () => doc.hosts };
  function host({
    id = '',
    tag = 'span',
    text = 'Label',
    group = 'metric',
    baseSize = 12,
    parent = null,
    styleAttribute = false
  } = {}) {
    const attributes = new Map(styleAttribute ? [['style', '']] : []);
    const properties = new Map();
    const syncStyle = () => attributes.set('style', [...properties.keys()].join(';'));
    const element = {
      id,
      localName: tag,
      childNodes: [{ nodeType: 3, textContent: text }],
      isConnected: true,
      baseSize,
      parent,
      attributes,
      hasAttribute: (name) => attributes.has(name),
      removeAttribute(name) {
        attributes.delete(name);
        if (name === 'style') properties.clear();
      },
      closest: () => (group === 'tab' ? element : null),
      style: {
        get length() {
          return properties.size;
        },
        getPropertyValue: (name) => properties.get(name)?.value || '',
        getPropertyPriority: (name) => properties.get(name)?.priority || '',
        setProperty(name, value, priority = '') {
          properties.set(name, { value, priority });
          syncStyle();
        },
        removeProperty(name) {
          const previous = properties.get(name)?.value || '';
          properties.delete(name);
          syncStyle();
          return previous;
        }
      }
    };
    doc.hosts.push(element);
    return element;
  }
  return { doc, view, host };
}

test('all baseline sizes are captured before parent and inherited child fonts change', () => {
  const { doc, host } = documentFixture();
  const tab = host({ id: 'tabAbout', group: 'tab', baseSize: 12, text: 'Tugas' });
  host({ id: 'tugasWho', group: 'tab', baseSize: null, parent: tab, text: 'Orion' });
  host({ id: 'nTodo', group: 'tab', baseSize: 10.5, text: '2' });
  host({ tag: 'small', baseSize: 10.5, text: 'Status' });
  host({ text: '   ' });
  const fixture = createTextEnlargementFixture(doc);
  assert.deepEqual(
    fixture.baseline.fontSizes.map(({ size }) => size),
    [12, 12, 10.5, 10.5]
  );
  const actual = fixture.apply();
  assert.deepEqual(
    actual.fontSizes.map(({ size }) => size),
    [24, 24, 21, 21]
  );
  assert.deepEqual(
    actual.fontSizes.map(({ group }) => group),
    ['tab', 'tab', 'tab', 'metric']
  );
  assert.deepEqual(actual.viewport, [390, 844]);
  assert.equal(actual.dpr, 1);
  assert.equal(actual.hostsConnected, true);
  assert.equal(actual.currentHostsMatch, true);
  fixture.restore();
});

test('restoration preserves exact original inline font values and priorities', () => {
  const { doc, host } = documentFixture();
  const important = host();
  const ordinary = host();
  important.style.setProperty('font-size', '1.25rem', 'important');
  ordinary.style.setProperty('font-size', '13px');
  const fixture = createTextEnlargementFixture(doc);
  fixture.apply();
  assert.equal(important.style.getPropertyValue('font-size'), '40px');
  assert.equal(ordinary.style.getPropertyPriority('font-size'), 'important');
  const restored = fixture.restore();
  assert.equal(important.style.getPropertyValue('font-size'), '1.25rem');
  assert.equal(important.style.getPropertyPriority('font-size'), 'important');
  assert.equal(ordinary.style.getPropertyValue('font-size'), '13px');
  assert.equal(ordinary.style.getPropertyPriority('font-size'), '');
  assert.deepEqual(
    restored.fontSizes.map(({ size }) => size),
    [20, 13]
  );
  assert.equal(restored.inlineRestored, true);
});

test('cleanup removes only generated empty style attributes and preserves unrelated edits', () => {
  const { doc, host } = documentFixture();
  const absent = host();
  const empty = host({ styleAttribute: true });
  const edited = host();
  const original = host();
  original.style.setProperty('color', 'blue');
  const fixture = createTextEnlargementFixture(doc);
  fixture.apply();
  edited.style.setProperty('color', 'red', 'important');
  original.style.setProperty('background', 'white');
  const restored = fixture.restore();
  assert.equal(absent.hasAttribute('style'), false);
  assert.equal(empty.hasAttribute('style'), true);
  assert.equal(empty.style.length, 0);
  assert.equal(edited.style.getPropertyValue('color'), 'red');
  assert.equal(edited.style.getPropertyPriority('color'), 'important');
  assert.equal(original.style.getPropertyValue('color'), 'blue');
  assert.equal(original.style.getPropertyValue('background'), 'white');
  for (const element of doc.hosts) {
    assert.equal(element.style.getPropertyValue('font-size'), '');
    assert.ok([...element.attributes.keys()].every((name) => name === 'style'));
  }
  assert.equal(restored.inlineRestored, true);
});

test('each sequential viewport fixture starts from restored responsive baseline sizes', () => {
  const { doc, view, host } = documentFixture();
  const label = host({ baseSize: (current) => (current.innerWidth < 500 ? 10.5 : 11) });
  for (const [width, size] of [
    [320, 10.5],
    [390, 10.5],
    [1024, 11],
    [1440, 11]
  ]) {
    view.innerWidth = width;
    const fixture = createTextEnlargementFixture(doc);
    assert.equal(fixture.baseline.fontSizes[0].size, size);
    assert.deepEqual(fixture.baseline.viewport, [width, 844]);
    assert.equal(fixture.apply().fontSizes[0].size, size * 2);
    assert.equal(fixture.restore().inlineRestored, true);
    assert.equal(label.hasAttribute('style'), false);
  }
});

test('host detachment and replacement fail identity proof even with equal font sizes', () => {
  const { doc, host } = documentFixture();
  const original = host({ id: 'liveTxt' });
  const fixture = createTextEnlargementFixture(doc);
  fixture.apply();
  original.isConnected = false;
  const replacement = host({ id: 'liveTxt' });
  replacement.style.setProperty('font-size', '24px', 'important');
  doc.hosts = [replacement];
  const actual = fixture.inspect();
  assert.equal(actual.fontSizes[0].size, 24);
  assert.equal(actual.hostsConnected, false);
  assert.equal(actual.currentHostsMatch, false);
  const restored = fixture.restore();
  assert.equal(restored.inlineRestored, true);
  assert.equal(restored.hostsConnected, false);
  assert.equal(restored.currentHostsMatch, false);
  assert.equal(original.hasAttribute('style'), false);
  assert.equal(replacement.style.getPropertyValue('font-size'), '24px');
});

test('failure cleanup restores all captured hosts after a partial apply throws', () => {
  const { doc, host } = documentFixture();
  const first = host();
  const second = host();
  const setProperty = second.style.setProperty;
  second.style.setProperty = (name, value, priority) => {
    if (name === 'font-size' && value === '24px') throw new Error('Fixture apply failed');
    setProperty(name, value, priority);
  };
  const fixture = createTextEnlargementFixture(doc);
  let cleanup;
  assert.throws(() => {
    try {
      fixture.apply();
    } finally {
      cleanup = fixture.restore();
    }
  }, /Fixture apply failed/);
  assert.equal(cleanup.inlineRestored, true);
  assert.equal(cleanup.hostsConnected, true);
  assert.equal(cleanup.currentHostsMatch, true);
  assert.equal(first.hasAttribute('style'), false);
  assert.equal(second.hasAttribute('style'), false);
});

test('the fixture remains self-contained when serialized into an isolated context', () => {
  const { doc, host } = documentFixture();
  host({ baseSize: 11 });
  const fixture = runInNewContext(`(${createTextEnlargementFixture.toString()})(document)`, {
    document: doc
  });
  assert.equal(fixture.apply().fontSizes[0].size, 22);
  assert.equal(fixture.inspect().currentHostsMatch, true);
  assert.equal(fixture.restore().inlineRestored, true);
});
