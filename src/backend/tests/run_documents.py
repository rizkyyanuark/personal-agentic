"""Scoped document transport against real files, without a provider/model run.

Run with Python 3.11+ on Linux, the SSH bridge's execution environment.
Temporary HOME is an explicit helper argument; no production module is mocked.
"""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "src/remote_bridge.py"
SPEC = importlib.util.spec_from_file_location("remote_bridge", SOURCE)
assert SPEC is not None and SPEC.loader is not None
BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)
SESSION = "f2dd4dab-d57f-40f2-a328-c7bb275da868"
OTHER_SESSION = "125eb5ea-79e9-40fb-a698-a6ed7327b062"


class RunDocuments(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ae-documents-")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name).resolve() / "home"
        self.home.mkdir()
        self.root = self.home / "project"
        self.root.mkdir()
        self.brain = self.home / ".gemini/antigravity-cli/brain" / SESSION
        self.brain.mkdir(parents=True)
        self.document = self.brain / "plan.md"
        self.data = "# Research\nA verified document.\n".encode("utf-8")
        self.document.write_bytes(self.data)

    def request(self, reference: str | None = None) -> dict[str, object]:
        return {"op": "run_document", "path": str(self.root),
                "workspace": {"canonical_path": str(self.root), "git_root": None},
                "harness": "antigravity", "native_session_id": SESSION,
                "reference": str(self.document) if reference is None else reference}

    def read(self, request: dict[str, object] | None = None) -> dict[str, object]:
        return BRIDGE.run_document(self.request() if request is None else request, self.root, self.home)

    def export_request(self, reference: str = "reports/result.md") -> dict[str, object]:
        return {"op": "export_document", "path": str(self.root),
                "workspace": {"canonical_path": str(self.root), "git_root": None},
                "permission": "workspace-write", "reference": reference,
                "data": base64.b64encode(self.data).decode("ascii"),
                "sha256": hashlib.sha256(self.data).hexdigest()}

    def test_saved_session_document_returns_verified_bytes(self) -> None:
        value = self.read()
        self.assertEqual(value, {"path": str(self.document), "name": "plan.md",
                                 "data": base64.b64encode(self.data).decode("ascii"),
                                 "sha256": hashlib.sha256(self.data).hexdigest(), "size": len(self.data)})

    def test_relative_absolute_and_local_file_url_workspace_documents(self) -> None:
        path = self.root / "Research plan.MARKDOWN"
        path.write_bytes(self.data)
        for reference in (path.name, str(path), path.as_uri(), "file://localhost" + str(path).replace(" ", "%20")):
            with self.subTest(reference=reference):
                self.assertEqual(self.read(self.request(reference))["path"], str(path))

    def test_foreign_session_and_other_home_files_are_denied(self) -> None:
        other = self.brain.parent / OTHER_SESSION / "plan.md"
        other.parent.mkdir()
        other.write_bytes(self.data)
        elsewhere = self.home / "private.md"
        elsewhere.write_bytes(self.data)
        for reference in (str(other), str(elsewhere)):
            with self.subTest(reference=reference), self.assertRaisesRegex(ValueError, "outside this run"):
                self.read(self.request(reference))

    def test_harness_and_native_session_are_required(self) -> None:
        for key, value in (("harness", "codex"), ("native_session_id", None),
                           ("native_session_id", "../" + SESSION), ("native_session_id", "not-a-session")):
            request = self.request()
            request[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.read(request)

    def test_path_traversal_network_urls_and_sensitive_segments_are_denied(self) -> None:
        for reference in (str(self.brain / "../" / OTHER_SESSION / "plan.md"), "../private.md",
                          "file://server/plan.md", "file:///plan.md?download=1", "file:///plan.md#part",
                          "nested\\plan.md", ".env/plan.md", ".state/plan.md", ".git/plan.md",
                          "auth.json/plan.md", "owner.key/plan.md", "plan\x00.md"):
            with self.subTest(reference=reference), self.assertRaises(ValueError):
                self.read(self.request(reference))

    def test_document_symlinks_are_denied_inside_both_roots(self) -> None:
        for path in (self.root / "alias.md", self.brain / "alias.md"):
            path.symlink_to(self.document)
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "without symlinks"):
                self.read(self.request(str(path)))

    def test_every_brain_directory_including_session_root_rejects_symlinks(self) -> None:
        for relative in (".gemini", ".gemini/antigravity-cli", ".gemini/antigravity-cli/brain",
                         ".gemini/antigravity-cli/brain/" + SESSION):
            original = self.home / relative
            moved = self.home / "moved"
            original.rename(moved)
            original.symlink_to(moved, target_is_directory=True)
            try:
                with self.subTest(relative=relative), self.assertRaisesRegex(ValueError, "without symlinks"):
                    self.read()
            finally:
                original.unlink()
                moved.rename(original)

    def test_nested_workspace_symlink_cannot_import_an_external_document(self) -> None:
        (self.root / "linked").symlink_to(self.brain, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "without symlinks"):
            self.read(self.request("linked/plan.md"))

    def test_exact_size_limit_is_accepted_and_larger_document_rejected(self) -> None:
        self.document.write_bytes(b"a" * BRIDGE.MAX_DOCUMENT)
        self.assertEqual(self.read()["size"], BRIDGE.MAX_DOCUMENT)
        self.document.write_bytes(b"a" * (BRIDGE.MAX_DOCUMENT + 1))
        with self.assertRaisesRegex(ValueError, "1 MiB"):
            self.read()

    def test_binary_and_non_markdown_files_are_denied(self) -> None:
        self.document.write_bytes(b"# Header\n\xff")
        with self.assertRaisesRegex(ValueError, "UTF-8"):
            self.read()
        with self.assertRaisesRegex(ValueError, "Markdown"):
            self.read(self.request(str(self.brain / "plan.pdf")))

    def test_fifo_is_rejected_without_opening_it(self) -> None:
        fifo = self.brain / "pipe.md"
        os.mkfifo(fifo)
        with self.assertRaisesRegex(ValueError, "regular file"):
            self.read(self.request(str(fifo)))

    def test_changed_workspace_identity_blocks_read_and_export_at_entrypoint(self) -> None:
        for request in (self.request(), self.export_request()):
            request["workspace"]["canonical_path"] = str(self.root / "changed")
            with self.subTest(op=request["op"]), self.assertRaisesRegex(ValueError, "identity changed"):
                BRIDGE.main(request)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_registered_runtime_is_denied_for_both_operations(self) -> None:
        read = self.request()
        read["workspace"]["runtime_id"] = "worker-id"
        with self.assertRaisesRegex(ValueError, "registered runtime"):
            self.read(read)
        export = self.export_request()
        export["workspace"]["runtime_id"] = "worker-id"
        with self.assertRaisesRegex(ValueError, "registered runtime"):
            BRIDGE.export_document(export, self.root)

    def test_export_creates_requested_relative_file_with_stored_bytes(self) -> None:
        value = BRIDGE.export_document(self.export_request(), self.root)
        path = self.root / "reports/result.md"
        self.assertEqual(value, {"path": str(path)})
        self.assertEqual(path.read_bytes(), self.data)
        self.assertEqual(list(path.parent.iterdir()), [path])
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_read_only_and_unknown_permissions_cannot_create_directories(self) -> None:
        for permission in ("read-only", "unknown", "", None):
            request = self.export_request()
            request["permission"] = permission
            with self.subTest(permission=permission), self.assertRaisesRegex(ValueError, "does not permit"):
                BRIDGE.export_document(request, self.root)
        self.assertEqual(list(self.root.iterdir()), [])
        request = self.export_request()
        request["permission"] = "danger-full-access"
        self.assertEqual(BRIDGE.export_document(request, self.root)["path"], str(self.root / "reports/result.md"))

    def test_export_collision_preserves_original_and_removes_temporary_file(self) -> None:
        request = self.export_request()
        path = self.root / "reports/result.md"
        path.parent.mkdir()
        path.write_bytes(b"original")
        with self.assertRaisesRegex(ValueError, "already exists"):
            BRIDGE.export_document(request, self.root)
        self.assertEqual(path.read_bytes(), b"original")
        self.assertEqual(list(path.parent.iterdir()), [path])

    def test_export_cannot_follow_directory_or_destination_symlinks(self) -> None:
        outside = self.home / "outside"
        outside.mkdir()
        (self.root / "reports").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "without symlinks"):
            BRIDGE.export_document(self.export_request(), self.root)
        self.assertEqual(list(outside.iterdir()), [])
        (self.root / "reports").unlink()
        (self.root / "alias.md").symlink_to(self.document)
        with self.assertRaisesRegex(ValueError, "already exists"):
            BRIDGE.export_document(self.export_request("alias.md"), self.root)
        self.assertEqual(self.document.read_bytes(), self.data)

    def test_export_rejects_escape_sensitive_and_non_markdown_destinations(self) -> None:
        for reference in (str(self.home / "escaped.md"), "../escaped.md", "file:///tmp/escaped.md",
                          "C:\\escaped.md", ".env/result.md", ".state/result.md", ".git/result.md",
                          "owner.key/result.md", "result.pdf", "result\x00.md"):
            with self.subTest(reference=reference), self.assertRaises(ValueError):
                BRIDGE.export_document(self.export_request(reference), self.root)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_export_checks_encoding_utf8_size_and_checksum_before_writing(self) -> None:
        for encoded, sha256 in (("not base64", "invalid"), (base64.b64encode(b"\xff").decode(), "invalid"),
                               (base64.b64encode(b"a" * (BRIDGE.MAX_DOCUMENT + 1)).decode(), "invalid"),
                               (base64.b64encode(self.data).decode(), "0" * 64)):
            request = self.export_request()
            request.update(data=encoded, sha256=sha256)
            with self.subTest(encoded_length=len(encoded)), self.assertRaises(ValueError):
                BRIDGE.export_document(request, self.root)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_existing_viewer_outside_workdir_error_is_clear(self) -> None:
        with self.assertRaisesRegex(ValueError, "outside the saved run workdir"):
            BRIDGE.contained(self.root, str(self.document))

    def test_absolute_root_ancestor_symlink_cannot_redirect_reads_or_exports(self) -> None:
        outside = self.home / "outside-root"
        (outside / "project").mkdir(parents=True)
        document = outside / "project/plan.md"
        document.write_bytes(b"private document")
        alias = self.home / "alias-root"
        alias.symlink_to(outside, target_is_directory=True)
        root = alias / "project"
        with self.assertRaisesRegex(ValueError, "root must exist without symlinks"):
            BRIDGE.run_document(self.request("plan.md"), root, self.home)
        with self.assertRaisesRegex(ValueError, "root must exist without symlinks"):
            BRIDGE.export_document(self.export_request(), root)
        self.assertEqual(document.read_bytes(), b"private document")
        self.assertFalse((outside / "project/reports").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
