export function getAdaptivePixelRatio(value = globalThis.devicePixelRatio || 1) {
  return Math.min(Math.max(value || 1, 1), 2);
}

export function observeDevicePixelRatio(onChange, browser = globalThis) {
  let query;
  function update() {
    query?.removeEventListener('change', update);
    const nativeRatio = browser.devicePixelRatio || 1;
    query = browser.matchMedia(`(resolution: ${nativeRatio}dppx)`);
    query.addEventListener('change', update);
    onChange(getAdaptivePixelRatio(nativeRatio));
  }
  update();
  return () => query.removeEventListener('change', update);
}
