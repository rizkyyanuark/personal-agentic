#!/usr/bin/env python3
"""Explicit operator smoke using tiny owned OCI images on the real Docker daemon."""
from __future__ import annotations

import argparse
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.request import urlopen
import uuid


def module(path: Path):
    loader = importlib.machinery.SourceFileLoader("ops_smoke_maintenance", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    value = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = value
    spec.loader.exec_module(value)
    return value


def oci_image(path: Path, repository: str, source: str, name: str) -> str:
    content = ("OPS-001 isolated image fixture: " + name + "\n").encode()
    layer = io.BytesIO()
    with tarfile.open(fileobj=layer, mode="w") as archive:
        entry = tarfile.TarInfo("fixture.txt")
        entry.size = len(content)
        archive.addfile(entry, io.BytesIO(content))
    blobs = {}

    def blob(data: bytes, media: str) -> dict:
        digest = hashlib.sha256(data).hexdigest()
        blobs[digest] = data
        return {"mediaType": media, "digest": "sha256:" + digest, "size": len(data)}

    layer_descriptor = blob(layer.getvalue(), "application/vnd.oci.image.layer.v1.tar")
    config = {"created": "2020-01-01T00:00:00Z", "architecture": "arm64", "os": "linux",
              "config": {"Cmd": ["/fixture-does-not-run"], "Labels": {
                  "org.opencontainers.image.source": source, "org.opencontainers.image.revision": "a" * 40}},
              "rootfs": {"type": "layers", "diff_ids": [layer_descriptor["digest"]]},
              "history": [{"created": "2020-01-01T00:00:00Z", "created_by": "OPS isolated fixture"}]}
    config_descriptor = blob(json.dumps(config, separators=(",", ":")).encode(), "application/vnd.oci.image.config.v1+json")
    manifest = {"schemaVersion": 2, "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "config": config_descriptor, "layers": [layer_descriptor]}
    manifest_descriptor = blob(json.dumps(manifest, separators=(",", ":")).encode(), "application/vnd.oci.image.manifest.v1+json")
    reference = repository + "@" + manifest_descriptor["digest"]
    manifest_descriptor["annotations"] = {"org.opencontainers.image.ref.name": reference,
                                          "io.containerd.image.name": reference}
    index = {"schemaVersion": 2, "mediaType": "application/vnd.oci.image.index.v1+json", "manifests": [manifest_descriptor]}
    entries = {"oci-layout": b'{"imageLayoutVersion":"1.0.0"}', "index.json": json.dumps(index).encode()}
    entries.update({"blobs/sha256/" + digest: data for digest, data in blobs.items()})
    with tarfile.open(path, "w") as archive:
        for name, data in entries.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
    return manifest_descriptor["digest"]


def smoke(maintenance):
    require = maintenance.require
    suffix = uuid.uuid4().hex[:12]
    repository = "localhost/personal-agentic-ops-fixture-" + suffix + "/platform"
    source = "https://ops-fixture.invalid/" + suffix
    docker = maintenance.Docker("unix:///var/run/docker.sock")
    baseline_containers = sorted(value["Id"] for value in docker.inspect("container"))
    baseline_volumes = sorted(docker.run("volume", "ls", "--format", "{{.Name}}").splitlines())
    baseline_images = sorted(value["Id"] for value in docker.inspect("image"))
    imported, created_container = [], None
    with tempfile.TemporaryDirectory(prefix="personal-agentic-ops-proof-") as temporary:
        root = Path(temporary)
        root.chmod(0o700)
        (root / "releases").mkdir(mode=0o700)
        policy = maintenance.Policy(root=root, repository=repository, source=source, minimum_age_seconds=0)

        def write(name, data):
            path = root / name
            path.write_text(data)
            path.chmod(0o600)

        def refusal(planned, expected):
            try:
                maintenance.apply_plan(policy, docker, planned)
            except maintenance.MaintenanceError as error:
                require(expected in str(error), "Unexpected refusal: " + str(error))
                return str(error)
            raise AssertionError("Unsafe plan was accepted")

        try:
            refs, ids = {}, {}
            for name in ("current", "previous", "obsolete", "foreign"):
                archive = root / (name + ".tar")
                digest = oci_image(archive, repository, source if name != "foreign" else "https://other-project.invalid/" + suffix, name)
                docker.run("image", "load", "--input", str(archive))
                value = json.loads(docker.run("image", "inspect", repository + "@" + digest))[0]
                imported.append(value["Id"])
                refs[name], ids[name] = repository + "@" + digest, value["Id"]
                require(refs[name] in value.get("RepoDigests", []) + value.get("RepoTags", []),
                        "Docker image store did not resolve fixture digest")
            write("production.env", "AE_PLATFORM_IMAGE=" + refs["current"] + "\n")
            write("releases/current.json", json.dumps({"status": "verified", "image": refs["current"]}))
            previous = json.dumps({"status": "verified", "image": refs["previous"]})
            write("releases/previous.json", previous)
            with maintenance.release_lock(policy):
                plan = maintenance.make_plan(policy, maintenance.snapshot(policy, docker), time.time())
                require([image["id"] for image in plan["candidates"]] == [ids["obsolete"]], "Plan selected a non-fixture or protected image")
                expired = dict(plan, created_at=time.time() - 601)
                expiry_error = refusal(expired, "expired")
                write("releases/previous.json", json.dumps({"status": "verified", "image": refs["obsolete"]}))
                changed_error = refusal(plan, "changed")
                write("releases/previous.json", previous)
                write("releases/pending.json", json.dumps({"status": "failed", "image": refs["obsolete"], "previous": {"image": refs["previous"]}}))
                pending_error = refusal(plan, "pending")
                (root / "releases/pending.json").unlink()
                created_container = docker.run("container", "create", "--name", "runner-ops-fixture-" + suffix,
                                               refs["obsolete"]).strip()
                ci_error = refusal(plan, "CI/build")
                docker.run("container", "rm", created_container)
                created_container = None
                executable = root / "cargo"
                shutil.copyfile("/usr/bin/sleep", executable)
                executable.chmod(0o700)
                build = subprocess.Popen([str(executable), "10"])
                try:
                    time.sleep(0.05)
                    build_error = refusal(plan, "CI/build")
                finally:
                    build.terminate()
                    build.wait(timeout=5)
                result = maintenance.apply_plan(policy, docker, plan)
                require(result["removed_ids"] == [ids["obsolete"]], "Apply removed the wrong identity")
            empty = maintenance.make_plan(policy, maintenance.snapshot(policy, docker), time.time())
            require(empty["candidates"] == [], "Protected/foreign fixtures became candidates")
            with maintenance.release_lock(policy):
                empty_result = maintenance.apply_plan(policy, docker, empty)
            with urlopen("https://agent.tugasakhir.space/api/health", timeout=3) as response:
                require(response.status == 200 and json.loads(response.read())["status"] == "ok", "Production health did not remain ready")
            output = {"result": result, "empty_result": empty_result, "fixture_ids": ids,
                      "refusals": {"expired": expiry_error, "journal_changed": changed_error, "pending": pending_error,
                                   "ci_job_created": ci_error, "real_build_process": build_error},
                      "production_health": 200, "real_dependencies": ["Docker29 daemon/OCI store", "tiny OCI archives", "root-private filesystem", "flock", "real sleep process", "production HTTP health"],
                      "fixture_policy": "Only repo/source/private release root/zero minimum age differ; production methods and Docker transport are real.", "mocks": 0}
        finally:
            if created_container:
                docker.run("container", "rm", created_container)
            inspected = docker.inspect("image")
            for value in inspected:
                labels = value.get("Config", {}).get("Labels") or {}
                refs = value.get("RepoTags", []) + value.get("RepoDigests", [])
                if (value["Id"] not in baseline_images
                        and labels.get("org.opencontainers.image.source") in {source, "https://other-project.invalid/" + suffix}
                        and refs and all(reference.startswith(repository + "@") for reference in refs)):
                    imported.append(value["Id"])
            present = {value["Id"] for value in inspected}
            for image_id in set(imported):
                if image_id in present:
                    docker.run("image", "rm", "--no-prune", image_id)
        require(sorted(value["Id"] for value in docker.inspect("container")) == baseline_containers, "Existing containers changed")
        require(sorted(docker.run("volume", "ls", "--format", "{{.Name}}").splitlines()) == baseline_volumes, "Existing volumes changed")
        require(sorted(value["Id"] for value in docker.inspect("image")) == baseline_images, "Existing images changed")
        output.update({"existing_images_unchanged": True, "existing_containers_unchanged": True, "existing_volumes_unchanged": True,
                       "fixture_cleanup_complete": True, "baseline_image_count": len(baseline_images), "baseline_container_count": len(baseline_containers), "baseline_volume_count": len(baseline_volumes)})
        return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-isolated-image-fixture", action="store_true", required=True,
                        help="Create/delete only this smoke's tiny images and its unstarted container")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run through the root operator")
    print(json.dumps(smoke(module(Path(__file__).resolve().parents[1] / "maintenance.py")), indent=2))
