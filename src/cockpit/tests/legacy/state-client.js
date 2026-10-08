import { isPublicLabState } from '../../src/shared/office-contract.js';

const WAKE_COALESCE_MS = 250;

export class StateClient {
  constructor(
    endpoint = '/api/state',
    pollIntervalMs = 5000,
    { now = () => performance.now() } = {}
  ) {
    this.endpoint = endpoint;
    this.pollIntervalMs = pollIntervalMs;
    this.now = now;
    this.timer = null;
    this.listeners = [];
    this.syncListeners = [];
    this.pending = false;
    this.controller = null;
    this.generation = 0;
    this.wakeRequest = null;
    this.lastWakeAt = -Infinity;
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  onSync(callback) {
    this.syncListeners.push(callback);
  }

  start() {
    if (this.timer !== null) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  wake() {
    const now = this.now();
    // Focus, pageshow, and visibility can describe the same foreground transition.
    if (this.wakeRequest || now - this.lastWakeAt < WAKE_COALESCE_MS)
      return this.wakeRequest || Promise.resolve();
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.pending = false;
    this.lastWakeAt = now;
    if (this.timer === null) this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    this.syncListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
    const request = this.poll();
    this.wakeRequest = request;
    request.finally(() => {
      if (this.wakeRequest === request) {
        this.wakeRequest = null;
        this.lastWakeAt = this.now();
      }
    });
    return request;
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.pending = false;
    this.wakeRequest = null;
    this.lastWakeAt = -Infinity;
  }

  async poll() {
    if (this.pending) return;
    this.pending = true;
    const controller = new AbortController();
    this.controller = controller;
    const generation = this.generation;
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(this.endpoint, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (generation !== this.generation) return;
      if (!response.ok && response.status !== 503) throw new Error('HTTP ' + response.status);
      const state = await response.json();
      if (generation !== this.generation) return;
      if (!isPublicLabState(state)) throw new Error('invalid public state contract');
      if (!response.ok && state.connection !== 'error') throw new Error('HTTP ' + response.status);
      this.emit(state);
    } catch (error) {
      if (generation !== this.generation) return;
      console.warn('Status agent tidak dapat dimuat:', error);
      this.emit({
        connection: 'offline',
        now: new Date().toISOString(),
        message: 'Status agent tidak dapat dimuat. Coba lagi sebentar.',
        agents: {},
        feed: [],
        totals: null,
        queue: null
      });
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) {
        this.controller = null;
        this.pending = false;
      }
    }
  }

  emit(data) {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error('State listener error:', error);
      }
    });
  }
}
