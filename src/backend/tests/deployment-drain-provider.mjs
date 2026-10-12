import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
const directory = path.resolve(process.env.AE_TEST_PROOF_DIR ?? 'scratch/dep-002/proof');
assert(directory.includes(`${path.sep}dep-002${path.sep}`), 'Use ignored DEP-002 proof storage.');
await mkdir(directory, { recursive: true });
const privatePath = path.join(directory, 'provider-private.json');
const proofPath = path.join(directory, 'provider-proof.json');
const active = new Set(['queued', 'starting', 'running', 'waiting']);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function sshPython(source) {
  const child = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const process = child.spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ClearAllForwardings=yes', 'ec2', 'python3 -'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let count = 0;
    const timer = setTimeout(() => process.kill(), 30000);
    process.stdout.on('data', chunk => { count += chunk.length; if (count <= 65536) chunks.push(chunk); else process.kill(); });
    process.stderr.resume();
    process.on('error', reject);
    process.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || count > 65536) reject(new Error('Bounded SSH fixture operation failed; inspect transport privately.'));
      else resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    });
    process.stdin.end(source);
  });
}

async function fixtureSnapshot(remotePath) {
  assert(/^\/tmp\/personal-agentic-dep002-[a-f0-9-]{36}$/.test(remotePath), 'Remote fixture must be the owned temporary directory.');
  return sshPython(`import hashlib,json,pathlib\nrequested=pathlib.Path(${JSON.stringify(remotePath)})\nassert not requested.is_symlink()\np=requested.resolve()\nassert p==requested and p.parent==pathlib.Path('/tmp') and p.is_dir()\nfiles=sorted(p.rglob('*'))\nassert len(files)<20 and not any(f.is_symlink() for f in files)\nprint(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files if f.is_file()}))\n`);
}

if (process.argv.includes('--prepare')) {
  const { stdout: configText } = await execute('ssh', ['-G', 'ec2'], { timeout: 10000, maxBuffer: 65536 });
  const config = Object.fromEntries(configText.split(/\r?\n/).map(line => line.split(/ (.*)/s).slice(0, 2)));
  const { stdout: catalogText } = await execute('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ClearAllForwardings=yes', 'ec2', "bash -lic 'agy models'"], { timeout: 35000, maxBuffer: 65536 });
  const models = catalogText.split(/\r?\n/).map(line => line.split('\t')[0].trim()).filter(slug => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(slug));
  const model = models.find(slug => slug.includes('flash')) ?? models[0];
  assert(model, 'The real SSH Antigravity catalog has no valid model.');
  const suffix = randomUUID();
  const remotePath = `/tmp/personal-agentic-dep002-${suffix}`;
  const marker = `DEP002_NATIVE_${randomUUID()}`;
  const snapshot = await sshPython(`import hashlib,json,pathlib\np=pathlib.Path(${JSON.stringify(remotePath)})\nassert p.parent==pathlib.Path('/tmp') and not p.exists()\np.mkdir(mode=0o700)\n(p/'proof.txt').write_text(${JSON.stringify(`${marker}\n`)})\n(p/'preserve.txt').write_text('PRESERVE_REMOTE_FIXTURE\\n')\nprint(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.iterdir()) if f.is_file()}))\n`);
  await writeFile(privatePath, `${JSON.stringify({ remotePath, marker, snapshot, model, hostname: config.hostname, username: config.user, port: Number(config.port) }, null, 2)}\n`);
  console.log(JSON.stringify({ stage: 'prepared', result: 'passed', fixtureFiles: Object.keys(snapshot), catalogModel: model, originalControllerChanged: false, providerTurns: 0 }));
} else {
  const base = process.env.AE_TEST_URL;
  const org = process.env.AE_TEST_ORG;
  assert(base && org, 'Set AE_TEST_URL and AE_TEST_ORG.');
  const url = new URL(base);
  assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '18768' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use only the disposable HTTP drain candidate origin on port 18768.');
  assert(path.resolve(org).includes(`${path.sep}dep-002${path.sep}`), 'Use only the disposable DEP-002 organization.');
  const token = (await readFile(path.join(org, '.state', 'owner.key'), 'utf8')).trim();
  const fixture = JSON.parse(await readFile(privatePath, 'utf8'));
  assert.deepEqual(await fixtureSnapshot(fixture.remotePath), fixture.snapshot, 'The prepared fixture changed before verification.');
  const proof = { result: 'failed', harness: 'antigravity', transport: 'SSH', mocks: false, providerTurns: 0, maxActiveProviderTurns: 0, observations: [], nativeReceiptRuns: [] };
  let generation;
  let groupId;
  const ownAgentIds = [];
  const ownRunIds = new Set();
  let messageId;
  let executionError;

  async function call(route, { method = 'GET', body, expected = 200 } = {}) {
    const response = await fetch(`${base}/api${route}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-ae-workspace': 'default' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, expected, `${method} ${route}: unexpected HTTP status; inspect candidate response privately.`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const control = (action, expected = 200) => call('/deployment-drain', { method: 'POST', body: { action, generation, ...(action === 'begin' ? { timeout_seconds: 900 } : {}) }, expected });
  const ownRuns = state => {
    const runs = state.runs.filter(run => run.message_id === messageId && run.group_id === groupId);
    for (const run of runs) ownRunIds.add(run.id);
    return runs;
  };

  async function receipt(run) {
    assert(run.native_session_id, 'Actual native conversation is missing.');
    assert(Number.isInteger(run.remote_pid) && run.remote_pid > 0, 'Actual SSH process receipt is missing.');
    assert.equal(path.posix.basename(run.executable), 'agy');
    assert.equal(run.profile.harness, 'antigravity');
    assert.equal(run.profile.permission, 'read-only');
    assert.equal(run.cwd, fixture.remotePath);
    const events = await call(`/runs/${run.id}/events`);
    const frames = [];
    for (const event of events) {
      if (event.kind !== 'run.output' || typeof event.payload?.line !== 'string' || event.payload.stderr !== false) continue;
      try { frames.push(JSON.parse(event.payload.line)); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    const started = frames.filter(frame => frame.type === 'ae.remote.started');
    const finished = frames.filter(frame => frame.type === 'ae.remote.finished');
    assert.equal(started.length, 1);
    assert.equal(finished.length, 1);
    assert.equal(started[0].pid, run.remote_pid);
    assert.equal(started[0].cwd, fixture.remotePath);
    assert.equal(path.posix.basename(started[0].executable), 'agy');
    assert.equal(finished[0].exit_code, 0);
    assert.equal(finished[0].status, null);
    proof.nativeReceiptRuns.push({ runId: run.id, kind: run.kind, status: run.status, exitCode: run.exit_code, nativeConversationConfirmed: true, startedReceipt: true, finishedReceipt: true });
  }

  try {
    const remoteProcesses = await sshPython("import json,os,pathlib\ncount=0\nfor p in pathlib.Path('/proc').iterdir():\n if not p.name.isdigit(): continue\n try:\n  if p.stat().st_uid!=os.getuid(): continue\n  args=(p/'cmdline').read_bytes().split(b'\\0')\n  if args and pathlib.Path(os.fsdecode(args[0])).name=='agy': count+=1\n except (FileNotFoundError,ProcessLookupError,PermissionError): pass\nprint(json.dumps({'agyProcesses':count}))\n");
    assert.equal(remoteProcesses.agyProcesses, 0, 'The shared remote account already has an active native AGY process; wait without changing it.');
    proof.remoteAgyProcessesBeforeInvocation = remoteProcesses.agyProcesses;
    let initialDrain;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      initialDrain = await call('/deployment-drain');
      assert.equal(initialDrain.phase, 'open', 'Wait until other candidate proof releases its lease.');
      if (initialDrain.active_operations === 0) break;
      await sleep(100);
    }
    assert.equal(initialDrain.active_operations, 0, 'Wait until other candidate work and cleanup finish.');
    const state = await call('/state');
    assert(!state.runs.some(run => active.has(run.status)), 'Candidate must have no other active provider work.');
    const workstation = await call('/workstations', { method: 'POST', body: { workstation: { id: '', name: 'DEP-002 proof SSH', hostname: fixture.hostname, host_ip: '', port: fixture.port, username: fixture.username, auth: 'key', ssh_alias: '', ssh_key_path: '/run/ae-ssh/mini-project-key.pem', secret_saved: false }, secret: null, clear_secret: false } });
    const attached = await call('/workspaces/probe', { method: 'POST', body: { path: fixture.remotePath, harness: 'antigravity', ssh_host: workstation.id, runtime_id: null } });
    assert.equal(attached.connection.status, 'online', 'The real SSH Antigravity workstation is not ready.');
    const workspace = attached.workspace;
    const template = state.agents.find(agent => agent.id === 'ceo');
    assert(template);
    const profile = { ...template, id: '', harness: 'antigravity', runtime_id: null, project_id: null, reports_to: null, color: '#2563eb', model: fixture.model, reasoning: '', permission: 'read-only', timeout_seconds: 240, enabled: true, deleted_at: null, revision: 0, workdir: workspace, agents_md: '' };
    const lead = await call('/agents', { method: 'POST', body: { ...profile, name: 'Drain Proof Lead', position: 'Verification coordinator', role: 'Coordinates only the explicitly requested temporary fixture verification.', instructions: 'For the coordinator turn, use no tools. Delegate the requested proof.txt read to the named worker through the required routing JSON, exactly one delegation. For the final summary, use no tools and report the worker evidence. Do not create files, invoke commands, ask questions, or delegate in the summary.' } });
    ownAgentIds.push(lead.id);
    const worker = await call('/agents', { method: 'POST', body: { ...profile, reports_to: lead.id, name: 'Drain Proof Reader', position: 'Read-only fixture verifier', role: 'Reads the temporary proof.txt file and reports its actual contents.', instructions: 'Read only proof.txt in your current workdir using one native file-read operation. Return its entire content. Do not edit files, run shell commands, ask questions, contact services, or delegate.' } });
    ownAgentIds.push(worker.id);
    const group = await call('/groups', { method: 'POST', body: { id: '', name: 'DEP-002 native continuation proof', description: 'Disposable Antigravity SSH coordinator, private delegate and summary while deployment drain is active.', member_ids: null, human_ids: null, scope_levels: [1], chat_lead_id: lead.id, project: { workdir: workspace, members: [{ agent_id: lead.id, manager_id: null }, { agent_id: worker.id, manager_id: lead.id }] } } });
    groupId = group.id;
    const access = (await call('/state')).group_access[groupId];
    assert.deepEqual(access.participant_ids, [lead.id]);
    assert(access.delegate_ids.includes(worker.id), 'The real project scope excludes the private worker.');
    messageId = randomUUID();
    const message = { id: messageId, group_id: groupId, side_chat_id: null, body: `Delegate exactly once to Drain Proof Reader (${worker.id}). The assignment is: read proof.txt in your current workdir and return its entire content using a native file-read operation. Do not read the file yourself or launch tools in the coordinator turn. Give one concise final summary of the worker's result after it returns.`, recipients: [lead.id], reply_to: null, artifacts: [] };
    await call('/messages', { method: 'POST', body: message });
    generation = randomUUID();
    const begun = await control('begin');
    assert.equal(begun.phase, 'draining');
    const afterBegin = await call('/state');
    const root = ownRuns(afterBegin).find(run => run.kind === 'coordinator');
    assert(root && active.has(root.status), 'The accepted coordinator was not active when drain began.');
    assert.equal(ownRuns(afterBegin).length, 1, 'Begin must precede creation of the delegate continuation.');
    proof.acceptedRootStatusAtBegin = root.status;
    proof.acceptedRootCreatedAt = root.created_at;
    proof.beginObservedAt = new Date().toISOString();
    await call('/messages', { method: 'POST', body: { ...message, id: randomUUID() }, expected: 503 });
    await control('seal', 409);
    proof.newRootRejected = true;
    proof.busySealRejected = true;
    const deadline = Date.now() + 800000;
    let completed;
    while (Date.now() < deadline) {
      const current = await call('/state');
      const runs = ownRuns(current);
      proof.providerTurns = runs.length;
      assert(runs.length <= 3, 'Verification exceeded its three-turn provider budget.');
      const executing = runs.filter(run => ['starting', 'running'].includes(run.status)).length;
      proof.maxActiveProviderTurns = Math.max(proof.maxActiveProviderTurns, executing);
      assert(executing <= 1, 'This proof must have only one native provider turn executing at a time.');
      assert.equal(current.maintenance.phase, 'draining', 'The lease reopened before continuation proof completed.');
      const observation = runs.map(run => `${run.kind}:${run.status}`).sort().join(',');
      if (proof.observations.at(-1)?.runs !== observation) {
        proof.observations.push({ observedAt: new Date().toISOString(), phase: current.maintenance.phase, runs: observation });
        console.log(JSON.stringify({ stage: 'provider-running', phase: current.maintenance.phase, runs: observation }));
        await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
      }
      assert(!runs.some(run => ['failed', 'timed_out', 'interrupted', 'cancelled'].includes(run.status)), 'Actual provider execution failed; inspect candidate Runs privately.');
      const summary = runs.find(run => run.kind === 'summary');
      if (summary?.status === 'succeeded') { completed = runs; break; }
      await sleep(500);
    }
    assert(completed, 'Actual native continuation did not finish within the proof budget.');
    assert.equal(completed.length, 3);
    const coordinator = completed.find(run => run.kind === 'coordinator');
    const delegate = completed.find(run => run.kind === 'delegate');
    const summary = completed.find(run => run.kind === 'summary');
    assert.equal(coordinator.status, 'delegated');
    assert.equal(delegate.status, 'succeeded');
    assert.equal(delegate.agent_id, worker.id);
    assert.equal(delegate.parent_run_id, coordinator.id);
    assert.equal(summary.parent_run_id, coordinator.id);
    assert(summary.native_session_id === coordinator.native_session_id, 'The real summary did not resume the coordinator conversation.');
    assert(delegate.output.includes(fixture.marker), 'The native worker did not report the actual fixture content.');
    assert(summary.output.includes(fixture.marker), 'The real summary did not preserve the worker evidence.');
    for (const run of completed) { assert.equal(run.exit_code, 0); await receipt(run); }
    const messages = await call(`/groups/${groupId}/messages`);
    assert(messages.some(item => item.run_id === summary.id && item.body.includes(fixture.marker)), 'Summary was not delivered through the actual chat publication path.');
    proof.summaryPublished = true;
    proof.summaryResumedCoordinator = true;
    proof.continuationsAcceptedDuringDrain = true;
    const sealDeadline = Date.now() + 15000;
    while (Date.now() < sealDeadline) {
      const status = await call('/deployment-drain');
      if (status.active_operations === 0 && status.inflight_operations === 0) {
        const response = await fetch(`${base}/api/deployment-drain`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'seal', generation }), signal: AbortSignal.timeout(15000) });
        if (response.status === 200) { assert.equal((await response.json()).phase, 'sealed'); proof.sealedAfterCleanup = true; break; }
        assert.equal(response.status, 409, 'Seal failed for a reason other than a short dispatcher race.');
      }
      await sleep(100);
    }
    assert(proof.sealedAfterCleanup, 'Cleanup did not quiesce for seal.');
    const after = await fixtureSnapshot(fixture.remotePath);
    assert.deepEqual(after, fixture.snapshot, 'Read-only remote fixture changed.');
    proof.remoteFixturePreserved = true;
    proof.fixtureHashes = after;
    proof.result = 'passed';
  } catch (error) {
    executionError = error;
  } finally {
    proof.cleanupFailures = [];
    const cleanupStep = async (name, action) => {
      try { return await action(); }
      catch (error) {
        proof.cleanupFailures.push({ step: name, reason: String(error.message).replaceAll(token, '[REDACTED]').slice(0, 240) });
        return undefined;
      }
    };
    if (messageId && groupId) {
      const cleanupState = await cleanupStep('read-owned-run-state', () => call('/state'));
      if (cleanupState) ownRuns(cleanupState);
      for (const runId of ownRunIds) {
        const run = await cleanupStep('read-owned-run', () => call(`/runs/${runId}`));
        if (run && !active.has(run.status)) continue;
        await cleanupStep('cancel-owned-run', () => call(`/runs/${runId}/cancel`, { method: 'POST', body: {} }));
      }
      await cleanupStep('wait-owned-runs-stopped', async () => {
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline) {
          if (!ownRuns(await call('/state')).some(run => active.has(run.status))) return;
          await sleep(250);
        }
        throw new Error('An owned verification run still needs cancellation; inspect candidate Runs privately.');
      });
    }
    if (generation) {
      await cleanupStep('resume-owned-drain', async () => {
        const current = await call('/deployment-drain');
        if (current.generation === generation || current.phase === 'open') await control('resume');
        else throw new Error('Foreign drain preserved; admission was not changed.');
      });
    }
    if (groupId) {
      await cleanupStep('archive-owned-group', async () => {
        await call(`/groups/${groupId}/archive`, { method: 'POST', body: {} });
        proof.temporaryGroupArchived = true;
      });
    }
    for (const agentId of [...ownAgentIds].reverse()) {
      await cleanupStep('soft-delete-owned-agent', () => call(`/agents/${agentId}`, { method: 'DELETE' }));
    }
    proof.temporaryAgentsSoftDeleted = ownAgentIds.length === 2 && !proof.cleanupFailures.some(item => item.step === 'soft-delete-owned-agent');
    await cleanupStep('verify-final-admission', async () => { proof.finalAdmission = (await call('/deployment-drain')).phase; });
    if (proof.cleanupFailures.length > 0) proof.result = 'failed';
    await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  }
  if (executionError) throw executionError;
  assert.equal(proof.cleanupFailures.length, 0, 'Owned verification cleanup failed; inspect saved proof and candidate Runs privately.');
  console.log(JSON.stringify({ result: proof.result, providerTurns: proof.providerTurns, maxActiveProviderTurns: proof.maxActiveProviderTurns, newRootRejected: proof.newRootRejected, nativeReceiptRuns: proof.nativeReceiptRuns, summaryPublished: proof.summaryPublished, remoteFixturePreserved: proof.remoteFixturePreserved, finalAdmission: proof.finalAdmission, mocks: false }));
}
