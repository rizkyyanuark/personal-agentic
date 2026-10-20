import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = process.env.AE_PROJECTS_DIR;
const args = process.argv.slice(2);
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  if (!source) throw new Error("Set AE_PROJECTS_DIR to an existing host projects directory");
  let metadata;
  try { metadata = fs.statSync(source); }
  catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw new Error(`source path does not exist: ${source}`);
    throw new Error(`Cannot access project source: ${source}`);
  }
  if (!metadata.isDirectory()) throw new Error(`Project source is not a directory: ${source}`);
  let explicitProject = false;
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (option === "--" || !option.startsWith("-")) break;
    if (option === "-p" || option === "--project-name" || option.startsWith("--project-name=")) {
      const name = option.includes("=") ? option.slice(option.indexOf("=") + 1) : args[++index];
      if (!name || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error("Provide a valid dedicated Compose project name");
      explicitProject = true;
    } else if (["-f", "--file", "--profile", "--env-file", "--project-directory", "--ansi", "--progress", "--parallel"].includes(option)) index++;
  }
  if (!explicitProject) throw new Error("Pass -p <dedicated-project> or --project-name <dedicated-project>");
  if (process.platform !== "win32") throw new Error("This entrypoint requires Windows Docker Desktop");
  const context = spawnSync("docker", ["context", "inspect", "desktop-linux"], { encoding: "utf8", timeout: 10000 });
  if (context.error || context.status !== 0) throw new Error("Cannot inspect the local desktop-linux Docker context");
  let endpoint;
  try { endpoint = JSON.parse(context.stdout)[0]?.Endpoints?.docker?.Host; }
  catch { throw new Error("Cannot read the desktop-linux Docker endpoint"); }
  if (typeof endpoint !== "string" || endpoint.toLowerCase() !== "npipe:////./pipe/dockerdesktoplinuxengine") {
    throw new Error("desktop-linux must use the local Docker Desktop Linux named pipe");
  }
  const result = spawnSync("docker", [
    "--context", "desktop-linux", "compose",
    "-f", path.join(src, "compose.yaml"), "-f", path.join(src, "compose.projects.local.yaml"), ...args,
  ], { cwd: src, stdio: "inherit", env: { ...process.env, AE_PROJECTS_DIR: fs.realpathSync(source) } });
  if (result.error) throw new Error("Could not start Docker Compose");
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
