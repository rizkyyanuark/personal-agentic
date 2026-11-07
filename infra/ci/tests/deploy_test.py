#!/usr/bin/env python3
from contextlib import contextmanager, redirect_stdout
import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deployment", Path(__file__).parents[1] / "deploy.py")
assert spec and spec.loader
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


@contextmanager
def health_server(health):
    requests = []
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(health).encode())
        def log_message(self, *arguments):
            pass
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield "http://127.0.0.1:" + str(server.server_port) + "/api/health", requests
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="deployment-contract-")
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        key, hosts = self.directory / "key", self.directory / "hosts"
        key.write_text("isolated credential fixture, never used for authentication\n")
        hosts.write_text("isolated known-hosts fixture\n")
        self.environment = {"TESTED_IMAGE": "registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform@sha256:" + "a" * 64,
                            "CI_COMMIT_SHA": "b" * 40, "SMOKE_EXPECTED_AGY_SHA256": "c" * 64,
                            "CI_COMMIT_REF_PROTECTED": "true", "CI_COMMIT_BRANCH": "main", "CI_DEFAULT_BRANCH": "main",
                            "PROD_SSH_PRIVATE_KEY": str(key), "PROD_SSH_KNOWN_HOSTS": str(hosts)}
        self.proof = {"action": "promote", "image": self.environment["TESTED_IMAGE"], "commit": "b" * 40,
                      "svg_sha256": "c" * 64, "status": "verified", "verified_at": "2026-10-13T00:00:00+00:00",
                      "smoke": {"health": 200, "anonymous_state": 401, "anonymous_cockpit": 401,
                                "public_office": 200, "public_office_status": "unpublished", "invalid_login": 401,
                                "owner_login": 200, "authenticated_state": 200, "cockpit": 200,
                                "logout_revocation": 401, "ui": 200, "svg_sha256": "c" * 64}}

    @contextmanager
    def command_boundary(self, *, head=None, proof=None, returncode=0, stderr=b""):
        receipts = []
        def run(arguments, **options):
            receipts.append((arguments, options))
            if arguments[0] == "git":
                output = head if head is not None else ("b" * 40 + "\trefs/heads/main\n").encode()
                return subprocess.CompletedProcess(arguments, 0, stdout=output, stderr=b"")
            self.assertEqual(arguments[0], "ssh")
            output = proof if isinstance(proof, bytes) else json.dumps(self.proof if proof is None else proof).encode()
            return subprocess.CompletedProcess(arguments, returncode, stdout=output, stderr=stderr)
        original = Path.cwd()
        os.chdir(self.directory)
        try:
            # Only remote Git/SSH commands are substituted; public HTTP and evidence files are real.
            with patch.object(deployment.subprocess, "run", run), redirect_stdout(io.StringIO()):
                yield receipts
        finally:
            os.chdir(original)

    def test_exact_tested_identity(self):
        request = deployment.release_request(self.environment)
        self.assertEqual(request, {"action": "promote", "digest": "sha256:" + "a" * 64,
                                   "commit": "b" * 40, "svg_sha256": "c" * 64})
        self.environment["TESTED_IMAGE"] = self.environment["TESTED_IMAGE"].replace(".space/", ".space:443/")
        self.assertEqual(deployment.release_request(self.environment), request)

    def test_reject_untrusted_or_mutable_image_and_invalid_identifiers(self):
        for key, value in (("TESTED_IMAGE", "registry.tugasakhir.space/other/platform@sha256:" + "a" * 64),
                           ("TESTED_IMAGE", "registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform:latest"),
                           ("CI_COMMIT_SHA", "b" * 39), ("CI_COMMIT_SHA", "b" * 40 + "\n"),
                           ("SMOKE_EXPECTED_AGY_SHA256", "c" * 63)):
            with self.subTest(key=key, value=value):
                with self.assertRaises(ValueError):
                    deployment.release_request({**self.environment, key: value})

    def test_unprotected_or_feature_branch_refused_before_external_commands(self):
        for protected, branch in (("false", "main"), ("true", "codex/change")):
            with self.assertRaisesRegex(ValueError, "protected main"):
                deployment.deploy({**self.environment, "CI_COMMIT_REF_PROTECTED": protected,
                                   "CI_COMMIT_BRANCH": branch, "CI_DEFAULT_BRANCH": "main"})

    def test_public_health_over_actual_http(self):
        health = {"status": "ok", "product": "Agentic Enterprise"}
        with health_server(health) as (url, requests):
            self.assertEqual(deployment.public_health(url), health)
            health["status"] = "starting"
            with self.assertRaisesRegex(ValueError, "readiness"):
                deployment.public_health(url)
            health.update(status="ok", product="Unrelated service")
            with self.assertRaisesRegex(ValueError, "readiness"):
                deployment.public_health(url)
            self.assertEqual(requests, ["/api/health"] * 3)

    def test_stale_or_missing_main_refuses_before_ssh_and_creates_no_evidence(self):
        for head in (("d" * 40 + "\trefs/heads/main\n").encode(), b""):
            with self.subTest(head=head), self.command_boundary(head=head) as receipts:
                with self.assertRaisesRegex(ValueError, "main has advanced"):
                    deployment.deploy(self.environment)
                self.assertEqual(len(receipts), 1)
                self.assertEqual(receipts[0][0], ["git", "ls-remote", "origin", "refs/heads/main"])
                self.assertFalse((self.directory / "production-release.json").exists())

    def test_verified_release_writes_real_evidence_after_authenticated_proof_and_public_http(self):
        health = {"status": "ok", "product": "Agentic Enterprise"}
        with health_server(health) as (url, requests), self.command_boundary() as receipts:
            deployment.deploy(self.environment, health_url=url)
            self.assertEqual(json.loads((self.directory / "production-release.json").read_text()), self.proof)
            self.assertEqual(json.loads((self.directory / "production-health.json").read_text()), health)
            self.assertEqual(requests, ["/api/health"])
            ssh, options = receipts[1]
            self.assertIn("StrictHostKeyChecking=yes", ssh)
            self.assertIn("IdentitiesOnly=yes", ssh)
            self.assertEqual(options["timeout"], 4500)
            self.assertEqual(ssh[-2:], ["personal-agentic-deploy@172.31.7.134", "release"])
            self.assertEqual(json.loads(options["input"]), deployment.release_request(self.environment))

    def test_unchanged_helper_contract_still_requires_matching_smoke(self):
        proof = {key: self.proof[key] for key in ("action", "image", "commit", "smoke")}
        proof["unchanged"] = True
        payload = deployment.release_request(self.environment)
        self.assertEqual(deployment.verify_proof(proof, payload), proof)
        for changes in ({"status": "failed"}, {"unchanged": 1}, {"action": "rollback"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                deployment.verify_proof({**proof, **changes}, payload)

    def test_accepts_each_valid_public_office_status(self):
        payload = deployment.release_request(self.environment)
        for status in ("published", "unpublished", "unavailable"):
            proof = copy.deepcopy(self.proof)
            proof["smoke"]["public_office_status"] = status
            self.assertEqual(deployment.verify_proof(proof, payload), proof)

    def test_unrelated_failed_incomplete_or_asset_mismatched_proof_creates_no_success_evidence(self):
        proofs = [b"null", b"{invalid JSON", {}, {**self.proof, "image": "unrelated"}, {**self.proof, "commit": "d" * 40},
                  {**self.proof, "svg_sha256": "d" * 64}, {**self.proof, "status": "failed"},
                  {**self.proof, "verified_at": ""}, {**self.proof, "action": "recover"}]
        for key, value in (("owner_login", 401), ("logout_revocation", 200), ("ui", True), ("svg_sha256", "d" * 64),
                           ("anonymous_cockpit", 200), ("public_office", 401), ("public_office_status", "unknown")):
            proof = copy.deepcopy(self.proof)
            proof["smoke"][key] = value
            proofs.append(proof)
        for key in ("anonymous_cockpit", "public_office", "public_office_status"):
            proof = copy.deepcopy(self.proof)
            del proof["smoke"][key]
            proofs.append(proof)
        for proof in proofs:
            with self.subTest(proof=proof):
                with self.command_boundary(proof=proof):
                    with self.assertRaises(ValueError):
                        deployment.deploy(self.environment)
                    self.assertFalse((self.directory / "production-release.json").exists())
                    self.assertFalse((self.directory / "production-health.json").exists())

    def test_busy_helper_refusal_explains_next_action_without_printing_private_stderr(self):
        reason = "Production has active, queued or waiting runs, terminal commands, or indexing; release refused; PRIVATE_SECRET"
        stderr = json.dumps({"status": "failed", "error": reason}).encode()
        with self.command_boundary(returncode=1, stderr=stderr):
            with self.assertRaisesRegex(ValueError, "Retry after it finishes") as failure:
                deployment.deploy(self.environment)
            self.assertNotIn("PRIVATE_SECRET", str(failure.exception))
            self.assertFalse((self.directory / "production-release.json").exists())
        for stderr in (b"SSH failed: PRIVATE_SECRET", b"{invalid PRIVATE_SECRET}",
                       json.dumps({"status": "failed", "error": "Unknown PRIVATE_SECRET"}).encode()):
            with self.subTest(stderr=stderr):
                self.assertNotIn("PRIVATE_SECRET", deployment.helper_failure(stderr))

    def test_safe_stage_category_and_diagnostic_reference_survive_client_mapping(self):
        for category, expected in (("backup_space", "free disk space"), ("runtime_key", "permissions"),
                                   ("command_failed", "command failed"), ("source_restarted", "source was restarted"),
                                   ("guard", "private server release journal")):
            failure = {"status": "failed", "error": "PRIVATE_SECRET", "stage": "backup",
                       "category": category, "diagnostic_reference": "release-" + "a" * 32,
                       "private_stderr": "PRIVATE_SECRET"}
            message = deployment.helper_failure(json.dumps(failure).encode())
            self.assertIn(expected, message)
            self.assertIn("stage: backup", message)
            self.assertIn("release-" + "a" * 32, message)
            self.assertNotIn("PRIVATE_SECRET", message)
            failure["diagnostic_reference"] = "PRIVATE_SECRET"
            failure["stage"] = "PRIVATE_SECRET"
            self.assertNotIn("PRIVATE_SECRET", deployment.helper_failure(json.dumps(failure).encode()))

    def test_failed_public_health_retains_verified_release_record_without_health_success(self):
        with health_server({"status": "starting", "product": "Agentic Enterprise"}) as (url, requests), self.command_boundary():
            with self.assertRaisesRegex(ValueError, "readiness"):
                deployment.deploy(self.environment, health_url=url)
            self.assertEqual(json.loads((self.directory / "production-release.json").read_text()), self.proof)
            self.assertFalse((self.directory / "production-health.json").exists())
            self.assertEqual(requests, ["/api/health"])


if __name__ == "__main__":
    unittest.main()
