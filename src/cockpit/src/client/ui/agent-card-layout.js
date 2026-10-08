export function requiresSharedStatusRow(headers) {
  return headers.some(({ available, name, status, gap }) => name + status + gap > available);
}

export function bindAgentCardLayout(grid, view = window) {
  if (!grid) return null;
  let frame = null;
  let disposed = false;
  const document = grid.ownerDocument;
  const mutations = new view.MutationObserver(schedule);
  const resize = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;

  function naturalWidth(node) {
    const copy = node.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    for (const [property, value] of Object.entries({
      position: 'absolute',
      visibility: 'hidden',
      'pointer-events': 'none',
      'inline-size': 'max-content',
      'max-inline-size': 'none',
      'min-inline-size': '0',
      'white-space': 'nowrap',
      'flex-wrap': 'nowrap',
      margin: '0'
    })) {
      copy.style.setProperty(property, value, 'important');
    }
    node.parentElement.append(copy);
    const width = copy.getBoundingClientRect().width;
    copy.remove();
    return width;
  }

  function update() {
    frame = null;
    if (disposed) return;
    const headings = [...grid.querySelectorAll('.agent-card-heading')];
    if (!headings.length) return;
    // Measurement copies must not trigger another content-mutation update.
    mutations.disconnect();
    for (const variable of [
      '--agent-heading-height',
      '--agent-name-height',
      '--agent-status-height'
    ]) {
      grid.style.removeProperty(variable);
    }
    const headers = headings.map((heading) => ({
      heading,
      name: heading.querySelector('.agent-name'),
      status: heading.querySelector('.agent-status')
    }));
    const stacked = requiresSharedStatusRow(
      headers.map(({ heading, name, status }) => ({
        available: heading.clientWidth,
        name: naturalWidth(name),
        status: naturalWidth(status),
        gap: parseFloat(view.getComputedStyle(heading).columnGap) || 0
      }))
    );
    grid.classList.toggle('statuses-stacked', stacked);
    if (stacked) {
      for (const [variable, field] of [
        ['--agent-name-height', 'name'],
        ['--agent-status-height', 'status']
      ]) {
        const height = Math.ceil(
          Math.max(...headers.map((header) => header[field].getBoundingClientRect().height))
        );
        grid.style.setProperty(variable, `${height}px`);
      }
    }
    const height = Math.ceil(
      Math.max(...headings.map((heading) => heading.getBoundingClientRect().height))
    );
    grid.style.setProperty('--agent-heading-height', `${height}px`);
    grid
      .closest('.workspace')
      ?.style.setProperty(
        '--agent-strip-height',
        `${Math.ceil(grid.getBoundingClientRect().height)}px`
      );
    mutations.observe(grid, { childList: true, characterData: true, subtree: true });
  }

  function schedule() {
    if (!disposed && frame === null) frame = view.requestAnimationFrame(update);
  }

  function destroy() {
    disposed = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    resize?.disconnect();
    mutations.disconnect();
    view.removeEventListener('resize', schedule);
    view.removeEventListener('pagehide', onPageHide);
    view.removeEventListener('pageshow', schedule);
    document.fonts?.removeEventListener('loadingdone', schedule);
  }

  function onPageHide(event) {
    if (!event.persisted) destroy();
  }

  resize?.observe(grid);
  for (const heading of grid.querySelectorAll('.agent-card-heading')) resize?.observe(heading);
  mutations.observe(grid, { childList: true, characterData: true, subtree: true });
  view.addEventListener('resize', schedule);
  view.addEventListener('pagehide', onPageHide);
  view.addEventListener('pageshow', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
  return { schedule, destroy };
}
