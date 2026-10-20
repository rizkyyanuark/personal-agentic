import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contextName = "desktop-linux";
const approvedSource = "C:/Users/rizky/Documents/GitHub";
const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const project = `ae-projects-proof-${runId}`;
const fixtureName = `disposable-overlay-fixture-${runId}`;
const containerPath = `/projects/${fixtureName}`;
const port = Number(process.env.AE_TEST_PROJECTS_PORT ?? 18794);
const matrixPort = Number(process.env.AE_TEST_PROJECTS_MATRIX_PORT ?? 18795);
const baseUrl = `http://127.0.0.1:${port}`;
const evidenceDirectory = path.join(repoRoot, ".state", "local-projects-overlay", runId);
const receiptPath = path.join(repoRoot, ".state", "runner-verification", "local-projects-overlay.json");
const secrets = new Set();
const stacks = [];
const cancellation = new AbortController();
let interrupted;
let cleaning = false;
function stop(signal) {
  interrupted = signal;
  cancellation.abort();
}
const onInterrupt = () => stop("SIGINT");
const onTerminate = () => stop("SIGTERM");
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);
const labels = {
  "space.personal-agentic.acceptance": "local-projects-overlay",
  "space.personal-agentic.acceptance.run": runId,
  "space.personal-agentic.acceptance.checkout": crypto.createHash("sha256").update(repoRoot).digest("hex"),
};
const proof = {
  passed: false, startedAt: new Date().toISOString(), runId, testProject: project,
  ports: { platform: port, matrix: matrixPort },
  scriptSha256: crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  negativeCases: {}, cleanup: { stacks: [], hostFixtureRemoved: false },
};
let fixturePath;
let sourceRoot;
let fixtureCreated = false;
let missingSource;

function checkInterrupted() {
  if (interrupted && !cleaning) throw new Error(`Fixture interrupted by ${interrupted}`);
}

function privateValue(value) {
  assert.equal(typeof value, "string", "Missing private fixture credential");
  assert(value.length > 0, "Empty private fixture credential");
  secrets.add(value);
  return value;
}

function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.replaceAll(secret, "[REDACTED]");
  return text;
}

function command(executable, args, { env = {}, input, binary = false, allowFailure = false, label = "Docker operation" } = {}) {
  checkInterrupted();
  const result = spawnSync(executable, args, {
    cwd: repoRoot, env: { ...process.env, ...env }, input,
    encoding: binary ? null : "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: ${redact(result.error.message)}`);
  if (allowFailure) return result;
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}): ${redact(result.stderr || result.stdout)}`);
  return binary ? result.stdout : result.stdout.trim();
}

function docker(args, options) {
  return command("docker", ["--context", contextName, ...args], options);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: fixturePath, encoding: "utf8", timeout: 30000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Fixture Git operation failed: ${redact(result.stderr)}`);
  return result.stdout.trim();
}

async function until(label, predicate, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    checkInterrupted();
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function ready(url) {
  await until(url, async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(5000)]) });
      return response.status === 200 || response.status === 401;
    } catch { return false; }
  });
}

async function request(endpoint, { method = "GET", body, owner, cookie, workspace, origin = baseUrl } = {}) {
  checkInterrupted();
  const headers = { Origin: origin };
  if (owner) headers.Authorization = `Bearer ${owner}`;
  if (cookie) headers.Cookie = cookie;
  if (workspace) headers["x-ae-workspace"] = workspace;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}/api${endpoint}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60000)]),
  });
  return { status: response.status, data: await response.json(), response };
}

async function accepted(endpoint, options) {
  const result = await request(endpoint, options);
  assert.equal(result.status, 200, `${endpoint}: ${redact(result.data.error ?? `HTTP ${result.status}`)}`);
  return result.data;
}

async function denied(name, endpoint, options, status, expectedError) {
  const result = await request(endpoint, options);
  assert.equal(result.status, status, `${name}: wrong HTTP status`);
  if (expectedError instanceof RegExp) assert.match(result.data.error, expectedError, `${name}: wrong rejection`);
  else assert.equal(result.data.error, expectedError, `${name}: wrong rejection`);
  proof.negativeCases[name] = { status, error: result.data.error };
}

function resources(stack) {
  return ["container", "volume", "network"].flatMap((kind) => {
    const args = kind === "container" ? ["ps", "-aq"] : [kind, "ls", "-q"];
    const ids = docker([...args, "--filter", `label=com.docker.compose.project=${stack.project}`]).split(/\r?\n/).filter(Boolean);
    if (!ids.length) return [];
    return JSON.parse(docker([kind, "inspect", ...ids])).map((value) => ({
      kind, labels: kind === "container" ? value.Config.Labels : value.Labels,
    }));
  });
}

function owned(stack) {
  const found = resources(stack);
  for (const resource of found) {
    assertLabels(stack, resource.labels, resource.kind);
  }
  return found;
}

function assertLabels(stack, actual, kind) {
  assert.equal(actual?.["com.docker.compose.project"], stack.project, "Unexpected Compose project");
  for (const [key, value] of Object.entries(labels)) assert.equal(actual?.[key], value, `Refusing to alter an unowned ${kind}`);
}

function namedResource(kind, name) {
  const result = docker([kind, "inspect", name], { allowFailure: true });
  if (result.status === 0) return JSON.parse(result.stdout)[0];
  assert.match(result.stderr, /no such|not found/i, `Cannot establish ownership of ${kind}`);
  return null;
}

function expectedNames(stack) {
  return [
    ...["platform", "matrix", "worker"].map((service) => ["container", `${stack.project}-${service}-1`]),
    ...["platform-data", "matrix-data", "worker-data", "worker-workdir"].map((volume) => ["volume", `${stack.project}_${volume}`]),
    ["network", `${stack.project}_default`],
  ];
}

function ownedContainer(stack, service) {
  const name = `${stack.project}-${service}-1`;
  const value = namedResource("container", name);
  assert(value, "Owned fixture container is missing");
  assertLabels(stack, value.Config.Labels, "container");
  return name;
}

function compose(stack, args, options = {}) {
  const env = { ...stack.env, ...options.env };
  if (args.includes("up") || args.includes("run")) {
    return command(process.execPath, [
      path.join(repoRoot, "src/scripts/local-projects-compose.mjs"),
      "-p", stack.project, "-f", stack.override, ...args,
    ], { ...options, env });
  }
  return docker([
    "compose", "-p", stack.project,
    "-f", path.join(repoRoot, "src", "compose.yaml"),
    "-f", path.join(repoRoot, "src", "compose.projects.local.yaml"),
    "-f", stack.override, ...args,
  ], { ...options, env });
}

function cleanup(stack) {
  const found = owned(stack);
  for (const [kind, name] of expectedNames(stack)) {
    const value = namedResource(kind, name);
    if (value) assertLabels(stack, kind === "container" ? value.Config.Labels : value.Labels, kind);
  }
  if (found.length) compose(stack, ["--profile", "worker", "down", "--volumes", "--remove-orphans", "--timeout", "10"], { label: "Remove owned fixture stack" });
  assert.equal(resources(stack).length, 0, "Fixture resources remain after teardown");
  stack.cleaned = true;
  proof.cleanup.stacks.push({ project: stack.project, removedResources: found.length, absentAfterTeardown: true });
}

function reserveStack(name, env, image, workerImage) {
  const override = path.join(evidenceDirectory, `${name}.json`);
  const config = {
    services: {
      platform: { image, pull_policy: "never", cpus: 0.5, mem_limit: "512m", memswap_limit: "1g", labels },
      matrix: { pull_policy: "never", cpus: 0.5, mem_limit: "512m", memswap_limit: "1g", labels },
      worker: {
        image: workerImage, pull_policy: "never", cpus: 0.5, mem_limit: "384m", memswap_limit: "768m", labels,
        // Symlinks live on Linux tmpfs, independent of Windows bind-mount symlink support.
        tmpfs: [`${containerPath}/.acceptance:uid=10001,gid=10001,mode=0700`],
      },
    },
    volumes: Object.fromEntries(["platform-data", "matrix-data", "worker-data", "worker-workdir"].map((name) => [name, { labels }])),
    networks: { default: { labels } },
  };
  fs.writeFileSync(override, JSON.stringify(config, null, 2));
  const stack = { project: name, override, env, cleaned: false };
  assert.equal(resources(stack).length, 0, "Fixture namespace exists; refusing to reuse or delete it");
  for (const [kind, resourceName] of expectedNames(stack)) {
    assert.equal(namedResource(kind, resourceName), null, "Fixture resource name exists; refusing to reuse it");
  }
  stacks.push(stack);
  return stack;
}

function exec(stack, service, args, options = {}) {
  owned(stack);
  return docker(["exec", ...(options.flags ?? []), ownedContainer(stack, service), ...args], options);
}

function binding(group, workspace, runtimeId) {
  assert(group, "Saved project is missing");
  for (const key of ["path", "canonical_path", "git_root"]) assert.equal(group.project.workdir[key], workspace[key]);
  assert.equal(group.project.workdir.runtime_id, runtimeId);
  assert.equal(group.project.workdir.ssh_host, null);
}

async function main() {
  let failure;
  try {
    assert.equal(process.platform, "win32", "Use the approved Windows laptop and local Docker Desktop");
    assert(Number.isInteger(port) && port > 1023 && port < 65536, "Invalid platform port");
    assert(Number.isInteger(matrixPort) && matrixPort > 1023 && matrixPort < 65536 && matrixPort !== port, "Invalid Matrix port");
    const context = JSON.parse(docker(["context", "inspect", contextName]));
    assert.equal(context[0].Endpoints.docker.Host.toLowerCase(), "npipe:////./pipe/dockerdesktoplinuxengine", "Refusing a remote Docker endpoint");
    assert.equal(docker(["version", "--format", "{{.Server.Os}}"]), "linux");
    const image = process.env.AE_TEST_PROJECTS_IMAGE;
    assert(image, "Set AE_TEST_PROJECTS_IMAGE to the source-matched local platform image");
    const workerImage = process.env.AE_TEST_PROJECTS_WORKER_IMAGE ?? image;
    proof.images = {
      platform: docker(["image", "inspect", image, "--format", "{{.Id}}"]),
      worker: docker(["image", "inspect", workerImage, "--format", "{{.Id}}"]),
    };
    docker(["image", "inspect", "ghcr.io/element-hq/synapse:v1.161.0"], { label: "Check local Synapse prerequisite" });
    sourceRoot = fs.realpathSync(approvedSource);
    fixturePath = path.join(sourceRoot, fixtureName);
    assert(!fs.existsSync(fixturePath), "Refusing to reuse an existing host fixture");
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.mkdirSync(fixturePath);
    fixtureCreated = true;
    fs.mkdirSync(path.join(fixturePath, ".acceptance"));
    const marker = Buffer.from(`MARKER_BYTES_${crypto.randomUUID()}_${Date.now()}\n`, "utf8");
    fs.writeFileSync(path.join(fixturePath, "marker.txt"), marker);
    fs.writeFileSync(path.join(fixturePath, "README.md"), `# Disposable fixture\n${fixtureName}\n`);
    git(["init"]);
    git(["config", "user.name", "Disposable Overlay Tester"]);
    git(["config", "user.email", "disposable@example.local"]);
    git(["add", "README.md", "marker.txt"]);
    git(["commit", "-m", `initial commit for ${fixtureName}`]);
    const commitSha = git(["rev-parse", "HEAD"]);
    proof.fixtureHostPath = fixturePath;
    proof.fixtureContainerPath = containerPath;
    proof.markerSha256 = crypto.createHash("sha256").update(marker).digest("hex");
    proof.gitDetails = { host: { commitSha } };
    const bridgePassword = privateValue(crypto.randomBytes(24).toString("hex"));
    const memberPassword = privateValue(crypto.randomBytes(24).toString("hex"));
    const memberName = `overlay_member_${runId}`;
    const env = {
      AE_PROJECTS_DIR: approvedSource, AE_PORT: String(port), AE_MATRIX_PORT: String(matrixPort),
      AE_PUBLIC_URL: baseUrl, AE_MATRIX_SERVER_NAME: `overlay-${runId}.local`,
      AE_MATRIX_BOT_USERNAME: "agentic", AE_MATRIX_BOT_PASSWORD: bridgePassword,
      AE_ENROLLMENT_TOKEN: "", COMPOSE_PROFILES: "",
    };

    console.log("Checking missing host-source startup failure...");
    missingSource = path.join(sourceRoot, `missing-overlay-source-${runId}`);
    assert(!fs.existsSync(missingSource));
    const missingStack = reserveStack(`${project}-missing`, { ...env, AE_PROJECTS_DIR: missingSource }, image, workerImage);
    const rejected = compose(missingStack, ["up", "-d", "--no-deps", "--no-build", "platform"], { allowFailure: true });
    assert.notEqual(rejected.status, 0, "Missing bind source must fail to start");
    assert.match(`${rejected.stderr}${rejected.stdout}`, /bind source path does not exist|source path does not exist/i);
    assert(`${rejected.stderr}${rejected.stdout}`.includes(`missing-overlay-source-${runId}`), "Startup failed for a reason other than the selected missing source");
    assert(!fs.existsSync(missingSource), "Missing host source was silently created");
    proof.negativeCases.missingHostSource = { startupFailed: true, sourceStillAbsent: true, entrypoint: "local-projects-compose.mjs" };
    cleanup(missingStack);

    const stack = reserveStack(project, env, image, workerImage);
    const rendered = JSON.parse(compose(stack, ["--profile", "worker", "config", "--format", "json"]));
    const windowsSource = (value) => value.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
    proof.renderedConfiguration = {};
    for (const [name, published, target] of [["platform", port, 8765], ["matrix", matrixPort, 8008], ["worker", null, null]]) {
      const service = rendered.services[name];
      const ports = (service.ports ?? []).map((value) => ({
        host: value.host_ip, published: Number(value.published), target: Number(value.target), protocol: value.protocol,
      }));
      assert.deepEqual(ports, published === null ? [] : [{ host: "127.0.0.1", published, target, protocol: "tcp" }], `${name} ports must remain on loopback`);
      const mounts = (service.volumes ?? []).filter((value) => value.target === "/projects").map((value) => ({
        type: value.type, source: value.source, target: value.target,
        createHostPath: value.bind?.create_host_path,
      }));
      if (name !== "matrix") {
        assert.equal(mounts.length, 1, `${name} must have exactly one projects mount`);
        assert.equal(mounts[0].type, "bind");
        assert.equal(windowsSource(mounts[0].source), windowsSource(approvedSource));
        assert.equal(mounts[0].createHostPath, false, "The project source must never be created implicitly");
      }
      const command = name === "worker" ? service.command : null;
      const projectRoot = name === "platform" ? service.environment.AE_LOCAL_PROJECTS_ROOT
        : name === "worker" ? command[command.indexOf("--worker-root") + 1] : null;
      if (name !== "matrix") assert.equal(projectRoot, "/projects", `${name} must use the mounted project root`);
      proof.renderedConfiguration[name] = {
        mounts, command, projectRoot, ports,
        resourceLimits: { cpus: service.cpus, memory: service.mem_limit, memoryAndSwap: service.memswap_limit },
      };
    }
    console.log(`Starting owned fixture stack ${project} on loopback ${port}/${matrixPort}...`);
    compose(stack, ["run", "--rm", "matrix", "generate"], { label: "Generate fixture Synapse configuration" });
    compose(stack, ["up", "-d", "--no-build", "matrix"], { label: "Start fixture Synapse" });
    await ready(`http://127.0.0.1:${matrixPort}/_matrix/client/versions`);
    const registrationScript = `
import hashlib, hmac, json, sys, urllib.request, yaml
config = yaml.safe_load(open("/data/homeserver.yaml"))
url = "http://localhost:8008/_synapse/admin/v1/register"
for user in json.load(sys.stdin):
    nonce = json.load(urllib.request.urlopen(url))["nonce"]
    mac = hmac.new(config["registration_shared_secret"].encode(), "\\0".join([nonce, user["name"], user["password"], "notadmin"]).encode(), hashlib.sha1).hexdigest()
    data = dict(nonce=nonce, username=user["name"], password=user["password"], admin=False, mac=mac)
    request = urllib.request.Request(url, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    urllib.request.urlopen(request).close()
`;
    exec(stack, "matrix", ["python", "-c", registrationScript], {
      flags: ["-i"], input: JSON.stringify([{ name: "agentic", password: bridgePassword }, { name: memberName, password: memberPassword }]),
      label: "Register disposable Matrix identities",
    });
    compose(stack, ["up", "-d", "--no-build", "platform"], { label: "Start fixture platform" });
    await ready(`${baseUrl}/api/state`);
    const owner = privateValue(exec(stack, "platform", ["cat", "/data/org/.state/owner.key"]));
    const before = await accepted("/state", { owner });
    const registered = await accepted("/runtimes", { owner, method: "POST", body: { name: "Local Projects Overlay Worker" } });
    const runtimeId = registered.id;
    const enrollment = privateValue(registered.enrollment_token);
    compose(stack, ["--profile", "worker", "up", "-d", "--no-build", "worker"], { env: { AE_ENROLLMENT_TOKEN: enrollment }, label: "Start owned fixture worker" });
    async function waitWorker(online) {
      await until(`fixture worker ${online ? "online" : "offline"}`, async () => {
        const values = await accepted("/runtimes", { owner });
        const runtime = values.find((value) => value.id === runtimeId);
        assert(runtime, "Fixture runtime disappeared");
        if (online && runtime.online) assert.equal(runtime.root, "/projects");
        return runtime.online === online;
      });
    }
    await waitWorker(true);
    proof.runtime = { id: runtimeId, reportedRoot: "/projects", enrolled: true };
    if (process.env.AE_TEST_PROJECTS_FAIL_AFTER_START === "1") {
      proof.failureInjection = "after-real-worker-startup";
      throw new Error("Injected fixture failure after real worker startup");
    }
    proof.identities = {};
    for (const service of ["platform", "worker"]) {
      const uid = exec(stack, service, ["id", "-u"]);
      const gid = exec(stack, service, ["id", "-g"]);
      assert.equal(uid, "10001", `${service} must use the non-root application UID`);
      proof.identities[service] = { uid, gid };
      const bytes = exec(stack, service, ["cat", `${containerPath}/marker.txt`], { binary: true });
      assert.deepEqual(bytes, fs.readFileSync(path.join(fixturePath, "marker.txt")), `${service} marker bytes differ`);
      // Trust only this repository in the disposable container's own Git configuration.
      exec(stack, service, ["git", "config", "--global", "--add", "safe.directory", containerPath]);
      const actual = exec(stack, service, ["git", "-C", containerPath, "rev-parse", "HEAD"]);
      assert.equal(actual, commitSha, `${service} repository identity differs`);
      proof.gitDetails[service === "platform" ? "controller" : "worker"] = { commitSha: actual, safeDirectory: containerPath };
    }
    proof.markerBytesEqual = { hostController: true, hostWorker: true };

    const browse = await accepted("/workspaces/directories?path=/projects", { owner });
    assert.equal(browse.local_projects.status, "available");
    assert(browse.roots.some((root) => root.name === "Local projects" && root.path === "/projects"));
    assert(browse.folders.some((folder) => folder.name === fixtureName));
    proof.browseResult = { status: "available", folderFound: true, rootName: "Local projects" };
    const workerRoot = await accepted(`/runtimes/${runtimeId}/directories`, { owner, method: "POST", body: { path: "" } });
    assert.equal(workerRoot.path, "/projects");
    assert(workerRoot.roots.some((root) => root.name === "Runtime root" && root.path === "/projects"));
    assert(workerRoot.folders.some((folder) => folder.name === fixtureName));
    const workerFolder = await accepted(`/runtimes/${runtimeId}/directories`, { owner, method: "POST", body: { path: containerPath } });
    assert.equal(workerFolder.path, containerPath);
    proof.workerBrowseResult = { root: workerRoot.path, folder: workerFolder.path, runtimeId };
    const controllerWorkspace = (await accepted("/workspaces/probe", { owner, method: "POST", body: { path: containerPath } })).workspace;
    const workerWorkspace = (await accepted("/workspaces/probe", { owner, method: "POST", body: { path: containerPath, runtime_id: runtimeId } })).workspace;
    assert.equal(controllerWorkspace.git_root, containerPath);
    assert.equal(controllerWorkspace.runtime_id, null);
    assert.equal(workerWorkspace.git_root, containerPath);
    assert.equal(workerWorkspace.runtime_id, runtimeId);
    proof.probeControllerResult = controllerWorkspace;
    proof.probeWorkerResult = workerWorkspace;
    const savedGroups = [];
    for (const [name, workspace, selectedRuntime] of [["controller", controllerWorkspace, null], ["worker", workerWorkspace, runtimeId]]) {
      const group = await accepted("/groups", { owner, method: "POST", body: {
        id: "", name: `${name} ${fixtureName}`, description: "Disposable project binding acceptance",
        member_ids: null, scope_levels: null, chat_lead_id: null, project: { workdir: workspace, members: [] },
      } });
      binding(group, workspace, selectedRuntime);
      savedGroups.push({ id: group.id, name, workspace, runtimeId: selectedRuntime });
    }
    async function verifyBindings() {
      const state = await accepted("/state", { owner });
      const bindings = {};
      for (const saved of savedGroups) {
        const group = state.groups.find((value) => value.id === saved.id);
        binding(group, saved.workspace, saved.runtimeId);
        bindings[saved.name] = { id: group.id, ...group.project.workdir };
      }
      return bindings;
    }
    proof.saveBindingResult = await verifyBindings();

    console.log("Checking worker containment and authenticated workspace boundaries...");
    const outside = `/tmp/overlay-outside-${runId}`;
    exec(stack, "worker", ["mkdir", "-p", outside, `${containerPath}/.acceptance/.state`]);
    exec(stack, "worker", ["ln", "-s", outside, `${containerPath}/.acceptance/escape`]);
    for (const [name, target] of [["workerTraversal", `${containerPath}/../../tmp/overlay-outside-${runId}`], ["workerSymlink", `${containerPath}/.acceptance/escape`]]) {
      await denied(`${name}Probe`, "/workspaces/probe", { owner, method: "POST", body: { path: target, runtime_id: runtimeId } }, 400, "Workdir is outside the runtime's registered root");
      await denied(`${name}Browse`, `/runtimes/${runtimeId}/directories`, { owner, method: "POST", body: { path: target } }, 400, "Folder is outside the runtime's registered root");
    }
    await denied("workerReservedState", `/runtimes/${runtimeId}/directories`, { owner, method: "POST", body: { path: `${containerPath}/.acceptance/.state` } }, 400, "Internal or sensitive folders cannot be browsed");
    await denied("workerOwnState", "/workspaces/probe", { owner, method: "POST", body: { path: "/data/worker", runtime_id: runtimeId } }, 400, "Workdir is outside the runtime's registered root");
    await denied("controllerReservedState", "/workspaces/directories?path=/data/org/.state", { owner }, 400, "Internal organization state cannot be browsed");
    await denied("missingRepository", "/workspaces/probe", { owner, method: "POST", body: { path: `/projects/absent-${runId}` } }, 400, "Workdir does not exist or is not a directory");
    const other = await accepted("/tenants", { owner, method: "POST", body: { name: `Boundary fixture ${runId}` } });
    proof.secondWorkspace = other.id;
    await denied("crossWorkspaceRuntimeProbe", "/workspaces/probe", { owner, workspace: other.id, method: "POST", body: { path: containerPath, runtime_id: runtimeId } }, 400, "Runtime not available in this workspace");
    await denied("crossWorkspaceRuntimeBrowse", `/runtimes/${runtimeId}/directories`, { owner, workspace: other.id, method: "POST", body: { path: containerPath } }, 400, "Runtime not available in this workspace");
    await denied("nonDefaultControllerBrowse", "/workspaces/directories?path=/projects", { owner, workspace: other.id }, 403, "Controller filesystem access requires the bootstrap owner");
    await denied("nonDefaultControllerProbe", "/workspaces/probe", { owner, workspace: other.id, method: "POST", body: { path: containerPath } }, 400, "Select a registered runtime");
    const login = await request("/login", { method: "POST", body: { username: memberName, password: memberPassword } });
    assert.equal(login.status, 200, "Real Matrix member sign-in must succeed");
    const memberCookie = privateValue(login.response.headers.get("set-cookie")?.split(";")[0]);
    await accepted("/tenants/default/members", { owner, method: "POST", body: { user: login.data.user, role: "member" } });
    await accepted("/state", { cookie: memberCookie });
    await denied("matrixMemberControllerBrowse", "/workspaces/directories?path=/projects", { cookie: memberCookie }, 403, "Controller filesystem access requires the bootstrap owner");
    await denied("matrixMemberControllerProbe", "/workspaces/probe", { cookie: memberCookie, method: "POST", body: { path: containerPath } }, 403, "Room membership or workspace owner permission required");
    await denied("unauthenticatedBrowse", "/workspaces/directories?path=/projects", {}, 401, "Sign-in required");
    await denied("disallowedOriginBrowse", "/workspaces/directories?path=/projects", { owner, origin: "http://untrusted.invalid" }, 403, "Cross-origin request rejected");

    console.log("Checking permission diagnosis through the non-root controller API...");
    const restrictedParent = `/data/acceptance-permissions-${runId}`;
    const restrictedRoot = `${restrictedParent}/blocked/projects`;
    exec(stack, "platform", ["mkdir", "-p", restrictedRoot], { flags: ["--user", "0"] });
    exec(stack, "platform", ["chmod", "000", `${restrictedParent}/blocked`], { flags: ["--user", "0"] });
    const originalOverride = stack.override;
    const restrictedConfig = JSON.parse(fs.readFileSync(originalOverride, "utf8"));
    restrictedConfig.services.platform.environment = { AE_LOCAL_PROJECTS_ROOT: restrictedRoot };
    stack.override = path.join(evidenceDirectory, "permission.json");
    fs.writeFileSync(stack.override, JSON.stringify(restrictedConfig, null, 2));
    owned(stack);
    compose(stack, ["up", "-d", "--no-build", "--no-deps", "--force-recreate", "platform"], { label: "Restart owned controller for permission diagnosis" });
    await ready(`${baseUrl}/api/state`);
    assert.equal(exec(stack, "platform", ["id", "-u"]), "10001");
    const permissionView = await accepted("/workspaces/directories", { owner });
    assert.equal(permissionView.local_projects.status, "unreadable");
    assert.match(permissionView.local_projects.diagnosis, /access was denied/);
    assert(!permissionView.roots.some((root) => root.name === "Local projects"));
    await denied("nonRootPermissionBrowse", `/workspaces/directories?path=${encodeURIComponent(restrictedRoot)}`, { owner }, 400, /^Folder access was denied:/);
    proof.permissionDiagnosis = { uid: "10001", status: "unreadable", localProjectsShortcutAbsent: true, deniedAncestor: true };
    stack.override = originalOverride;
    compose(stack, ["up", "-d", "--no-build", "--no-deps", "--force-recreate", "platform"], { label: "Restore owned controller project-root configuration" });
    await ready(`${baseUrl}/api/state`);
    await waitWorker(true);
    proof.bindingsAfterControllerRestart = await verifyBindings();
    assert.equal((await accepted("/workspaces/directories", { owner })).local_projects.status, "available");
    owned(stack);
    docker(["stop", "--time", "10", ownedContainer(stack, "worker")], { label: "Stop only owned fixture worker" });
    await waitWorker(false);
    await denied("offlineRegisteredRuntimeProbe", "/workspaces/probe", { owner, method: "POST", body: { path: containerPath, runtime_id: runtimeId } }, 400, "Runtime is offline; reconnect it before attaching a workdir");
    await denied("offlineRegisteredRuntimeBrowse", `/runtimes/${runtimeId}/directories`, { owner, method: "POST", body: { path: containerPath } }, 400, "Runtime is offline; reconnect it before attaching a workdir");
    owned(stack);
    docker(["start", ownedContainer(stack, "worker")], { label: "Reconnect only owned fixture worker" });
    await waitWorker(true);
    const after = await accepted("/state", { owner });
    assert.equal(after.runs.length, before.runs.length, "Filesystem acceptance must create zero provider runs");
    proof.providerRunsCreated = after.runs.length - before.runs.length;
    proof.productChecksPassed = true;
  } catch (error) {
    failure = error;
    proof.error = redact(error instanceof Error ? error.message : error);
  } finally {
    cleaning = true;
    for (const stack of [...stacks].reverse()) {
      if (stack.cleaned) continue;
      try { cleanup(stack); }
      catch (error) {
        failure ??= error;
        proof.cleanup.stacks.push({ project: stack.project, error: redact(error.message), absentAfterTeardown: false });
      }
    }
    if (fixtureCreated) {
      try {
        assert.equal(path.relative(sourceRoot, path.resolve(fixturePath)), fixtureName, "Refusing host cleanup outside the exact fixture");
        assert.match(fixtureName, /^disposable-overlay-fixture-[a-f0-9]{12}$/);
        fs.rmSync(fixturePath, { recursive: true, force: true });
        assert(!fs.existsSync(fixturePath), "Host fixture remains after cleanup");
        proof.cleanup.hostFixtureRemoved = true;
      } catch (error) {
        failure ??= error;
        proof.cleanup.hostError = redact(error.message);
      }
    }
    if (missingSource && fs.existsSync(missingSource)) {
      try {
        assert.equal(path.relative(sourceRoot, path.resolve(missingSource)), `missing-overlay-source-${runId}`);
        assert(!fs.lstatSync(missingSource).isSymbolicLink(), "Missing-source fixture was replaced by a symlink");
        assert.equal(fs.readdirSync(missingSource).length, 0, "Refusing to remove nonempty missing-source fixture");
        fs.rmdirSync(missingSource);
      } catch (error) {
        failure ??= error;
        proof.cleanup.missingSourceError = redact(error.message);
      }
    }
    proof.cleanup.missingSourceAbsent = !missingSource || !fs.existsSync(missingSource);
    proof.cleanupSuccessful = proof.cleanup.hostFixtureRemoved && proof.cleanup.missingSourceAbsent && stacks.every((stack) => stack.cleaned);
    proof.passed = Boolean(proof.productChecksPassed && proof.cleanupSuccessful && !failure);
    proof.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    const receipt = redact(JSON.stringify(proof, null, 2));
    fs.writeFileSync(receiptPath, receipt);
    if (fs.existsSync(evidenceDirectory)) fs.writeFileSync(path.join(evidenceDirectory, "receipt.json"), receipt);
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
  if (failure) throw failure;
  console.log(`PASS local projects overlay; zero provider runs; owned resources removed. Receipt: ${receiptPath}`);
}

main().catch((error) => {
  console.error(`Local projects verification failed: ${redact(error instanceof Error ? error.message : error)}`);
  process.exitCode = 1;
});
