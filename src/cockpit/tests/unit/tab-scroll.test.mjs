import assert from 'node:assert/strict';
import test from 'node:test';
import { revealTab } from '../../src/client/ui/tab-scroll.js';

function fixture({ itemLeft, itemRight, scrollLeft = 0, clientWidth = 200, hidden = false }) {
  const list = {
    clientLeft: 1,
    clientWidth,
    scrollWidth: 500,
    scrollLeft,
    getBoundingClientRect: () => ({ left: 10 })
  };
  const tab = {
    hidden,
    closest: () => list,
    getBoundingClientRect: () => ({
      left: itemLeft,
      right: itemRight,
      width: itemRight - itemLeft
    })
  };
  return { list, tab };
}

test('a visible tab does not move the scrollport', () => {
  const { list, tab } = fixture({ itemLeft: 30, itemRight: 170, scrollLeft: 20 });
  revealTab(tab);
  assert.equal(list.scrollLeft, 20);
});

test('right-clipped tabs reveal inside the tablist including its border', () => {
  const { list, tab } = fixture({ itemLeft: 140, itemRight: 260, scrollLeft: 20 });
  revealTab(tab);
  assert.equal(list.scrollLeft, 69);
});

test('left-clipped tabs reveal without scrolling other ancestors', () => {
  const { list, tab } = fixture({ itemLeft: -30, itemRight: 90, scrollLeft: 70 });
  revealTab(tab);
  assert.equal(list.scrollLeft, 29);
});

test('oversized labels align to their start instead of alternating between edges', () => {
  const { list, tab } = fixture({ itemLeft: -30, itemRight: 270, scrollLeft: 70 });
  revealTab(tab);
  assert.equal(list.scrollLeft, 29);
});

test('scroll positions stay bounded and hidden/unmeasurable tabs do not move', () => {
  const end = fixture({ itemLeft: 300, itemRight: 500, scrollLeft: 290 });
  revealTab(end.tab);
  assert.equal(end.list.scrollLeft, 300);
  const start = fixture({ itemLeft: -200, itemRight: -100, scrollLeft: 50 });
  revealTab(start.tab);
  assert.equal(start.list.scrollLeft, 0);
  const hidden = fixture({ itemLeft: 200, itemRight: 300, hidden: true });
  revealTab(hidden.tab);
  assert.equal(hidden.list.scrollLeft, 0);
  const unmeasurable = fixture({ itemLeft: 200, itemRight: 300, clientWidth: 0 });
  revealTab(unmeasurable.tab);
  assert.equal(unmeasurable.list.scrollLeft, 0);
  revealTab(null);
});
