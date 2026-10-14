#!/usr/bin/env python3
"""Exercise the real stopped-container backup against disposable Docker state."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import time
from urllib.request import Request, urlopen
import uuid


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-isolated-docker", action="store_true", required=True)
    parser.add_argument("--image", required=True, help="Already present immutable production image; no pull or build")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit("Use a root operator for private filesystem proof")
    spec = importlib.util.spec_from_file_location("release", Path(__file__).parents[1] / "release.py")
    assert spec and spec.loader
    release = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release)
    prefix = "personal-agentic-backup-proof-" + uuid.uuid4().hex[:12]
    volumes = tuple(prefix + "_" + suffix for suffix in ("platform-data", "matrix-data", "platform-workdir"))
    container = prefix + "-platform-1"

    def docker(*arguments: str) -> bytes:
        result = subprocess.run(["docker", *arguments], capture_output=True, check=False, timeout=120)
        if result.returncode:
            raise RuntimeError("Fixture Docker command failed: " + " ".join(arguments[:2]))
        return result.stdout

    before_containers = set(docker("ps", "-aq", "--no-trunc").decode().split())
    before_volumes = set(docker("volume", "ls", "-q").decode().split())
    root = Path(tempfile.mkdtemp(prefix=prefix + "-"))
    os.chmod(root, 0o700)
    created = []
    try:
        metadata = json.loads(docker("image", "inspect", args.image))[0]
        assert args.image in metadata.get("RepoDigests", [])
        assert metadata["Architecture"] == "arm64"
        for name in volumes:
            docker("volume", "create", "--label", "personal-agentic.acceptance=CI-003", name)
            created.append(name)
        paths = {value["Name"]: Path(value["Mountpoint"])
                 for value in json.loads(docker("volume", "inspect", *volumes))}
        for path in paths.values():
            os.chown(path, 10001, 10001)
        (paths[volumes[1]] / "media-sentinel.txt").write_text("Disposable Matrix media fixture\n")
        with sqlite3.connect(paths[volumes[1]] / "homeserver.db") as connection:
            connection.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
            connection.execute("INSERT INTO schema_version VALUES (1)")
        (paths[volumes[2]] / "source-sentinel.txt").write_text("Internal platform workdir fixture\n")
        key = root / "runtime-ssh" / "keys" / "selected-key"
        key.parent.mkdir(parents=True, mode=0o700)
        key.write_text("Disposable key fixture; never used for authentication\n")
        key.chmod(0o400)
        os.chown(key, 10001, 10001)
        release.ROOT, release.ENV_FILE, release.COMPOSE = root, root / "production.env", root / "compose.yaml"
        release.PROJECT, release.VOLUMES = prefix, volumes
        release.atomic(release.ENV_FILE, ('AE_PLATFORM_IMAGE=' + args.image + '\nAE_SSH_KEY_FILE="' + str(key) + '"\n').encode())
        release.atomic(release.COMPOSE, ("services:\n  platform:\n    image: ${AE_PLATFORM_IMAGE}\n    volumes:\n      - type: bind\n        source: ${AE_SSH_KEY_FILE}\n        target: /run/ae-ssh/id_ed25519\n").encode())
        assert release.selected_runtime_key() == key
        docker("run", "-d", "--name", container, "--label", "personal-agentic.acceptance=CI-003",
               "--cpus", "0.25", "--memory", "256m", "--memory-swap", "512m", "--pids-limit", "128",
               "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--log-opt", "max-size=2m",
               "--log-opt", "max-file=2", "-p", "127.0.0.1:18770:8765",
               "--mount", "type=volume,source=" + volumes[0] + ",target=/data",
               "--mount", "type=volume,source=" + volumes[2] + ",target=/workdir",
               "-e", "AE_PUBLIC_URL=http://127.0.0.1:18770", args.image)
        base = "http://127.0.0.1:18770"
        deadline = time.monotonic() + 60
        while True:
            try:
                with urlopen(base + "/api/health", timeout=2) as response:
                    assert json.load(response)["status"] == "ok"
                break
            except (OSError, ValueError):
                if time.monotonic() >= deadline:
                    raise RuntimeError("Disposable app did not become ready") from None
                time.sleep(0.5)
        owner = (paths[volumes[0]] / "org/.state/owner.key").read_text().strip()
        with urlopen(Request(base + "/api/state", headers={"Authorization": "Bearer " + owner}), timeout=5) as response:
            state = json.load(response)
            assert isinstance(state["groups"], list)
        docker("exec", container, "sh", "-c", "mkdir -p /home/agent/.codex; printf 'model = \"fixture-model\"\\n' > /home/agent/.codex/config.toml")
        home_bytes = int(docker("exec", container, "du", "-sb", "/home/agent").split()[0])
        active, schema = release.database_state(paths)
        assert active == 0
        release.preflight(paths, identity=key, home_bytes=home_bytes)
        docker("stop", "--time", "20", container)
        directory = release.backup(paths, args.image, schema, identity=key, home_bytes=home_bytes)
        manifest = json.loads((directory / "manifest.json").read_text())
        transaction = {"backup": str(directory), "previous": {"image": args.image}, "schema_before": schema}
        hashes = release.verify_recovery_backup(transaction, root=root)
        assert len(hashes) == 4 and manifest["format"] == 2
        assert (directory / "runtime-ssh-id_ed25519").read_bytes() == key.read_bytes()
        with tarfile.open(directory / "platform-home.tar") as archive:
            member = next(item for item in archive.getmembers() if item.name.endswith(".codex/config.toml"))
            assert archive.extractfile(member).read() == b'model = "fixture-model"\n'
        with tarfile.open(directory / (volumes[2] + ".tar.gz")) as archive:
            member = next(item for item in archive.getmembers() if item.name.endswith("source-sentinel.txt"))
            assert b"Internal platform" in archive.extractfile(member).read()
        assert all((directory / name).stat().st_mode & 0o777 == 0o600 for name in hashes)
        assert release.database_state(paths) == (active, schema)
        print(json.dumps({"status": "passed", "app_health": 200, "authenticated_state": 200,
                          "archives_verified": 4, "controller_home_config_verified": True,
                          "internal_workdir_verified": True, "private_archive_mode": "0600",
                          "quoted_selected_key_verified": True, "nested_selected_key_verified": True,
                          "runtime_key_owner": 10001, "runtime_key_mode": "0400", "real_app_sqlite_schema_unchanged": True,
                          "matrix_data": "real SQLite and media fixture, no Synapse execution claim",
                          "helper_sha256": hashlib.sha256((Path(__file__).parents[1] / "release.py").read_bytes()).hexdigest(),
                          "mocks": 0}))
    finally:
        if container in docker("ps", "-a", "--format", "{{.Names}}").decode().split():
            docker("rm", "-f", container)
        for name in created:
            docker("volume", "rm", name)
        assert root.name.startswith(prefix) and root.parent == Path(tempfile.gettempdir())
        shutil.rmtree(root)
        assert set(docker("ps", "-aq", "--no-trunc").decode().split()) == before_containers
        assert set(docker("volume", "ls", "-q").decode().split()) == before_volumes
        print(json.dumps({"fixture_cleanup": "passed", "pre_existing_containers_and_volumes": "unchanged"}))


if __name__ == "__main__":
    main()
