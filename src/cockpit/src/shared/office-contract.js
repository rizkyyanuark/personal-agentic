export const OFFICE_ROLES = Object.freeze([
  { slug: 'hq', key: 'hq_lab_director', name: 'Orion', role: 'Lab Director', color: '#7756a7' },
  {
    slug: 'data-engineer',
    key: 'data_engineer',
    name: 'Nova',
    role: 'Data Engineer',
    color: '#176e78'
  },
  {
    slug: 'data-scientist',
    key: 'data_scientist',
    name: 'Atlas',
    role: 'Data Scientist',
    color: '#3465b4'
  },
  {
    slug: 'research-scientist',
    key: 'research_scientist',
    name: 'Lyra',
    role: 'Research Scientist',
    color: '#a83c6a'
  },
  { slug: 'ml-engineer', key: 'ml_engineer', name: 'Axiom', role: 'ML Engineer', color: '#247c5b' }
]);

export const OFFICE_ROLE_BY_SLUG = Object.freeze(
  Object.fromEntries(OFFICE_ROLES.map(({ slug, key }) => [slug, key]))
);

export const OFFICE_ARCHIVED_FEED_ROLES = Object.freeze([
  { slug: 'model-validator', key: 'archived_model_validator', label: 'Arsip · Model Validator' },
  {
    slug: 'mlops-platform-engineer',
    key: 'archived_mlops_platform_engineer',
    label: 'Arsip · MLOps & Platform'
  }
]);

export const OFFICE_FEED_ROLE_BY_SLUG = Object.freeze(
  Object.fromEntries(
    [...OFFICE_ROLES, ...OFFICE_ARCHIVED_FEED_ROLES].map(({ slug, key }) => [slug, key])
  )
);

export const CONNECTION_STATES = Object.freeze(['live', 'empty', 'error', 'offline']);
export const AGENT_STATES = Object.freeze([
  'bekerja',
  'menunggu_persetujuan',
  'siaga',
  'gagal',
  'queued',
  'starting',
  'awaiting_answer',
  'awaiting_delegates',
  'unavailable',
  'unmapped',
  'paused',
  'unattached',
  'offline_runtime',
  'checking',
  'filtered'
]);

const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;

export function isPublicLabState(value) {
  if (!value || typeof value !== 'object' || !CONNECTION_STATES.includes(value.connection))
    return false;
  if (Number.isNaN(Date.parse(value.now)) || !value.agents || typeof value.agents !== 'object')
    return false;
  if (!Array.isArray(value.feed)) return false;

  if (
    value.connection === 'offline' ||
    (value.source === 'personal-agentic' && value.connection === 'error')
  )
    return true;
  if (!value.totals || !value.queue) return false;
  if (!['tasks', 'completed', 'events'].every((key) => nonNegativeInteger(value.totals[key])))
    return false;
  if (
    !['queued', 'running', 'waiting_approval', 'failed', 'stale'].every((key) =>
      nonNegativeInteger(value.queue[key])
    )
  )
    return false;
  if (Object.keys(value.agents).length !== OFFICE_ROLES.length) return false;
  return OFFICE_ROLES.every(({ key }) => {
    const agent = value.agents[key];
    return agent && AGENT_STATES.includes(agent.state) && typeof agent.task === 'string';
  });
}

export const OFFICE_CONFIG = Object.freeze({ roles: OFFICE_ROLES });
