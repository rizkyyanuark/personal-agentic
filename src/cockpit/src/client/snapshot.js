import { OFFICE_ROLES } from '../shared/office-contract.js';

const COUNTS = [
  'agents',
  'active_runs',
  'queued',
  'starting',
  'working',
  'awaiting_answer',
  'awaiting_delegates',
  'completed',
  'failed',
  'backlog',
  'scheduled'
];
const PHASES = {
  idle: ['siaga', 'Tidak ada run aktif.'],
  queued: ['queued', 'Run menunggu giliran.'],
  starting: ['starting', 'Runtime sedang memulai run.'],
  working: ['bekerja', 'Agent sedang menjalankan run.'],
  awaiting_answer: ['awaiting_answer', 'Run menunggu jawaban pengguna.'],
  awaiting_delegates: ['awaiting_delegates', 'Run menunggu hasil agent delegasi.'],
  unknown: ['unavailable', 'Status eksekusi belum dapat dipastikan.']
};
const UNAVAILABLE = {
  unmapped: ['unmapped', 'Slot belum dipetakan ke agent organisasi.'],
  deleted: ['unmapped', 'Agent yang dipetakan sudah dihapus.'],
  paused: ['paused', 'Agent sedang dijeda.'],
  unattached: ['unattached', 'Agent belum memiliki runtime atau workdir.'],
  offline: ['offline_runtime', 'Runtime agent tidak terhubung.'],
  checking: ['checking', 'Koneksi runtime sedang diperiksa.'],
  unknown: ['unavailable', 'Koneksi runtime belum dapat dipastikan.']
};
const RESULTS = {
  succeeded: 'Selesai',
  failed: 'Gagal',
  timed_out: 'Batas waktu tercapai',
  interrupted: 'Terhenti',
  cancelled: 'Dibatalkan'
};
const text = (value, max = 180) =>
  typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\s]+/gu, ' ')
        .trim()
        .slice(0, max)
    : '';
const time = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const ACTIVITY = {
  reading: ['Membaca file', 'Pembacaan file selesai'],
  searching: ['Mencari informasi', 'Pencarian selesai'],
  writing: ['Mengubah file', 'Perubahan file selesai'],
  command: ['Menjalankan perintah', 'Perintah selesai'],
  responding: ['Menyusun jawaban', 'Jawaban selesai'],
  delegating: ['Menjalankan subagent', 'Langkah subagent selesai'],
  other: ['Menjalankan langkah pekerjaan', 'Langkah pekerjaan selesai']
};
const TOOL_LABELS = {
  reading: 'Membaca',
  searching: 'Pencarian',
  writing: 'Menulis',
  command: 'Terminal',
  responding: 'Jawaban',
  delegating: 'Delegasi',
  other: 'Aktivitas'
};

function eventToolLabel(event) {
  if (typeof event?.tool === 'string' && event.tool.trim()) {
    return text(event.tool, 60);
  }
  const category = event?.activity?.category;
  if (typeof category === 'string' && category) {
    return TOOL_LABELS[category] || text(category, 60);
  }
  return null;
}

function activityText(activity) {
  if (!activity) return '';
  const labels = ACTIVITY[activity.category];
  if (!labels || !['active', 'completed', 'failed'].includes(activity.state))
    throw new TypeError('Invalid native activity');
  const label =
    activity.state === 'failed'
      ? 'Langkah pekerjaan gagal'
      : labels[activity.state === 'active' ? 0 : 1];
  const file = text(activity.relative_file, 160);
  return file ? `${label} · ${file}` : label;
}

export function createDisconnectedState(connection = 'offline') {
  return {
    source: 'personal-agentic',
    connection,
    now: new Date().toISOString(),
    agents: {},
    feed: [],
    totals: null,
    queue: null,
    office: null
  };
}

export function projectCockpitSnapshot(snapshot) {
  if (
    snapshot?.schema_version !== 1 ||
    !time(snapshot.generated_at) ||
    !Array.isArray(snapshot.agents) ||
    snapshot.agents.length !== OFFICE_ROLES.length ||
    !Array.isArray(snapshot.events)
  ) {
    throw new TypeError('Invalid cockpit snapshot');
  }
  const counts = {};
  for (const key of COUNTS) {
    const count = snapshot.totals?.[key];
    if (!Number.isSafeInteger(count) || count < 0)
      throw new TypeError(`Invalid cockpit count: ${key}`);
    counts[key] = count;
  }
  const tokens = {
    processed: snapshot.totals.tokens_processed ?? null,
    reportedRuns: snapshot.totals.tokens_reported_runs ?? 0,
    totalRuns: snapshot.totals.tokens_total_runs ?? 0
  };
  if (
    (tokens.processed !== null &&
      (!Number.isSafeInteger(tokens.processed) || tokens.processed < 0)) ||
    !Number.isSafeInteger(tokens.reportedRuns) ||
    !Number.isSafeInteger(tokens.totalRuns) ||
    tokens.reportedRuns < 0 ||
    tokens.totalRuns < tokens.reportedRuns ||
    (tokens.processed !== null && tokens.reportedRuns === 0)
  )
    throw new TypeError('Invalid cockpit token usage');
  const agents = {};
  const identities = {};
  const history = [];
  const ids = new Set();
  for (const slot of snapshot.agents) {
    const role = OFFICE_ROLES.find((item) => item.key === slot.office_role);
    if (
      !role ||
      Object.hasOwn(agents, role.key) ||
      !Array.isArray(slot.active_runs) ||
      typeof slot.in_scope !== 'boolean'
    )
      throw new TypeError('Invalid office role mapping');
    if (
      slot.agent_id !== null &&
      (typeof slot.agent_id !== 'string' || !slot.agent_id || ids.has(slot.agent_id))
    )
      throw new TypeError('Invalid agent identity');
    if (slot.agent_id) ids.add(slot.agent_id);
    let operational;
    if (!slot.in_scope) operational = ['filtered', 'Agent berada di luar filter tim.'];
    else if (
      slot.active_runs.length > 0 &&
      slot.phase !== 'unknown' &&
      !['offline', 'checking', 'unmapped', 'deleted'].includes(slot.availability)
    )
      operational = PHASES[slot.phase];
    else if (slot.availability !== 'ready') operational = UNAVAILABLE[slot.availability];
    else operational = PHASES[slot.phase];
    if (!operational) throw new TypeError('Unknown cockpit availability or phase');
    const [state, message] = operational;
    const phaseHint =
      slot.active_runs.length > 0 ? PHASES[slot.phase]?.[1] || PHASES.unknown[1] : '';
    const runtimeHint =
      slot.availability === 'ready'
        ? 'Runtime terhubung'
        : UNAVAILABLE[slot.availability]?.[1] || 'Status runtime belum tersedia';
    let task =
      ['offline', 'checking'].includes(slot.availability) && phaseHint
        ? `${phaseHint} ${message}`
        : message;
    if (state === 'bekerja' && slot.current_activity) {
      if (!slot.active_runs.some((run) => run.id === slot.current_activity.run_id))
        throw new TypeError('Activity does not belong to an active run');
      task = activityText(slot.current_activity);
    }
    const latest = slot.in_scope ? slot.latest_result : null;
    const resultLabel = latest && RESULTS[latest.status];
    const finishedAge = time(latest?.ended_at)
      ? Date.parse(snapshot.generated_at) - Date.parse(latest.ended_at)
      : null;
    const idleResult = state === 'siaga' && slot.active_runs.length === 0 && resultLabel;
    agents[role.key] = {
      state,
      runtimeHint,
      ...(idleResult
        ? {
            resultHint: `Tugas terakhir: ${resultLabel}`,
            ...(finishedAge !== null && finishedAge >= 0 && finishedAge < 60000
              ? { cardState: 'selesai' }
              : {})
          }
        : {}),
      latestFailure:
        slot.in_scope &&
        ['failed', 'timed_out', 'interrupted'].includes(slot.latest_result?.status),
      task:
        idleResult && text(latest.summary)
          ? text(latest.summary)
          : slot.active_runs.length > 1
            ? `${slot.active_runs.length} run aktif; ${task}`
            : task
    };
    identities[role.key] = {
      agentId: slot.agent_id,
      name: text(slot.name, 64) || role.name,
      role: slot.agent_id ? text(slot.position, 100) : role.role
    };
    if (
      latest &&
      ['succeeded', 'failed', 'timed_out', 'interrupted', 'cancelled'].includes(latest.status)
    ) {
      history.push({
        id: text(latest.id),
        role: role.key,
        status: latest.status,
        text: text(latest.summary),
        time: time(latest.ended_at) ? latest.ended_at : latest.created_at
      });
    }
  }
  const feed = snapshot.events.slice(0, 30).map((event) => {
    if (!OFFICE_ROLES.some((role) => role.key === event.office_role) || !time(event.created_at))
      throw new TypeError('Invalid cockpit event');
    return {
      id: text(String(event.id)),
      role: event.office_role,
      kind: text(event.kind, 64),
      status: text(event.status, 32),
      text: text(event.summary),
      time: event.created_at,
      tool: eventToolLabel(event)
    };
  });
  return {
    source: 'personal-agentic',
    connection: 'live',
    now: snapshot.generated_at,
    identities,
    agents,
    feed,
    totals: {
      tasks: counts.active_runs,
      completed: counts.completed,
      failed: counts.failed,
      events: feed.length
    },
    queue: {
      queued: counts.queued,
      running: counts.working,
      waiting_approval: 0,
      failed: counts.failed,
      stale: 0
    },
    office: {
      counts,
      tokens,
      history: history.sort((a, b) => Date.parse(b.time) - Date.parse(a.time)),
      groupId: snapshot.group_id,
      setupRequired: snapshot.setup_required === true
    }
  };
}
