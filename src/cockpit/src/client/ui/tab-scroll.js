export function revealTab(tab) {
  const list = tab?.closest('[role="tablist"]');
  if (!list || tab.hidden || list.clientWidth === 0) return;
  const bounds = list.getBoundingClientRect();
  const item = tab.getBoundingClientRect();
  const left = bounds.left + list.clientLeft;
  const right = left + list.clientWidth;
  let delta = 0;
  if (item.width > list.clientWidth || item.left < left) delta = item.left - left;
  else if (item.right > right) delta = item.right - right;
  if (!delta) return;
  list.scrollLeft = Math.max(
    0,
    Math.min(list.scrollWidth - list.clientWidth, list.scrollLeft + delta)
  );
}
