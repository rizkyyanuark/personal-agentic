import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.AE_TEST_URL;
const org = process.env.AE_TEST_ORG;
const directory = process.env.AE_TEST_PROOF_DIR;
assert(base && org && directory, 'Set AE_TEST_URL, AE_TEST_ORG and AE_TEST_PROOF_DIR.');
const url = new URL(base);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '18768', 'Use the isolated drain candidate on loopback port18768.');
assert(path.resolve(org).includes(`${path.sep}dep-002${path.sep}`), 'Use the disposable organization under scratch/dep-002.');
await mkdir(directory, { recursive: true });
const token = (await readFile(path.join(org, '.state', 'owner.key'), 'utf8')).trim();
const proofPath = path.join(directory, 'api-proof.json');
const proof = { base, mocks: false, results: {}, restart: 'pending' };

async function call(route, { method = 'GET', body, workspace = 'default', expected = 200, auth = token } = {}) {
  const response = await fetch(`${base}/api${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-ae-workspace': workspace, ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, expected, `${method} ${route}: unexpected HTTP status; inspect response privately.`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function control(action, generation, extra = {}, expected = 200) {
  return call('/deployment-drain', { method: 'POST', body: { action, generation, ...extra }, expected });
}
async function until(read, accepts, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (accepts(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Real application did not reach the expected state within the smoke budget.');
}

if (process.argv.includes('--after-restart')) {
  const saved = JSON.parse(await readFile(proofPath, 'utf8'));
  const state = await call('/deployment-drain');
  assert.equal(state.phase, 'sealed');
  assert.equal(state.generation, saved.generation);
  assert.equal(state.active_operations, 0);
  await control('resume', randomUUID(), {}, 409);
  await control('resume', saved.generation);
  await control('resume', saved.generation);
  assert.equal((await call('/state')).maintenance.phase, 'open');
  saved.restart = 'sealed persisted and exact owner resumed';
  const resumed = await call('/agents/ceo/terminal', { method: 'POST', body: { id: randomUUID(), command: "printf 'drain-resumed-proof'" } });
  saved.results.newWorkAfterResume = resumed.status;
  const completed = await until(() => call(`/agents/ceo/terminal/${resumed.id}`), run => run.status !== 'running');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.exit_code, 0);
  assert(completed.output.includes('drain-resumed-proof'));
  await writeFile(proofPath, `${JSON.stringify(saved, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'after-restart', result: 'passed', restart: saved.restart, mocks: false }));
} else {
  await call('/deployment-drain', { auth: '', expected: 401 });
  await call('/deployment-drain', { auth: 'invalid-drain-owner', expected: 401 });
  proof.results.authorization = 'anonymous and invalid bearer401';
  const initial = await call('/state');
  assert.equal(initial.maintenance.phase, 'open');
  const original = initial.agents.find(agent => agent.id === 'ceo');
  assert(original);
  const fixture = JSON.parse(await readFile(path.join(directory, 'provider-private.json'), 'utf8'));
  assert(/^\/tmp\/personal-agentic-dep002-[a-f0-9-]{36}$/.test(fixture.remotePath), 'Use the owned SSH fixture.');
  const workstation = await call('/workstations', { method: 'POST', body: { workstation: { id: '', name: 'Drain API proof SSH', hostname: fixture.hostname, host_ip: '', port: fixture.port, username: fixture.username, auth: 'key', ssh_alias: '', ssh_key_path: '/run/ae-ssh/mini-project-key.pem', secret_saved: false }, secret: null, clear_secret: false } });
  const attached = await call('/workspaces/probe', { method: 'POST', body: { path: fixture.remotePath, ssh_host: workstation.id, harness: 'antigravity', runtime_id: null } });
  const catalog = await call(`/harness/settings?harness=antigravity&ssh_host=${encodeURIComponent(workstation.id)}`);
  assert(catalog.models.some(model => model.slug === catalog.model), 'Use a real catalog for the terminal profile.');
  await call('/agents/ceo', { method: 'PUT', body: { ...original, harness: 'antigravity', model: catalog.model, reasoning: '', enabled: false, workdir: attached.workspace, timeout_seconds: 30 } });
  const second = await call('/tenants', { method: 'POST', body: { name: `Drain smoke ${randomUUID()}` } });
  const terminalId = randomUUID();
  const terminalBody = { id: terminalId, command: "sleep 3; printf 'drain-accepted-proof'" };
  await call('/agents/ceo/terminal', { method: 'POST', body: terminalBody });
  const generation = randomUUID();
  await control('begin', generation, { timeout_seconds: 30 });
  const active = await call('/deployment-drain');
  assert.equal(active.phase, 'draining');
  assert(active.active_operations > 0);
  assert.equal((await call('/state', { workspace: second.id })).maintenance.phase, 'draining');
  await control('begin', randomUUID(), { timeout_seconds: 30 }, 409);
  await control('resume', randomUUID(), {}, 409);
  await control('seal', generation, {}, 409);
  await call('/agents/ceo/terminal', { method: 'POST', body: terminalBody });
  await call('/agents/ceo/terminal', { method: 'POST', body: { id: randomUUID(), command: 'printf forbidden' }, expected: 503 });
  for (const workspace of ['default', second.id]) {
    await call('/messages', { method: 'POST', body: { id: randomUUID(), group_id: 'general', body: 'must not start new work', recipients: [], reply_to: null }, workspace, expected: 503 });
    await call('/artifacts/missing/index', { method: 'POST', body: {}, workspace, expected: 503 });
    await call('/actions/missing/invoke', { method: 'POST', body: {}, workspace, expected: 503 });
  }
  await call('/tenants', { method: 'POST', body: { name: 'must not create' }, expected: 503 });
  const completed = await until(() => call(`/agents/ceo/terminal/${terminalId}`), run => run.status !== 'running');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.exit_code, 0);
  assert(completed.output.includes('drain-accepted-proof'));
  proof.results.acceptedTerminal = { status: completed.status, exit_code: completed.exit_code, outputMarker: true, transport: 'SSH' };
  proof.results.globalAdmission = 'new messages/index/actions503 in two workspaces; tenant503';
  await control('resume', generation);
  const expiring = randomUUID();
  await control('begin', expiring, { timeout_seconds: 1 });
  await until(() => call('/state'), state => state.maintenance.phase === 'open', 5000);
  await control('resume', expiring);
  proof.results.timeout = 'real one-second test lease reopened; helper production budget900seconds';
  const sealed = randomUUID();
  await control('begin', sealed, { timeout_seconds: 30 });
  await until(() => call('/deployment-drain'), state => state.active_operations === 0 && state.inflight_operations === 0);
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${base}/api/deployment-drain`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'seal', generation: sealed }), signal: AbortSignal.timeout(15000) });
    if (response.status === 200) { assert.equal((await response.json()).phase, 'sealed'); break; }
    assert.equal(response.status, 409);
    assert(attempt < 20, 'Dispatcher did not quiesce for seal.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await call('/groups/general/messages');
  const sealedStatus = await call('/deployment-drain');
  assert.equal(sealedStatus.phase, 'sealed');
  assert.equal(sealedStatus.active_operations, 0);
  proof.generation = sealed;
  proof.results.seal = 'no active work; historical reads remain usable';
  await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'before-restart', result: 'passed', acceptedTerminal: proof.results.acceptedTerminal, globalAdmission: proof.results.globalAdmission, mocks: false }));
}
