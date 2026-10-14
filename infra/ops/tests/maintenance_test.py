#!/usr/bin/env python3
"""Non-destructive release-file and candidate-policy regressions."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "maintenance.py"
if not SOURCE.exists():
    SOURCE = Path(__file__).with_name("maintenance.py")
SPEC = importlib.util.spec_from_file_location("maintenance", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        os.chmod(self.root, 0o700)
        (self.root / "releases").mkdir(mode=0o700)
        self.policy = MODULE.Policy(root=self.root)
        self.current = self.policy.repository + "@sha256:" + "1" * 64
        self.previous = self.policy.repository + "@sha256:" + "2" * 64
        self.write("production.env", "AE_PLATFORM_IMAGE=" + self.current + "\n")
        self.write("releases/current.json", json.dumps({"status": "verified", "image": self.current}))
        self.write("releases/previous.json", json.dumps({"status": "verified", "image": self.previous}))
        self.image = {"id": "sha256:" + "3" * 64, "source": self.policy.source,
                      "revision": "a" * 40, "tags": [], "digests": [self.policy.repository + "@sha256:" + "3" * 64],
                      "created": "2020-01-01T00:00:00Z", "size_bytes": 3}
        self.state = {"protected_ids": ["sha256:" + "1" * 64, "sha256:" + "2" * 64], "containers": []}

    def tearDown(self):
        self.directory.cleanup()

    def write(self, relative, text):
        path = self.root / relative
        path.write_text(text)
        path.chmod(0o600)

    def test_full_owned_unreferenced_old_image_is_candidate(self):
        self.assertIsNone(MODULE.reason(self.image, self.state, self.policy, time.time()))

    def test_owner_label_and_all_repository_references_are_required(self):
        self.image["source"] = "https://other.invalid"
        self.assertEqual(MODULE.reason(self.image, self.state, self.policy, time.time()), "ownership-unproven")
        self.image["source"] = self.policy.source
        self.image["tags"] = ["another-project:latest"]
        self.assertEqual(MODULE.reason(self.image, self.state, self.policy, time.time()), "repository-unproven-or-shared")

    def test_previous_and_stopped_container_images_are_protected(self):
        self.image["id"] = "sha256:" + "2" * 64
        self.assertEqual(MODULE.reason(self.image, self.state, self.policy, time.time()), "protected-release")
        self.image["id"] = "sha256:" + "3" * 64
        self.state["containers"] = [{"image": self.image["id"], "state": "exited"}]
        self.assertEqual(MODULE.reason(self.image, self.state, self.policy, time.time()), "container-referenced")

    def test_recent_creation_is_a_guard_even_with_proven_owner(self):
        self.image["created"] = "2099-01-01T00:00:00Z"
        self.assertEqual(MODULE.reason(self.image, self.state, self.policy, time.time()), "retention-grace")

    def test_journal_protects_all_three_and_pending_predecessor(self):
        pending = self.policy.repository + "@sha256:" + "4" * 64
        self.write("releases/pending.json", json.dumps({"image": pending, "previous": {"image": self.previous}}))
        protected, fingerprint, is_pending = MODULE.protected_references(self.policy)
        self.assertEqual(protected, {self.current, self.previous, pending})
        self.assertTrue(is_pending)
        self.assertEqual(len(fingerprint), 64)

    def test_redirected_or_public_private_journal_is_refused(self):
        path = self.root / "releases/previous.json"
        path.chmod(0o644)
        with self.assertRaises(MODULE.MaintenanceError):
            MODULE.protected_references(self.policy)
        path.unlink()
        path.symlink_to(self.root / "releases/current.json")
        with self.assertRaises(MODULE.MaintenanceError):
            MODULE.protected_references(self.policy)

    def test_existing_release_flock_prevents_maintenance(self):
        import fcntl
        with (self.root / "release.lock").open("a") as held:
            os.chmod(held.name, 0o600)
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(MODULE.MaintenanceError, "active"):
                with MODULE.release_lock(self.policy):
                    self.fail("Second holder acquired the release lock")

    def test_active_runner_container_states_are_detectable(self):
        value = {"Id": "container", "Image": self.image["id"], "Name": "/runner-other-project-job",
                 "State": {"Status": "paused"}, "Config": {"Labels": {}}}
        summary = MODULE.container_summary(value)
        self.assertTrue(summary["ci_job"])
        self.assertIn(summary["state"], MODULE.ACTIVE)


if __name__ == "__main__":
    unittest.main()
