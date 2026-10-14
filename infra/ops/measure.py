#!/usr/bin/env python3
"""Measure host pressure and production health during a named workload window."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import stat
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def counters(path: str) -> dict[str, int]:
    values = {}
    for line in Path(path).read_text().splitlines():
        fields = line.replace(":", "").split()
        if len(fields) >= 2 and fields[1].isdecimal():
            values[fields[0]] = int(fields[1])
    return values


def sample(url: str) -> dict:
    memory = counters("/proc/meminfo")
    vm = counters("/proc/vmstat")
    cpu = [int(value) for value in Path("/proc/stat").read_text().splitlines()[0].split()[1:9]]
    fs = os.statvfs("/")
    started = time.monotonic()
    try:
        with urlopen(Request(url, headers={"User-Agent": "personal-agentic-ops-measure"}), timeout=3) as response:
            body = json.loads(response.read(4096))
            health = {"status": response.status, "ready": isinstance(body, dict) and body.get("status") == "ok"}
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        health = {"status": None, "ready": False, "error": type(error).__name__}
    health["latency_ms"] = round((time.monotonic() - started) * 1000, 2)
    return {"at": datetime.now(timezone.utc).isoformat(), "monotonic": time.monotonic(),
            "cpu": cpu, "memory_available_kib": memory["MemAvailable"],
            "swap_used_kib": memory["SwapTotal"] - memory["SwapFree"],
            "swap_in_pages": vm["pswpin"], "swap_out_pages": vm["pswpout"],
            "oom_kills": vm.get("oom_kill", 0), "disk_free_bytes": fs.f_bavail * fs.f_frsize,
            "inodes_free": fs.f_favail,
            "pressure": {name: Path("/proc/pressure/" + name).read_text().strip()
                         for name in ("cpu", "memory", "io")}, "health": health}


def container_state() -> list[dict]:
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root", "LANG": "C.UTF-8"}
    ids = subprocess.check_output(["docker", "--host", "unix:///var/run/docker.sock", "ps", "-aq"], text=True, env=env, timeout=15).split()
    if not ids:
        return []
    values = json.loads(subprocess.check_output(
        ["docker", "--host", "unix:///var/run/docker.sock", "inspect", *ids], text=True, env=env, timeout=15))
    return [{"id": value["Id"], "name": value["Name"].lstrip("/"), "image": value["Image"],
             "state": value["State"]["Status"], "oom_killed": value["State"]["OOMKilled"],
             "restart_count": value["RestartCount"], "memory_limit_bytes": value["HostConfig"]["Memory"],
             "memory_swap_limit_bytes": value["HostConfig"]["MemorySwap"], "nano_cpus": value["HostConfig"]["NanoCpus"]}
            for value in values]


def write_progress(path: Path, value: dict) -> None:
    descriptor = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    with os.fdopen(descriptor, "a") as handle:
        metadata = os.fstat(handle.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
            raise PermissionError("Progress output must be an owned private regular file")
        handle.write(json.dumps(value) + "\n")
        handle.flush()


def measure(url: str, workload: str, count: int, interval: float,
            stop_file: Path | None = None, progress_file: Path | None = None) -> dict:
    before = container_state()
    samples = []
    for index in range(count):
        if index >= 2 and stop_file is not None and stop_file.exists():
            break
        samples.append(sample(url))
        if progress_file is not None:
            write_progress(progress_file, samples[-1])
        if index + 1 < count:
            time.sleep(interval)
    after = container_state()
    first, last = samples[0], samples[-1]
    deltas = [new - old for old, new in zip(first["cpu"], last["cpu"])]
    elapsed = last["monotonic"] - first["monotonic"]
    restarts = [{"name": value["name"], "delta": value["restart_count"] - previous["restart_count"]}
                for value in after for previous in before if value["id"] == previous["id"]
                and value["restart_count"] > previous["restart_count"]]
    before_prod = {value["id"] for value in before if value["name"].startswith("personal-agentic-prod-")}
    after_prod = {value["id"] for value in after if value["name"].startswith("personal-agentic-prod-")}
    failures = sum(not value["health"]["ready"] or value["health"]["status"] != 200 for value in samples)
    oom_delta = last["oom_kills"] - first["oom_kills"]
    warning = failures > 0 or oom_delta > 0 or bool(restarts) or before_prod != after_prod
    summary = {"observed_seconds": round(elapsed, 2), "samples": len(samples),
               "health_failures": failures, "health_max_latency_ms": max(value["health"]["latency_ms"] for value in samples),
               "memory_available_min_kib": min(value["memory_available_kib"] for value in samples),
               "swap_used_max_kib": max(value["swap_used_kib"] for value in samples),
               "swap_in_pages_delta": last["swap_in_pages"] - first["swap_in_pages"],
               "swap_out_pages_delta": last["swap_out_pages"] - first["swap_out_pages"],
               "cpu_busy_percent": round((1 - (deltas[3] + deltas[4]) / sum(deltas)) * 100, 2) if sum(deltas) else None,
               "cpu_iowait_percent": round(deltas[4] / sum(deltas) * 100, 2) if sum(deltas) else None,
               "disk_free_min_bytes": min(value["disk_free_bytes"] for value in samples),
               "inodes_free_min": min(value["inodes_free"] for value in samples),
               "oom_kills_delta": oom_delta, "restarts": restarts, "production_container_ids_unchanged": before_prod == after_prod}
    return {"status": "warning" if warning else "observed", "workload": workload,
            "scope": "This named observation window does not establish concurrent-project or peak-build capacity.",
            "summary": summary, "containers_before": before, "containers_after": after, "samples": samples}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workload", required=True, help="Name the actual workload; do not label an idle window a build peak")
    parser.add_argument("--url", default="https://agent.tugasakhir.space/api/health")
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--interval", type=float, default=3)
    parser.add_argument("--stop-file", type=Path, help="End after at least two samples when this operator-owned marker exists")
    parser.add_argument("--progress-file", type=Path, help="Append each sample to an owned mode0600 JSONL file")
    args = parser.parse_args()
    if not 2 <= args.samples <= 3600 or not 0.1 <= args.interval <= 60:
        parser.error("Use 2..3600 samples and a 0.1..60 second interval")
    try:
        result = measure(args.url, args.workload, args.samples, args.interval, args.stop_file, args.progress_file)
    except (OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        print(json.dumps({"status": "unavailable", "error": type(error).__name__}))
        raise SystemExit(1) from error
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["status"] == "warning" else 0)
