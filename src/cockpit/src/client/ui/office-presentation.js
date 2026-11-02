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
  tv: 'Menonton TV di lounge',
  ps: 'Bermain PS di lounge',
  coffee: 'Menikmati kopi di pantry',
  water: 'Mengambil air di pantry',
  guitar: 'Bermain gitar',
  window: 'Bersantai di dekat jendela',
  reading: 'Membaca di dekat rak buku',
  meeting: 'Duduk di area meeting',
  desk: 'Duduk di meja',
  board: 'Berdiri dekat papan'
});

const unavailable = () => ({ state: null, task: '', available: false });

const DESTINATIONS = {
  'sofa:left': ['tv', 'lounge'],
  'sofa:right': ['ps', 'lounge'],
  'coffee:left': ['coffee', 'pantry'],
  'coffee:right': ['coffee', 'pantry'],
  'pantry:water': ['water', 'pantry'],
  'reading:left': ['reading', 'rak buku'],
  'reading:right': ['reading', 'rak buku'],
  guitar: ['guitar', 'spot gitar'],
  window: ['window', 'jendela'],
  'standing:hq': ['board', 'papan']
};

function visualActivity(sample) {
  if (typeof sample === 'object' && typeof sample?.phase !== 'string') return null;
  const kind = typeof sample === 'string' ? sample : sample?.kind;
  if (!Object.hasOwn(VISUAL_ACTIVITIES, kind)) return null;
  const destination =
    kind === 'walking'
      ? sample?.targetDestinationId || sample?.destinationId
      : sample?.destinationId;
  const target = DESTINATIONS[destination];
  const activity = kind === 'sofa' && target ? target[0] : kind;
  const place =
    target?.[1] ||
    (destination?.startsWith('meeting:')
      ? 'area meeting'
      : destination?.startsWith('desk:')
        ? 'meja kerja'
        : null);
  return {
    kind: activity,
    text: kind === 'walking' && place ? `Menuju ${place}` : VISUAL_ACTIVITIES[activity],
    label: 'Suasana ilustratif'
  };
}

export function didObservedRunSucceed(previous, next) {
  return Boolean(
    previous?.state === 'bekerja' &&
    next?.state === 'siaga' &&
    previous.available &&
    next.available &&
    previous.activeRunIds?.length === 1 &&
    next.activeRunIds?.length === 0 &&
    next.latestResult?.status === 'succeeded' &&
    next.latestResult.runId === previous.activeRunIds[0]
  );
}

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
          const visual = motionAllowed && facts.state === 'siaga' ? visuals.get(key) : null;
          return [
            key,
            {
              operational: { ...facts },
              visual: visual ? { ...visual } : null,
              workingBubble:
                dataFresh && isVisible && facts.state === 'bekerja'
                  ? {
                      kind: 'work',
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
                    ...(Array.isArray(agent.activeRunIds) &&
                    agent.activeRunIds.every(
                      (id) => typeof id === 'string' && id.length > 0 && id.length <= 128
                    )
                      ? { activeRunIds: [...agent.activeRunIds] }
                      : {}),
                    ...(typeof agent.latestResult?.runId === 'string' &&
                    agent.latestResult.runId.length > 0 &&
                    agent.latestResult.runId.length <= 128 &&
                    ['succeeded', 'failed', 'timed_out', 'interrupted', 'cancelled'].includes(
                      agent.latestResult.status
                    )
                      ? {
                          latestResult: {
                            runId: agent.latestResult.runId,
                            status: agent.latestResult.status
                          }
                        }
                      : {}),
                    ...(typeof agent.runtimeHint === 'string'
                      ? { runtimeHint: agent.runtimeHint.slice(0, 180) }
                      : {}),
                    ...(Object.hasOwn(agent, 'latestFailure')
                      ? { latestFailure: agent.latestFailure === true }
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
        if (operational.get(key)?.state !== nextOperational.get(key)?.state) {
          visuals.delete(key);
        }
      }
      connection = nextConnection;
      operational = nextOperational;
      dataFresh = nextFresh;
      if (!allowAmbient()) {
        visuals.clear();
      }
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
      if (!allowAmbient()) {
        visuals.clear();
      }
    },
    setVisualActivities(samples) {
      if (disposed) return;
      visuals.clear();
      if (!allowAmbient() || !samples || typeof samples !== 'object') return;
      for (const key of keys) {
        if (operational.get(key)?.state !== 'siaga' || !Object.hasOwn(samples, key)) continue;
        const sample = samples[key];
        const visual = visualActivity(sample);
        if (visual) {
          visuals.set(key, visual);
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
