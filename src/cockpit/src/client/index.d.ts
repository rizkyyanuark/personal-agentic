export type OfficeRoleKey =
  'hq_lab_director' | 'data_engineer' | 'data_scientist' | 'research_scientist' | 'ml_engineer';

export interface CockpitRole {
  key: OfficeRoleKey;
  agentId: string | null;
  name: string;
  role: string;
  color?: string;
}

export interface CockpitRun {
  id: string;
  status: string;
  phase: string;
  summary: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface CockpitAgent {
  office_role: string;
  agent_id: string | null;
  name: string;
  position: string;
  role: string;
  enabled: boolean;
  availability: string;
  in_scope: boolean;
  phase: string;
  active_runs: CockpitRun[];
  latest_result: CockpitRun | null;
  current_activity: CockpitActivity | null;
}

export interface CockpitActivity {
  run_id: string;
  category: 'reading' | 'searching' | 'writing' | 'command' | 'responding' | 'delegating' | 'other';
  state: 'active' | 'completed' | 'failed';
  step_index: number;
  relative_file: string | null;
}

export interface CockpitSnapshot {
  schema_version: number;
  workspace_id: string;
  generated_at: string;
  group_id: string | null;
  setup_required: boolean;
  agents: CockpitAgent[];
  events: Array<{
    id: string | number;
    kind: string;
    office_role: string;
    status: string | null;
    created_at: string;
    summary: string;
    activity: CockpitActivity | null;
  }>;
  totals: {
    agents: number;
    active_runs: number;
    queued: number;
    starting: number;
    working: number;
    awaiting_answer: number;
    awaiting_delegates: number;
    completed: number;
    failed: number;
    backlog: number;
    scheduled: number;
    tokens_processed: number | null;
    tokens_reported_runs: number;
    tokens_total_runs: number;
  };
}

export interface CockpitHandle {
  updateState(snapshot: CockpitSnapshot): void;
  setWorkspace(workspace: CockpitWorkspace): void;
  setConnection(connection: 'loading' | 'offline' | 'error', message?: string): void;
  dispose(): void;
}

export interface CockpitOptions {
  assetBase?: string;
  workspace?: CockpitWorkspace;
  onReady?: () => void;
}

export interface CockpitWorkspace {
  title: string;
  detail: string;
}

export function mountCockpit(container: HTMLElement, options?: CockpitOptions): CockpitHandle;
