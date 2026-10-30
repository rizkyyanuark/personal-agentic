import { AGENT_STATES, isPublicLabState } from '../../shared/office-contract.js';

const ROLE_DESCRIPTIONS = Object.freeze({
  hq_lab_director: 'Koordinasi lab dan keputusan operasional.',
  data_engineer: 'Penyiapan dan validasi data.',
  data_scientist: 'Analisis data dan eksperimen model.',
  research_scientist: 'Penelaahan metode dan rancangan riset.',
  ml_engineer: 'Pengembangan alur pelatihan dan inferensi model.'
});

const VISUAL_ACTIVITIES = Object.freeze({
  'standing-up': 'Berdiri dari kursi',
  settling: 'Menyesuaikan posisi duduk',
  walking: 'Berjalan di kantor',
  sofa: 'Duduk di sofa',
  coffee: 'Menikmati kopi',
  reading: 'Membaca',
  meeting: 'Duduk di area meeting',
  desk: 'Duduk di meja',
  board: 'Berdiri dekat papan'
});

const unavailable = () => ({ state: null, task: '', available: false });

export function createOfficePresentation(roles, { visible = true, reducedMotion = false } = {}) {
  const keys = [
    ...new Set(
      (Array.isArray(roles) ? roles : [])
        .map((role) => role?.key)
        .filter((key) => Object.hasOwn(ROLE_DESCRIPTIONS, key))
    )
  ];
  let connection = 'loading';
  let syncing = false;
  let dataFresh = false;
  let isVisible = visible === true;
  let prefersReducedMotion = reducedMotion !== false;
  let disposed = false;
  let operational = new Map();
  const visuals = new Map();
  const allowAmbient = () => dataFresh && isVisible && !prefersReducedMotion && !disposed;

  function getSnapshot() {
    const motionAllowed = allowAmbient();
    return {
      connection,
      syncing,
      gates: {
        dataFresh,
        visible: isVisible,
        reducedMotion: prefersReducedMotion,
        allowAmbient: motionAllowed,
        allowWorkMotion: motionAllowed
      },
      agents: Object.fromEntries(
        keys.map((key) => {
          const facts = operational.get(key) || unavailable();
          const kind = motionAllowed && facts.state === 'siaga' ? visuals.get(key) : null;
          return [
            key,
            {
              operational: { ...facts },
              visual: kind
                ? { kind, text: VISUAL_ACTIVITIES[kind], label: 'Suasana ilustratif' }
                : null,
              workingBubble:
                dataFresh && isVisible && facts.state === 'bekerja'
                  ? {
                      kind: 'work',
                      cls: 'hi',
                      text: facts.task || ROLE_DESCRIPTIONS[key],
                      label: 'Tugas publik'
                    }
                  : null
            }
          ];
        })
      )
    };
  }

  return {
    beginSync() {
      if (disposed || !isVisible) return;
      syncing = true;
      dataFresh = false;
      visuals.clear();
    },
    receive(state) {
      if (disposed) return;
      syncing = false;
      let nextConnection = 'offline';
      let nextFresh = false;
      let nextOperational = new Map();
      try {
        if (isPublicLabState(state)) {
          nextConnection = state.connection;
          const available = nextConnection === 'live' || nextConnection === 'empty';
          for (const key of keys) {
            const agent = available ? state.agents[key] : null;
            const validAgent =
              agent && AGENT_STATES.includes(agent.state) && typeof agent.task === 'string';
            nextOperational.set(
              key,
              validAgent
                ? {
                    state: agent.state,
                    ...(typeof agent.runtimeHint === 'string'
                      ? { runtimeHint: agent.runtimeHint.slice(0, 180) }
                      : {}),
                    ...(Object.hasOwn(agent, 'latestFailure')
                      ? { latestFailure: agent.latestFailure === true }
                      : {}),
                    ...(agent.state === 'siaga' && agent.cardState === 'selesai'
                      ? { cardState: 'selesai' }
                      : {}),
                    ...(agent.state === 'siaga' && typeof agent.resultHint === 'string'
                      ? { resultHint: agent.resultHint.slice(0, 180) }
                      : {}),
                    task: agent.task
                      .replace(/[\p{Cc}\s]+/gu, ' ')
                      .trim()
                      .slice(0, 180),
                    available: true
                  }
                : unavailable()
            );
          }
          nextFresh = available && state.queue.stale === 0 && isVisible;
        }
      } catch {
        nextConnection = 'offline';
        nextFresh = false;
        nextOperational = new Map();
      }
      for (const key of keys) {
        if (operational.get(key)?.state !== nextOperational.get(key)?.state) visuals.delete(key);
      }
      connection = nextConnection;
      operational = nextOperational;
      dataFresh = nextFresh;
      if (!allowAmbient()) visuals.clear();
    },
    setEnvironment(environment = {}) {
      if (disposed || !environment || typeof environment !== 'object') return;
      if (Object.hasOwn(environment, 'visible')) {
        const nextVisible = environment.visible === true;
        if (nextVisible !== isVisible) dataFresh = false;
        isVisible = nextVisible;
        if (!isVisible) syncing = false;
      }
      if (Object.hasOwn(environment, 'reducedMotion')) {
        prefersReducedMotion = environment.reducedMotion !== false;
      }
      if (!allowAmbient()) visuals.clear();
    },
    setVisualActivities(samples) {
      if (disposed) return;
      visuals.clear();
      if (!allowAmbient() || !samples || typeof samples !== 'object') return;
      for (const key of keys) {
        if (operational.get(key)?.state !== 'siaga' || !Object.hasOwn(samples, key)) continue;
        const kind = samples[key];
        if (typeof kind === 'string' && Object.hasOwn(VISUAL_ACTIVITIES, kind)) {
          visuals.set(key, kind);
        }
      }
    },
    getSnapshot,
    dispose() {
      disposed = true;
      connection = 'offline';
      syncing = false;
      dataFresh = false;
      isVisible = false;
      operational.clear();
      visuals.clear();
    }
  };
}
