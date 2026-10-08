import { mountCockpit } from './mount.js';
const handle = mountCockpit(document.getElementById('office-root'));
const form = document.getElementById('connect');
const result = document.getElementById('connection-result');
let timer = null;
let controller = null;
let key = '';
async function refresh() {
  controller?.abort();
  controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/cockpit/state', {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    handle.updateState(await response.json());
    result.textContent = 'Terhubung ke workspace';
  } catch (error) {
    if (controller.signal.aborted) return;
    handle.setConnection('offline', `Status workspace gagal dimuat: ${error.message}`);
    result.textContent = error.message;
  } finally {
    clearTimeout(timeout);
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  key = document.getElementById('owner-key').value;
  handle.setConnection('loading');
  if (timer !== null) clearInterval(timer);
  refresh();
  timer = setInterval(refresh, 5000);
});
window.addEventListener('pagehide', () => {
  controller?.abort();
  if (timer !== null) clearInterval(timer);
  handle.dispose();
});
