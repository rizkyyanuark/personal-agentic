#!/usr/bin/env python3
"""Plan and remove only obsolete, repository-owned platform images."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from typing import Iterator

IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
ACTIVE = {"created", "running", "paused", "restarting"}
BUILD_PROCESSES = {"cargo", "rustc", "buildctl", "buildkitd", "buildctl-daemon"}


class MaintenanceError(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise MaintenanceError(message)


@dataclass(frozen=True)
class Policy:
    root: Path = Path("/opt/personal-agentic")
    repository: str = "registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform"
    source: str = "https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic"
    minimum_age_seconds: int = 7 * 24 * 3600
    docker_host: str = "unix:///var/run/docker.sock"
    proc: Path = Path("/proc")


class Docker:
    def __init__(self, host: str):
        self.host = host

    def run(self, *arguments: str) -> str:
        try:
            result = subprocess.run(
                ["docker", "--host", self.host, *arguments], capture_output=True,
                text=True, timeout=60, check=False,
                env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C.UTF-8"},
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise MaintenanceError("Docker operation unavailable: " + arguments[0]) from error
        require(result.returncode == 0, "Docker operation refused: " + " ".join(arguments[:2]))
        return result.stdout

    def inspect(self, kind: str) -> list[dict]:
        ids = sorted(set(self.run(kind, "ls", "-aq", "--no-trunc").split()))
        values = []
        for index in range(0, len(ids), 50):
            values.extend(json.loads(self.run(kind, "inspect", *ids[index:index + 50])))
        return values


def canonical(reference: str) -> str:
    return reference.replace("registry.tugasakhir.space:443/", "registry.tugasakhir.space/", 1)


def private_file(path: Path, *, optional: bool = False) -> bytes | None:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        require(optional, "Required release file is missing: " + path.name)
        return None
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0
            and metadata.st_mode & 0o077 == 0, "Release file is redirected or not root-private: " + path.name)
    require(metadata.st_size <= 1024 * 1024, "Release file exceeds its size bound: " + path.name)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as handle:
        require(os.fstat(handle.fileno()).st_ino == metadata.st_ino, "Release file changed while opening")
        return handle.read()


def protected_references(policy: Policy) -> tuple[set[str], str, bool]:
    env = private_file(policy.root / "production.env")
    require(env is not None, "Production configuration is missing")
    references = re.findall(rb"^AE_PLATFORM_IMAGE=([^\r\n]+)$", env, re.MULTILINE)
    require(len(references) == 1, "Production image configuration is ambiguous")
    reference = references[0].decode("ascii")
    require(canonical(reference).startswith(policy.repository + "@")
            and IMAGE_ID.fullmatch(reference.split("@", 1)[1]) is not None,
            "Production configuration does not use the fixed immutable image")
    protected = {canonical(reference)}
    fingerprints = {"production.env": hashlib.sha256(env).hexdigest()}
    pending = False
    for name in ("current", "previous", "pending"):
        raw = private_file(policy.root / "releases" / (name + ".json"), optional=name != "current")
        fingerprints[name] = hashlib.sha256(raw).hexdigest() if raw is not None else None
        if raw is None:
            continue
        record = json.loads(raw)
        require(isinstance(record, dict), "Release journal is invalid")
        if name == "current":
            require(record.get("status") == "verified" and isinstance(record.get("image"), str)
                    and canonical(record["image"]) == canonical(reference),
                    "Current release is not verified or differs from configuration")
        pending = pending or name == "pending"
        for item in (record, record.get("previous")):
            if item is None:
                continue
            require(isinstance(item, dict) and isinstance(item.get("image"), str), "Release image reference is invalid")
            value = canonical(item["image"])
            require(value.startswith(policy.repository + "@") and IMAGE_ID.fullmatch(value.split("@", 1)[1]) is not None,
                    "Release journal contains an unsupported image reference")
            protected.add(value)
    fingerprint = hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest()
    return protected, fingerprint, pending


def active_build_processes(proc: Path) -> list[str]:
    found = set()
    for directory in proc.iterdir():
        if not directory.name.isdecimal():
            continue
        try:
            name = (directory / "comm").read_text().strip()
        except (FileNotFoundError, ProcessLookupError):
            continue
        if name in BUILD_PROCESSES:
            found.add(name)
    return sorted(found)


def container_summary(value: dict) -> dict:
    labels = value.get("Config", {}).get("Labels") or {}
    name = value.get("Name", "").lstrip("/")
    is_job = name.startswith("runner-") or any(key.startswith("com.gitlab.gitlab-runner.") for key in labels)
    return {"id": value["Id"], "image": value["Image"], "state": value["State"]["Status"],
            "name": name, "ci_job": is_job}


def image_summary(value: dict) -> dict:
    labels = value.get("Config", {}).get("Labels") or {}
    return {"id": value["Id"], "tags": sorted(value.get("RepoTags") or []),
            "digests": sorted(value.get("RepoDigests") or []), "created": value["Created"],
            "source": labels.get("org.opencontainers.image.source"),
            "revision": labels.get("org.opencontainers.image.revision"), "size_bytes": value.get("Size", 0)}


def snapshot(policy: Policy, docker: Docker) -> dict:
    protected, release_fingerprint, pending = protected_references(policy)
    containers = sorted((container_summary(value) for value in docker.inspect("container")), key=lambda value: value["id"])
    images = sorted((image_summary(value) for value in docker.inspect("image")), key=lambda value: value["id"])
    protected_ids = {value["id"] for value in images
                     if protected.intersection(canonical(ref) for ref in value["digests"] + value["tags"])}
    resolved = {canonical(ref) for value in images for ref in value["digests"] + value["tags"]}
    require(protected.issubset(resolved), "A protected release image is absent; inventory is incomplete")
    volumes = sorted(docker.run("volume", "ls", "--format", "{{.Name}}").splitlines())
    busy = [value["name"] for value in containers if value["ci_job"] and value["state"] in ACTIVE]
    return {"release_fingerprint": release_fingerprint, "protected_references": sorted(protected),
            "protected_ids": sorted(protected_ids), "pending": pending, "containers": containers,
            "images": images, "volumes": volumes, "busy_ci": busy, "build_processes": active_build_processes(policy.proc)}


def reason(image: dict, state: dict, policy: Policy, now: float) -> str | None:
    if image["source"] != policy.source or not isinstance(image["revision"], str) or not COMMIT.fullmatch(image["revision"]):
        return "ownership-unproven"
    refs = image["tags"] + image["digests"]
    if not refs or any(not canonical(ref).startswith(policy.repository + "@")
                       and not canonical(ref).startswith(policy.repository + ":") for ref in refs):
        return "repository-unproven-or-shared"
    if image["id"] in state["protected_ids"]:
        return "protected-release"
    if any(container["image"] == image["id"] for container in state["containers"]):
        return "container-referenced"
    created = datetime.fromisoformat(image["created"].replace("Z", "+00:00")).timestamp()
    if now - created < policy.minimum_age_seconds:
        return "retention-grace"
    return None


def make_plan(policy: Policy, state: dict, now: float) -> dict:
    candidates, retained = [], []
    for image in state["images"]:
        refusal = reason(image, state, policy, now)
        if refusal is None:
            candidates.append(image)
        else:
            retained.append({"id": image["id"], "reason": refusal})
    deferred = bool(state["pending"] or state["busy_ci"] or state["build_processes"])
    return {"version": 1, "created_at": now, "status": "deferred" if deferred else "planned",
            "release_fingerprint": state["release_fingerprint"], "protected_ids": state["protected_ids"],
            "candidates": candidates, "retained": retained, "busy_ci": state["busy_ci"],
            "build_processes": state["build_processes"], "pending_release": state["pending"],
            "cache_cleanup": "excluded: runner /cache, per-job rootless BuildKit and registry cache need a separately proven owner/store"}


def apply_plan(policy: Policy, docker: Docker, planned: dict) -> dict:
    require(planned.get("version") == 1 and planned.get("status") == "planned", "Plan is unsupported or deferred")
    age = time.time() - planned.get("created_at", 0)
    require(0 <= age <= 600, "Plan expired; create a new dry-run")
    state = snapshot(policy, docker)
    fresh = make_plan(policy, state, time.time())
    require(fresh["status"] == "planned", "CI/build or pending release is active; cleanup deferred")
    require(planned.get("release_fingerprint") == fresh["release_fingerprint"]
            and planned.get("candidates") == fresh["candidates"], "Release references or candidates changed; create a new dry-run")
    before_refs, before_volumes = state["containers"], state["volumes"]
    removed = []
    fs = os.statvfs(policy.root)
    free_before = fs.f_bavail * fs.f_frsize
    for candidate in planned["candidates"]:
        latest = snapshot(policy, docker)
        require(latest["release_fingerprint"] == state["release_fingerprint"] and not latest["pending"]
                and latest["containers"] == before_refs and latest["volumes"] == before_volumes
                and not latest["busy_ci"] and not latest["build_processes"], "References or workload changed; cleanup deferred")
        image = next((value for value in latest["images"] if value["id"] == candidate["id"]), None)
        require(image == candidate and reason(image, latest, policy, time.time()) is None,
                "Candidate became unavailable or protected; cleanup refused")
        docker.run("image", "rm", "--no-prune", candidate["id"])
        removed.append(candidate["id"])
        print(json.dumps({"event": "removed", "id": candidate["id"]}), file=sys.stderr, flush=True)
    after = snapshot(policy, docker)
    require(after["release_fingerprint"] == state["release_fingerprint"] and after["volumes"] == before_volumes
            and after["containers"] == before_refs, "Protected state changed during cleanup; inspect host state")
    require(not set(removed).intersection(value["id"] for value in after["images"]), "Removed image remains present")
    fs = os.statvfs(policy.root)
    return {"status": "applied", "removed_ids": removed,
            "removed_image_size_sum_bytes": sum(value["size_bytes"] for value in planned["candidates"]),
            "filesystem_free_delta_bytes": fs.f_bavail * fs.f_frsize - free_before,
            "protected_ids": after["protected_ids"], "containers_unchanged": True,
            "volumes_unchanged": True, "release_references_unchanged": True,
            "cache_cleanup": planned["cache_cleanup"]}


@contextmanager
def release_lock(policy: Policy) -> Iterator[None]:
    for directory in (policy.root, policy.root / "releases"):
        metadata = directory.lstat()
        require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == 0 and metadata.st_mode & 0o077 == 0,
                "Production directories must be root-private real directories")
    descriptor = os.open(policy.root / "release.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a") as handle:
        metadata = os.fstat(handle.fileno())
        require(metadata.st_uid == 0 and metadata.st_mode & 0o077 == 0, "Release lock is not root-private")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise MaintenanceError("Release or maintenance is active; cleanup deferred") from None
        yield


def main() -> dict:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", "apply", "automatic"))
    parser.add_argument("--plan", type=Path, help="Root-private dry-run JSON, valid for ten minutes")
    args = parser.parse_args()
    require(os.geteuid() == 0, "Maintenance requires the root operator")
    require(args.action != "apply" or args.plan is not None, "Apply requires an explicit dry-run plan")
    policy, docker = Policy(), Docker(Policy().docker_host)
    with release_lock(policy):
        if args.action in ("plan", "automatic"):
            planned = make_plan(policy, snapshot(policy, docker), time.time())
            if args.action == "plan" or planned["status"] == "deferred":
                return planned
            print(json.dumps({"event": "plan", "plan": planned}, sort_keys=True), flush=True)
            return apply_plan(policy, docker, planned)
        raw = private_file(args.plan)
        require(raw is not None, "Plan is missing")
        return apply_plan(policy, docker, json.loads(raw))


if __name__ == "__main__":
    try:
        print(json.dumps(main(), indent=2, sort_keys=True))
    except (MaintenanceError, OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
        print(json.dumps({"status": "refused", "error": str(error)}), file=sys.stderr)
        sys.exit(1)
