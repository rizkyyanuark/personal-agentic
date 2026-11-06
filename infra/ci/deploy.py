#!/usr/bin/env python3
"""Deploy the tested main image through the existing restricted SSH helper."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Mapping
from urllib.request import urlopen

REPOSITORY = r"registry\.tugasakhir\.space(?::443)?/rizkyyanuark/personal-agentic/platform"


def release_request(environment: Mapping[str, str]) -> dict[str, str]:
    image = re.fullmatch(REPOSITORY + r"@(sha256:[0-9a-f]{64})", environment["TESTED_IMAGE"])
    commit = environment["CI_COMMIT_SHA"]
    svg = environment["SMOKE_EXPECTED_AGY_SHA256"]
    if image is None or re.fullmatch(r"[0-9a-f]{40}", commit) is None or re.fullmatch(r"[0-9a-f]{64}", svg) is None:
        raise ValueError("Release requires the tested repository digest, full commit and source asset hash")
    return {"action": "promote", "digest": image[1], "commit": commit, "svg_sha256": svg}


def public_health(url: str) -> dict[str, object]:
    with urlopen(url, timeout=20) as response:
        health = json.loads(response.read(65537))
    if not isinstance(health, dict) or health.get("status") != "ok" or health.get("product") != "Agentic Enterprise":
        raise ValueError("Public production health did not confirm readiness")
    return health


def helper_failure(stderr: bytes) -> str:
    try:
        failure = json.loads(stderr[:8192])
    except (UnicodeDecodeError, json.JSONDecodeError):
        return "Production release command failed; inspect the private server release journal"
    if not isinstance(failure, dict) or failure.get("status") != "failed" or not isinstance(failure.get("error"), str):
        return "Production release command failed; inspect the private server release journal"
    stages = {"request", "inventory", "preflight", "image-preparation", "stop", "backup",
              "activation", "verification", "finalization", "recovery"}
    categories = {"backup_space": "Insufficient capacity for a new state backup; free disk space before retrying",
                  "backup_volume": "A required backup source is missing, redirected or unreadable",
                  "runtime_key": "The runtime SSH key is missing or its permissions are invalid",
                  "command_failed": "A production command failed; inspect its private diagnostic record",
                  "command_unavailable": "A production command was unavailable or timed out",
                  "source_restarted": "Release aborted before image replacement; the verified source was restarted",
                  "source_restart_failed": "Release failed before image replacement; manual source recovery is required",
                  "candidate_failed": "Candidate startup or verification failed; retained backup and manual recovery are required",
                  "system_error": "Production encountered a system error; inspect its private diagnostic record"}
    stage = failure.get("stage")
    category = failure.get("category")
    context = " (stage: " + stage + ")" if isinstance(stage, str) and stage in stages else ""
    reference = failure.get("diagnostic_reference")
    if isinstance(reference, str) and re.fullmatch(r"release-[0-9a-f]{32}", reference):
        context += "; diagnostic: " + reference
    if isinstance(stage, str) and stage in stages and isinstance(category, str) and category in categories:
        return categories[category] + context
    messages = (
        ("Production has active, queued or waiting runs", "Production has active or queued work; deployment refused before shutdown. Retry after it finishes"),
        ("Preflight failed", "Release preflight check failed; deployment refused before shutdown. Inspect disk space and volume permissions"),
        ("Another production release is in progress", "Another production release is in progress; deployment refused"),
        ("A previous release is incomplete", "A previous release is incomplete; manual recovery is required"),
        ("Production state changed", "Production state changed during preflight; deployment refused"),
        ("Candidate startup or verification failed", "Candidate startup or verification failed; inspect the private journal and retained state backup"),
        ("Release failed before image replacement", "Release failed before image replacement; inspect production state before manual recovery"),
        ("Release aborted before image replacement", "Release aborted before image replacement; the verified source was restarted"),
    )
    for prefix, message in messages:
        if failure["error"].startswith(prefix):
            return message + context
    return "Production helper refused release; inspect the private server release journal" + context


def verify_proof(proof: object, payload: Mapping[str, str]) -> dict[str, object]:
    expected_image = "registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform@" + payload["digest"]
    if not isinstance(proof, dict) or proof.get("image") != expected_image or proof.get("commit") != payload["commit"]:
        raise ValueError("Production helper evidence does not match the tested image and commit")
    smoke = proof.get("smoke")
    checks = {"health": 200, "anonymous_state": 401, "anonymous_cockpit": 401,
              "public_office": 200, "invalid_login": 401, "owner_login": 200,
              "authenticated_state": 200, "cockpit": 200, "logout_revocation": 401, "ui": 200}
    if (not isinstance(smoke, dict) or smoke.get("svg_sha256") != payload["svg_sha256"]
            or smoke.get("public_office_status") not in ("published", "unpublished", "unavailable")
            or any(type(smoke.get(name)) is not int or smoke[name] != expected for name, expected in checks.items())):
        raise ValueError("Production helper did not confirm the tested asset and authenticated application smoke")
    verified = (proof.get("status") == "verified" and proof.get("svg_sha256") == payload["svg_sha256"]
                and isinstance(proof.get("verified_at"), str) and bool(proof["verified_at"]))
    unchanged = proof.get("unchanged") is True and proof.get("status") is None
    if proof.get("action") != "promote" or not (verified or unchanged):
        raise ValueError("Production helper did not return a verified promotion or unchanged release")
    return proof


def deploy(environment: Mapping[str, str], *, health_url: str = "https://agent.tugasakhir.space/api/health") -> None:
    if environment.get("CI_COMMIT_REF_PROTECTED") != "true" or environment.get("CI_COMMIT_BRANCH") != environment["CI_DEFAULT_BRANCH"]:
        raise ValueError("Production deployment requires protected main")
    payload = release_request(environment)
    head = subprocess.run(["git", "ls-remote", "origin", "refs/heads/" + environment["CI_DEFAULT_BRANCH"]],
                          capture_output=True, check=True, timeout=30)
    if head.stdout.decode().split()[:1] != [payload["commit"]]:
        raise ValueError("Deployment refused: main has advanced beyond this pipeline")
    key = Path(environment["PROD_SSH_PRIVATE_KEY"])
    hosts = Path(environment["PROD_SSH_KNOWN_HOSTS"])
    for path in (key, hosts):
        if not path.is_file():
            raise ValueError("Production SSH file variable is unavailable")
        path.chmod(0o600)
    result = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "IdentitiesOnly=yes",
                             "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + str(hosts),
                             "-i", str(key), "personal-agentic-deploy@172.31.7.134", "release"],
                            input=json.dumps(payload).encode(), capture_output=True, check=False, timeout=4500)
    if result.returncode != 0:
        raise ValueError(helper_failure(result.stderr) + " (exit " + str(result.returncode) + ")")
    try:
        proof = verify_proof(json.loads(result.stdout), payload)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Production helper returned invalid JSON release evidence") from None
    Path("production-release.json").write_text(json.dumps(proof, indent=2) + "\n")
    health = public_health(health_url)
    Path("production-health.json").write_text(json.dumps(health, indent=2) + "\n")
    print(json.dumps(proof))


if __name__ == "__main__":
    try:
        deploy(os.environ)
    except subprocess.CalledProcessError as error:
        # SSH/Git stderr can contain private connection or credential details.
        print("Deployment command failed with exit " + str(error.returncode), file=sys.stderr)
        sys.exit(1)
    except ValueError as error:
        print("Deployment failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, KeyError, subprocess.TimeoutExpired) as error:
        print("Deployment failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
