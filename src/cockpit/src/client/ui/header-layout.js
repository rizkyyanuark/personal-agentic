export function bindHeaderLayout(header, view = window) {
  const workspace = header?.closest('.workspace');
  if (!workspace) return null;
  let frame = null;
  let disposed = false;
  const document = header.ownerDocument;
  const observer = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;

  function update() {
    frame = null;
    if (disposed) return;
    const bottom = Math.ceil(
      header.getBoundingClientRect().bottom - workspace.getBoundingClientRect().top
    );
    workspace.style.setProperty('--office-header-bottom', `${bottom}px`);
  }

  function schedule() {
    if (!disposed && frame === null) frame = view.requestAnimationFrame(update);
  }

  function destroy() {
    disposed = true;
    if (frame !== null) view.cancelAnimationFrame(frame);
    observer?.disconnect();
    view.removeEventListener('resize', schedule);
    view.removeEventListener('pageshow', schedule);
    view.removeEventListener('pagehide', onPageHide);
    document.fonts?.removeEventListener('loadingdone', schedule);
  }

  function onPageHide(event) {
    if (!event.persisted) destroy();
  }

  observer?.observe(header);
  view.addEventListener('resize', schedule);
  view.addEventListener('pageshow', schedule);
  view.addEventListener('pagehide', onPageHide);
  document.fonts?.addEventListener('loadingdone', schedule);
  document.fonts?.ready?.then(schedule);
  schedule();
  return { schedule, destroy };
}
