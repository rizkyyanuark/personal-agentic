#!/usr/bin/env python3
"""Release contracts against real HTTP sockets, private files and SQLite."""
from __future__ import annotations

from contextlib import contextmanager
import copy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import sqlite3
import struct
import tarfile
import tempfile
import threading
import time
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "release.py"
SPEC = importlib.util.spec_from_file_location("production_release", SOURCE)
assert SPEC is not None and SPEC.loader is not None
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


@contextmanager
def http_fixture(actions: list[tuple[str, object]]):
    receipts = []
    guard = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *arguments: object) -> None:
            pass

        def do_GET(self) -> None:
            self.respond()

        def do_POST(self) -> None:
            self.respond()

        def respond(self) -> None:
            with guard:
                receipts.append((self.command, self.path, dict(self.headers)))
                action, value = actions[min(len(receipts) - 1, len(actions) - 1)]
            if action == "reset":
                self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
                self.connection.close()
                self.close_connection = True
                return
            if action == "disconnect":
                self.connection.close()
                self.close_connection = True
                return
            if action == "slow":
                time.sleep(float(value))
                value = {"status": "ok"}
            body = value if isinstance(value, bytes) else json.dumps(value).encode()
            self.send_response(503 if action == "unavailable" else 200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body) + 80 if action == "truncated" else len(body)))
            self.end_headers()
            try:
                if action == "drip":
                    for byte in body:
                        self.wfile.write(bytes([byte]))
                        self.wfile.flush()
                        time.sleep(0.01)
                else:
                    self.wfile.write(body)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            self.close_connection = True

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    worker.start()
    try:
        yield "http://127.0.0.1:" + str(server.server_port), receipts
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=1)


class ReadinessTests(unittest.TestCase):
    def test_healthy_response_uses_only_anonymous_health_get(self) -> None:
        with http_fixture([("json", {"product": "Agentic Enterprise", "status": "ok"})]) as (base, receipts):
            release.wait_ready(timeout=0.5, interval=0.01, base=base)
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0][:2], ("GET", "/api/health"))
        self.assertEqual(receipts[0][2]["Host"], release.HOST)
        self.assertNotIn("Authorization", receipts[0][2])
        self.assertNotIn("Cookie", receipts[0][2])

    def test_actual_tcp_reset_then_healthy_service(self) -> None:
        with http_fixture([("reset", None), ("json", {"status": "ok"})]) as (base, receipts):
            release.wait_ready(timeout=0.5, interval=0.01, base=base)
        self.assertEqual(len(receipts), 2)

    def test_disconnect_and_truncated_health_then_healthy_service(self) -> None:
        with http_fixture([("disconnect", None), ("truncated", b'{"status":'),
                           ("json", {"status": "ok"})]) as (base, receipts):
            release.wait_ready(timeout=0.5, interval=0.01, base=base)
        self.assertEqual(len(receipts), 3)

    def test_persistent_failure_and_invalid_payload_have_sanitized_deadline(self) -> None:
        for action in [("reset", None), ("unavailable", {"status": "ok"}),
                       ("json", {"status": "starting", "private": "do-not-log"}),
                       ("json", []), ("json", b"invalid-private-payload")]:
            with self.subTest(action=action[0]), http_fixture([action]) as (base, receipts):
                started = time.monotonic()
                with self.assertRaises(release.ReleaseError) as captured:
                    release.wait_ready(timeout=0.08, interval=0.01, base=base)
                self.assertLess(time.monotonic() - started, 0.35)
                self.assertEqual(str(captured.exception),
                                 "Production controller did not become ready within the startup budget")
                self.assertGreaterEqual(len(receipts), 1)

    def test_slow_http_request_is_bounded_by_remaining_budget(self) -> None:
        with http_fixture([("slow", 0.5)]) as (base, receipts):
            started = time.monotonic()
            with self.assertRaises(release.ReleaseError):
                release.wait_ready(timeout=0.08, interval=0.01, base=base)
            self.assertLess(time.monotonic() - started, 0.3)
            self.assertEqual(len(receipts), 1)

    def test_auth_request_transport_failure_is_not_replayed(self) -> None:
        with http_fixture([("reset", None), ("json", {"ok": True})]) as (base, receipts):
            with self.assertRaises((OSError, release.URLError, release.RemoteDisconnected)):
                release.request("/api/login", body={"token": "fixture-credential"}, timeout=0.1, base=base)
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0][:2], ("POST", "/api/login"))

    def test_slow_drip_healthy_body_cannot_outlive_total_budget(self) -> None:
        with http_fixture([("drip", {"status": "ok"})]) as (base, receipts):
            started = time.monotonic()
            with self.assertRaises(release.ReleaseError):
                release.wait_ready(timeout=0.08, interval=0.01, base=base)
            self.assertLess(time.monotonic() - started, 0.3)
            self.assertEqual(len(receipts), 1)

    def test_deadline_clears_timer_and_restores_previous_handler(self) -> None:
        previous = signal.getsignal(signal.SIGALRM)

        def existing_handler(_number: int, _frame: object) -> None:
            pass

        signal.signal(signal.SIGALRM, existing_handler)
        try:
            for action in (("json", {"status": "ok"}), ("slow", 0.5)):
                with self.subTest(action=action[0]), http_fixture([action]) as (base, _receipts):
                    if action[0] == "slow":
                        with self.assertRaises(release.ReleaseError):
                            release.wait_ready(timeout=0.08, interval=0.01, base=base)
                    else:
                        release.wait_ready(timeout=0.08, interval=0.01, base=base)
                    self.assertEqual(signal.getsignal(signal.SIGALRM), existing_handler)
                    self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0, 0))
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)

    def test_existing_alarm_is_preserved_and_refused_before_network(self) -> None:
        previous = signal.getsignal(signal.SIGALRM)

        def existing_handler(_number: int, _frame: object) -> None:
            pass

        signal.signal(signal.SIGALRM, existing_handler)
        signal.setitimer(signal.ITIMER_REAL, 2)
        try:
            with http_fixture([("json", {"status": "ok"})]) as (base, receipts):
                with self.assertRaises(release.ReleaseError):
                    release.wait_ready(timeout=0.08, interval=0.01, base=base)
                self.assertEqual(receipts, [])
                self.assertEqual(signal.getsignal(signal.SIGALRM), existing_handler)
                self.assertGreater(signal.getitimer(signal.ITIMER_REAL)[0], 1)
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous)

    def test_invalid_timing_is_rejected_before_network(self) -> None:
        for options in ({"timeout": 0}, {"timeout": 91}, {"interval": 0}, {"interval": 3}):
            with self.subTest(options=options), self.assertRaises(release.ReleaseError):
                release.wait_ready(base="http://127.0.0.1:1", **options)


class ReleaseFixtures(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="release-contract-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        os.chmod(self.root, 0o700)
        self.backups = self.root / "backups"
        self.backups.mkdir(mode=0o700)
        self.backup = self.backups / "20261012T010203Z-fixture"
        self.backup.mkdir(mode=0o700)
        self.directory = self.root / "releases"
        self.directory.mkdir(mode=0o700)
        self.old_image = release.REPOSITORY + "@sha256:" + "1" * 64
        self.image = release.REPOSITORY + "@sha256:" + "2" * 64
        self.svg = "3" * 64
        self.former = {"image": self.old_image, "commit": "a" * 40,
                       "svg_sha256": "4" * 64, "backup": str(self.backup), "status": "verified"}
        self.current = {**self.former, "backup": str(self.backups / "older"),
                        "verified_at": "2026-10-11T01:02:03+00:00"}
        self.previous = {"image": release.REPOSITORY + "@sha256:" + "5" * 64,
                         "commit": "c" * 40, "svg_sha256": "6" * 64,
                         "backup": str(self.backups / "previous"), "status": "verified"}
        self.incoming = {"action": "recover", "digest": "sha256:" + "2" * 64,
                         "commit": "b" * 40, "svg_sha256": self.svg}
        self.proof = {"health": 200, "anonymous_state": 401, "invalid_login": 401,
                      "owner_login": 200, "authenticated_state": 200, "cockpit": 200,
                      "logout_revocation": 401, "ui": 200, "svg_sha256": self.svg}
        self.paths = {}
        for volume in release.VOLUMES:
            path = self.root / "fixture-data" / volume
            path.mkdir(parents=True, mode=0o700)
            self.paths[volume] = path
        app = self.paths[release.VOLUMES[0]] / "org" / ".state" / "app.sqlite3"
        app.parent.mkdir(parents=True, mode=0o700)
        self.app = app
        with sqlite3.connect(app) as connection:
            for name in ("runs", "terminal_runs", "artifacts"):
                connection.execute("CREATE TABLE " + name + " (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        with sqlite3.connect(app.with_name("platform.sqlite3")) as connection:
            connection.execute("CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        with sqlite3.connect(self.paths[release.VOLUMES[1]] / "homeserver.db") as connection:
            connection.execute("CREATE TABLE schema_version (version INTEGER NOT NULL)")
            connection.execute("INSERT INTO schema_version VALUES (1)")
        _, schema = release.database_state(self.paths)
        self.pending = {"action": "promote", "image": self.image, "commit": "b" * 40,
                        "svg_sha256": self.svg, "previous": self.former,
                        "backup": str(self.backup), "schema_before": schema,
                        "database_risk": "Image rollback does not reverse database or data migrations",
                        "status": "failed", "error": "ConnectionResetError"}
        self.manifest = {"image": self.old_image, "schema": schema, "archives": {},
                         "runtime_workdir": str(release.RUNTIME_WORKDIR),
                         "identity_key": "runtime-ssh-id_ed25519",
                         "excluded": "Global AGY/provider authentication outside the production workdir"}
        sources = [(volume + ".tar.gz", path) for volume, path in self.paths.items()]
        runtime = self.root / "fixture-runtime"
        runtime.mkdir(mode=0o700)
        (runtime / "PROJECT.md").write_text("Retained production workspace fixture\n")
        sources.append(("runtime-workdirs.tar.gz", runtime))
        for name, path in sources:
            archive = self.backup / name
            with tarfile.open(archive, "w:gz") as output:
                output.add(path, arcname=".")
            os.chmod(archive, 0o600)
            self.manifest["archives"][name] = hashlib.sha256(archive.read_bytes()).hexdigest()
        for name, data in (("production.env", "AE_PLATFORM_IMAGE=" + self.old_image + "\n"),
                           ("compose.yaml", (SOURCE.parent / "compose.yaml").read_text()),
                           ("runtime-ssh-id_ed25519", "isolated fixture, never used for authentication\n")):
            release.atomic(self.backup / name, data.encode())
        self.save_manifest()

    def save_manifest(self) -> None:
        release.save(self.backup / "manifest.json", self.manifest)

    def write_ledger(self, pending: dict[str, object] | None = None) -> None:
        release.save(self.directory / "current.json", self.current)
        release.save(self.directory / "previous.json", self.previous)
        release.save(self.directory / "pending.json", self.pending if pending is None else pending)

    def snapshot(self) -> dict[str, bytes]:
        return {str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob("*") if path.is_file() and not path.is_symlink()}


class RequestAndIdentityTests(ReleaseFixtures):
    def test_recover_parser_requires_digest_full_commit_and_svg(self) -> None:
        self.assertEqual(release.parse_request(json.dumps(self.incoming).encode()), self.incoming)
        for key in ("digest", "commit", "svg_sha256"):
            for operation in ("missing", "invalid"):
                value = dict(self.incoming)
                if operation == "missing":
                    value.pop(key)
                else:
                    value[key] = "invalid"
                with self.subTest(key=key, operation=operation), self.assertRaises(release.ReleaseError):
                    release.parse_request(json.dumps(value).encode())

    def test_recover_parser_rejects_unknown_duplicate_fields_and_rollback_ack(self) -> None:
        for raw in (json.dumps({**self.incoming, "restart": True}).encode(),
                    json.dumps({**self.incoming, "acknowledge_database_risk": True}).encode(),
                    b'{"action":"recover","action":"promote"}', b"[]"):
            with self.subTest(raw=raw), self.assertRaises(release.ReleaseError):
                release.parse_request(raw)

    def test_failed_promotion_matches_verified_predecessor(self) -> None:
        before = copy.deepcopy((self.incoming, self.current, self.previous, self.pending))
        result = release.recovery_record(self.incoming, self.current, self.previous, self.pending)
        self.assertEqual(result, self.pending)
        self.assertEqual((self.incoming, self.current, self.previous, self.pending), before)

    def test_first_promotion_predecessor_does_not_require_older_previous_record(self) -> None:
        self.assertEqual(release.recovery_record(self.incoming, self.current, None, self.pending), self.pending)

    def test_already_verified_candidate_without_pending_is_unchanged(self) -> None:
        current = {**self.pending, "status": "verified", "error": None}
        self.assertIsNone(release.recovery_record(self.incoming, current, self.former, None))

    def test_request_identity_mismatch_does_not_mutate_ledger(self) -> None:
        for key, value in (("digest", "sha256:" + "f" * 64), ("commit", "d" * 40),
                           ("svg_sha256", "e" * 64)):
            before = copy.deepcopy((self.current, self.previous, self.pending))
            with self.subTest(key=key), self.assertRaises(release.ReleaseError):
                release.recovery_record({**self.incoming, key: value}, self.current, self.previous, self.pending)
            self.assertEqual((self.current, self.previous, self.pending), before)

    def test_rollback_missing_or_failed_predecessor_and_stale_current_are_refused(self) -> None:
        cases = [({**self.pending, "action": "rollback"}, self.current),
                 ({**self.pending, "previous": None}, self.current),
                 ({**self.pending, "previous": {**self.former, "status": "failed"}}, self.current),
                 ({**self.pending, "previous": {**self.former, "image": "elsewhere@sha256:" + "1" * 64}}, self.current),
                 ({**self.pending, "backup": "/different/backup"}, self.current),
                 ({**self.pending, "schema_before": {}}, self.current),
                 (self.pending, {**self.current, "commit": "f" * 40}),
                 (self.pending, {**self.current, "status": "failed"})]
        for pending, current in cases:
            with self.subTest(pending=pending, current=current), self.assertRaises(release.ReleaseError):
                release.recovery_record(self.incoming, current, self.previous, pending)

    def test_partial_previous_write_can_be_replayed(self) -> None:
        self.assertEqual(release.recovery_record(self.incoming, self.current, self.former, self.pending), self.pending)
        with self.assertRaises(release.ReleaseError):
            release.recovery_record(self.incoming, self.current, {**self.former, "backup": "/conflict"}, self.pending)

    def test_partial_current_write_requires_exact_verified_transaction(self) -> None:
        pending = {**self.pending, "status": "verified", "verified_at": "2026-10-12T01:02:03+00:00",
                   "smoke": self.proof}
        pending.pop("error")
        self.assertEqual(release.recovery_record(self.incoming, dict(pending), self.former, pending), pending)
        for key, value in (("backup", "/other"), ("schema_before", {"different": "schema"}),
                           ("verified_at", "later"), ("smoke", {}), ("previous", self.previous)):
            with self.subTest(key=key), self.assertRaises(release.ReleaseError):
                release.recovery_record(self.incoming, {**pending, key: value}, self.former, pending)
        with self.assertRaises(release.ReleaseError):
            release.recovery_record(self.incoming, pending, self.previous, pending)


class BackupAndDatabaseTests(ReleaseFixtures):
    def test_exact_four_real_archives_and_sqlite_schema_are_verified(self) -> None:
        before = self.snapshot()
        self.assertEqual(release.verify_recovery_backup(self.pending, root=self.root), self.manifest["archives"])
        self.assertEqual(len(self.manifest["archives"]), 4)
        with tarfile.open(self.backup / (release.VOLUMES[0] + ".tar.gz")) as archive:
            self.assertTrue(any(name.endswith("app.sqlite3") for name in archive.getnames()))
        self.assertEqual(self.snapshot(), before)

    def test_modified_or_missing_archive_is_refused(self) -> None:
        archive = self.backup / (release.VOLUMES[0] + ".tar.gz")
        data = archive.read_bytes()
        archive.write_bytes(data + b"corruption")
        with self.assertRaises(release.ReleaseError):
            release.verify_recovery_backup(self.pending, root=self.root)
        archive.unlink()
        with self.assertRaises((release.ReleaseError, OSError)):
            release.verify_recovery_backup(self.pending, root=self.root)

    def test_manifest_wrong_image_schema_or_archive_set_is_refused(self) -> None:
        for key, value in (("image", self.image), ("schema", {"different": "schema"}),
                           ("archives", {}), ("archives", {**self.manifest["archives"], "extra.tar.gz": "1" * 64})):
            original = copy.deepcopy(self.manifest)
            self.manifest[key] = value
            self.save_manifest()
            with self.subTest(key=key), self.assertRaises(release.ReleaseError):
                release.verify_recovery_backup(self.pending, root=self.root)
            self.manifest = original
        self.save_manifest()

    def test_backup_outside_fixed_directory_and_symlink_are_refused(self) -> None:
        outside = self.root / "outside"
        outside.mkdir(mode=0o700)
        link = self.backups / "redirected"
        link.symlink_to(outside, target_is_directory=True)
        for path in (outside, link, self.backup / ".." / self.backup.name):
            with self.subTest(path=path), self.assertRaises(release.ReleaseError):
                release.verify_recovery_backup({**self.pending, "backup": str(path)}, root=self.root)

    def test_archive_manifest_and_private_config_symlinks_are_refused(self) -> None:
        for name in (release.VOLUMES[0] + ".tar.gz", "manifest.json", "production.env"):
            path = self.backup / name
            original = path.read_bytes()
            target = self.root / ("external-" + name)
            release.atomic(target, original)
            path.unlink()
            path.symlink_to(target)
            with self.subTest(name=name), self.assertRaises(release.ReleaseError):
                release.verify_recovery_backup(self.pending, root=self.root)
            path.unlink()
            release.atomic(path, original)

    def test_nonprivate_directory_archive_or_config_is_refused(self) -> None:
        for path in (self.backup, self.backup / "manifest.json", self.backup / "runtime-ssh-id_ed25519",
                     self.backup / (release.VOLUMES[0] + ".tar.gz")):
            mode = path.stat().st_mode & 0o777
            path.chmod(mode | 0o004)
            with self.subTest(path=path), self.assertRaises(release.ReleaseError):
                release.verify_recovery_backup(self.pending, root=self.root)
            path.chmod(mode)

    def test_nonroot_archive_ownership_is_refused(self) -> None:
        archive = self.backup / (release.VOLUMES[0] + ".tar.gz")
        os.chown(archive, 65534, 65534)
        try:
            with self.assertRaises(release.ReleaseError):
                release.verify_recovery_backup(self.pending, root=self.root)
        finally:
            os.chown(archive, 0, 0)

    def test_invalid_manifest_hash_is_refused(self) -> None:
        archive = release.VOLUMES[0] + ".tar.gz"
        self.manifest["archives"][archive] = "not-sha256"
        self.save_manifest()
        with self.assertRaises(release.ReleaseError):
            release.verify_recovery_backup(self.pending, root=self.root)

    def test_real_sqlite_operations_are_counted_without_changing_schema(self) -> None:
        baseline = release.database_state(self.paths)
        self.assertEqual(baseline[0], 0)
        with sqlite3.connect(self.app) as connection:
            for table, status in (("runs", "waiting"), ("terminal_runs", "running"), ("artifacts", "indexing")):
                connection.execute("INSERT INTO " + table + " VALUES (?, ?)", (table, json.dumps({"status": status})))
        active, schema = release.database_state(self.paths)
        self.assertEqual(active, 3)
        self.assertEqual(schema, baseline[1])
        with sqlite3.connect(self.app) as connection:
            for table in ("runs", "terminal_runs", "artifacts"):
                connection.execute("UPDATE " + table + " SET data=?", (json.dumps({"status": "succeeded"}),))
        self.assertEqual(release.database_state(self.paths), baseline)

    def test_real_sqlite_schema_drift_changes_fingerprint(self) -> None:
        baseline = release.database_state(self.paths)[1]
        with sqlite3.connect(self.app) as connection:
            connection.execute("ALTER TABLE runs ADD COLUMN migration_marker TEXT")
        self.assertNotEqual(release.database_state(self.paths)[1], baseline)


class FinalizationTests(ReleaseFixtures):
    def test_failed_evidence_retained_and_actual_journal_finalized_privately(self) -> None:
        self.write_ledger()
        failed = copy.deepcopy(self.pending)
        result = release.finalize_release(self.pending, self.proof, directory=self.directory)
        fingerprint = hashlib.sha256(json.dumps(failed, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        evidence = self.directory / ("failed-" + fingerprint + ".json")
        self.assertEqual(release.read_record(evidence), failed)
        self.assertEqual(release.read_record(self.directory / "current.json"), result)
        self.assertEqual(release.read_record(self.directory / "previous.json"), self.former)
        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["smoke"], self.proof)
        self.assertEqual(result["failed_record"], str(evidence))
        self.assertNotIn("error", result)
        self.assertFalse((self.directory / "pending.json").exists())
        self.assertFalse(list(self.directory.glob("*.tmp")))
        for path in self.directory.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_replay_verified_pending_after_partial_current_write(self) -> None:
        first = release.finalize_release(self.pending, self.proof, directory=self.directory)
        evidence = Path(first["failed_record"])
        evidence_bytes = evidence.read_bytes()
        release.save(self.directory / "pending.json", first)
        transaction = release.recovery_record(self.incoming, release.read_record(self.directory / "current.json"),
                                             release.read_record(self.directory / "previous.json"),
                                             release.read_record(self.directory / "pending.json"))
        result = release.finalize_release(transaction, self.proof, directory=self.directory)
        self.assertEqual(result, first)
        self.assertEqual(result["failed_record"], first["failed_record"])
        self.assertEqual(evidence.read_bytes(), evidence_bytes)
        self.assertEqual(release.read_record(self.directory / "current.json"), result)
        self.assertEqual(release.read_record(self.directory / "previous.json"), self.former)
        self.assertFalse((self.directory / "pending.json").exists())

        self.assertEqual(len(list(self.directory.glob("failed-*.json"))), 1)
        release.save(self.directory / "pending.json", result)
        replay = release.recovery_record(self.incoming, first, self.former,
                                         release.read_record(self.directory / "pending.json"))
        self.assertEqual(replay, first)
        release.finalize_release(replay, self.proof, directory=self.directory)
        self.assertFalse((self.directory / "pending.json").exists())

    def test_real_current_write_failure_retains_replayable_verified_pending(self) -> None:
        self.write_ledger()
        current_path = self.directory / "current.json"
        current_path.unlink()
        current_path.mkdir(mode=0o700)
        with self.assertRaises(OSError):
            release.finalize_release(self.pending, self.proof, directory=self.directory)
        pending = release.read_record(self.directory / "pending.json")
        self.assertEqual(pending["status"], "verified")
        self.assertNotIn("error", pending)
        self.assertEqual(release.read_record(self.directory / "previous.json"), self.former)
        self.assertFalse(list(self.directory.glob("*.tmp")))

        current_path.rmdir()
        release.save(current_path, self.current)
        replay = release.recovery_record(self.incoming, release.read_record(current_path),
                                         release.read_record(self.directory / "previous.json"), pending)
        result = release.finalize_release(replay, self.proof, directory=self.directory)
        self.assertEqual(result, pending)
        self.assertEqual(release.read_record(current_path), pending)
        self.assertFalse((self.directory / "pending.json").exists())
        self.assertEqual(len(list(self.directory.glob("failed-*.json"))), 1)

    def test_conflicting_failed_evidence_refuses_without_rewriting_records(self) -> None:
        self.write_ledger()
        fingerprint = hashlib.sha256(json.dumps(self.pending, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        evidence = self.directory / ("failed-" + fingerprint + ".json")
        release.save(evidence, {**self.pending, "error": "conflicting-audit"})
        before = self.snapshot()
        with self.assertRaises(release.ReleaseError):
            release.finalize_release(self.pending, self.proof, directory=self.directory)
        self.assertEqual(self.snapshot(), before)

    def test_evidence_symlink_refuses_without_touching_target_or_current(self) -> None:
        self.write_ledger()
        fingerprint = hashlib.sha256(json.dumps(self.pending, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        target = self.root / "external-evidence.json"
        release.save(target, self.pending)
        (self.directory / ("failed-" + fingerprint + ".json")).symlink_to(target)
        before = self.snapshot()
        with self.assertRaises(release.ReleaseError):
            release.finalize_release(self.pending, self.proof, directory=self.directory)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    if os.name != "posix" or os.geteuid() != 0:
        raise SystemExit("Run this suite as root on Linux/Python 3.11+, matching the production helper boundary")
    os.umask(0o077)
    unittest.main(verbosity=2)
