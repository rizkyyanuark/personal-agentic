"""Antigravity SSH discovery against real temporary files, without a model run.

Run with Python 3.11+ on Linux, the SSH bridge's execution environment.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "src/remote_bridge.py"
SPEC = importlib.util.spec_from_file_location("remote_bridge", SOURCE)
assert SPEC is not None and SPEC.loader is not None
BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)


class AntigravitySkills(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ae-skills-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve() / "project"
        self.root.mkdir()

    def install(self, name: str, text: str | bytes, folder: str = ".agents/skills") -> Path:
        path = self.root / folder / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8") if isinstance(text, str) else text)
        return path

    def discover(self, selected: str | None = None) -> dict[str, object]:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = BRIDGE.antigravity_skills({"reference": selected}, self.root)
        self.assertEqual(status, 0)
        value = json.loads(output.getvalue())
        self.assertEqual(set(value), {"cwd", "manifests", "errors", "text"})
        self.assertEqual(value["cwd"], str(self.root))
        return value

    def test_installed_skill_returns_header_and_preview_without_body_execution(self) -> None:
        text = "---\nname: deep-research\ndescription: Research with citations\n---\n# Research\nDo not execute: rm -rf /\n"
        path = self.install("deep-research", text)
        (path.parent / "scripts").mkdir()
        (path.parent / "scripts/SKILL.md").write_text("not a skill", encoding="utf-8")
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [{"path": str(path), "folder_name": "deep-research",
                                              "frontmatter": "name: deep-research\ndescription: Research with citations\n"}])
        self.assertEqual(catalog["errors"], [])
        self.assertIsNone(catalog["text"])
        self.assertEqual(self.discover(str(path))["text"], text)

    def test_bom_line_endings_and_yaml_forms_are_passed_through(self) -> None:
        for newline, bom in (("\n", ""), ("\r\n", ""), ("\n", "\ufeff"), ("\r\n", "\ufeff")):
            with self.subTest(newline=newline, bom=bool(bom)):
                header = newline.join(("name: 'deep-research'", "description: >-", "  Research: with # literal text", ""))
                text = bom + "---" + newline + header + "---" + newline + "Body"
                path = self.install("deep-research", text)
                catalog = self.discover(str(path))
                self.assertEqual(catalog["manifests"][0]["frontmatter"], header)
                self.assertEqual(catalog["text"], text.removeprefix("\ufeff"))
                self.assertEqual(catalog["errors"], [])

    def test_missing_skill_roots_return_empty_catalog(self) -> None:
        self.assertEqual(self.discover(), {"cwd": str(self.root), "manifests": [], "errors": [], "text": None})

    def test_only_direct_children_of_selected_workdir_are_discovered(self) -> None:
        self.install("visible", "---\nname: visible\n---\nBody")
        self.install("nested", "---\nname: nested\n---\nBody", ".agents/skills/visible/scripts")
        self.install("elsewhere", "---\nname: elsewhere\n---\nBody", "other/.agents/skills")
        inherited = self.root.parent / ".agents/skills/ancestor/SKILL.md"
        inherited.parent.mkdir(parents=True)
        inherited.write_text("---\nname: ancestor\n---\nBody", encoding="utf-8")
        catalog = self.discover()
        self.assertEqual([manifest["folder_name"] for manifest in catalog["manifests"]], ["visible"])

    def test_legacy_directory_and_physical_dedup_prefer_agents(self) -> None:
        path = self.install("modern", "---\nname: modern\n---\nBody")
        self.install("legacy", "---\nname: legacy\n---\nBody", ".agent/skills")
        (self.root / ".agent/skills/alias").symlink_to(path.parent, target_is_directory=True)
        catalog = self.discover()
        self.assertEqual([manifest["folder_name"] for manifest in catalog["manifests"]], ["modern", "legacy"])
        self.assertEqual(catalog["errors"], [])

    def test_folder_order_is_deterministic(self) -> None:
        for name in ("zeta", "Beta", "alpha"):
            self.install(name, "---\nname: " + name + "\n---\nBody")
        catalog = self.discover()
        self.assertEqual([manifest["folder_name"] for manifest in catalog["manifests"]], ["alpha", "Beta", "zeta"])

    def test_invalid_frontmatter_framing_is_visible_per_file(self) -> None:
        invalid = {"no-header": "# Body", "not-first": "Body\n---\nname: wrong\n---\n",
                   "unclosed": "---\nname: wrong\n", "binary": b"---\nname: wrong\n---\n\xff"}
        for name, content in invalid.items():
            self.install(name, content)
        self.install("valid", "---\nname: valid\n---\nBody")
        catalog = self.discover()
        self.assertEqual([manifest["folder_name"] for manifest in catalog["manifests"]], ["valid"])
        self.assertEqual(len(catalog["errors"]), 4)
        self.assertTrue(all(error["message"] for error in catalog["errors"]))
        self.assertTrue(any("UTF-8" in error["message"] for error in catalog["errors"]))

    def test_yaml_validation_remains_the_rust_boundary(self) -> None:
        header = "name: [broken YAML\ndescription: [also broken\n"
        self.install("malformed-yaml", "---\n" + header + "---\nBody")
        catalog = self.discover()
        self.assertEqual(catalog["manifests"][0]["frontmatter"], header)
        self.assertEqual(catalog["errors"], [])

    def test_body_and_frontmatter_size_limits_report_errors(self) -> None:
        self.install("large-body", "---\nname: large\n---\n" + "a" * (256 * 1024))
        self.install("large-header", "---\nname: large\ndescription: " + "a" * (16 * 1024) + "\n---\nBody")
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 2)
        self.assertTrue(any("256 KiB" in error["message"] for error in catalog["errors"]))
        self.assertTrue(any("16 KiB" in error["message"] for error in catalog["errors"]))

    def test_preview_limit_accepts_exact_boundary(self) -> None:
        prefix = "---\nname: exact\n---\n"
        text = prefix + "a" * (256 * 1024 - len(prefix.encode("utf-8")))
        path = self.install("exact", text)
        self.assertEqual(len(self.discover(str(path))["text"].encode("utf-8")), 256 * 1024)

    def test_selected_path_must_match_current_canonical_catalog(self) -> None:
        path = self.install("real", "---\nname: real\n---\nBody")
        other = self.root / "README.md"
        other.write_text("Private body", encoding="utf-8")
        for selected in (str(other), str(path.parent / "../real/SKILL.md"),
                         str(self.root.parent / "outside/SKILL.md"), "file:" + str(path)):
            with self.subTest(selected=selected):
                with self.assertRaisesRegex(ValueError, "no longer installed"):
                    self.discover(selected)
        path.unlink()
        with self.assertRaisesRegex(ValueError, "no longer installed"):
            self.discover(str(path))

    def test_external_directory_symlink_never_exposes_header_or_target(self) -> None:
        outside = self.root.parent / "private-target-should-not-leak"
        outside.mkdir()
        (outside / "SKILL.md").write_text("---\nname: secret\n---\nPRIVATE_MARKER", encoding="utf-8")
        root = self.root / ".agents/skills"
        root.mkdir(parents=True)
        (root / "external").symlink_to(outside, target_is_directory=True)
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 1)
        serialized = json.dumps(catalog)
        self.assertNotIn("PRIVATE_MARKER", serialized)
        self.assertNotIn("private-target-should-not-leak", serialized)

    def test_external_skill_root_symlink_is_reported(self) -> None:
        outside = self.root.parent / "outside"
        outside.mkdir()
        (self.root / ".agents").symlink_to(outside, target_is_directory=True)
        (outside / "skills").mkdir()
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 1)
        self.assertIn("inside this workdir", catalog["errors"][0]["message"])

    def test_sensitive_target_symlink_is_reported_without_content(self) -> None:
        sensitive = self.root / ".state/private/SKILL.md"
        sensitive.parent.mkdir(parents=True)
        sensitive.write_text("---\nname: secret\n---\nPRIVATE_MARKER", encoding="utf-8")
        path = self.install("linked", "---\nname: replace\n---\nBody")
        path.unlink()
        path.symlink_to(sensitive)
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 1)
        self.assertNotIn("PRIVATE_MARKER", json.dumps(catalog))
        self.assertNotIn(".state/private", catalog["errors"][0]["message"])

    def test_symlink_to_non_skill_name_is_rejected(self) -> None:
        target = self.root / "README.md"
        target.write_text("---\nname: impostor\n---\nBody", encoding="utf-8")
        path = self.install("linked", "---\nname: replace\n---\nBody")
        path.unlink()
        path.symlink_to(target)
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertIn("Only SKILL.md", catalog["errors"][0]["message"])

    def test_broken_symlink_is_an_error(self) -> None:
        path = self.install("broken", "---\nname: replace\n---\nBody")
        path.unlink()
        path.symlink_to(self.root / "missing/SKILL.md")
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 1)

    def test_symlink_loop_is_an_error_without_a_traceback(self) -> None:
        path = self.install("loop", "---\nname: replace\n---\nBody")
        path.unlink()
        path.symlink_to(path)
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 1)

    def test_non_regular_skill_files_are_rejected_without_blocking(self) -> None:
        fifo = self.install("fifo", "---\nname: replace\n---\nBody")
        fifo.unlink()
        os.mkfifo(fifo)
        directory = self.install("directory", "---\nname: replace\n---\nBody")
        directory.unlink()
        directory.mkdir()
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(len(catalog["errors"]), 2)
        self.assertTrue(all("regular file" in error["message"] for error in catalog["errors"]))

    def test_file_at_installation_directory_is_a_visible_error(self) -> None:
        root = self.root / ".agents"
        root.mkdir()
        (root / "skills").write_text("not a folder", encoding="utf-8")
        catalog = self.discover()
        self.assertEqual(catalog["manifests"], [])
        self.assertEqual(catalog["errors"], [{"path": str(root / "skills"),
                                              "message": "Skill installation path must be a directory"}])

    def test_changed_workspace_identity_is_rejected_before_discovery(self) -> None:
        self.install("real", "---\nname: real\n---\nBody")
        with self.assertRaisesRegex(ValueError, "identity changed"):
            BRIDGE.workspace({"path": str(self.root),
                              "workspace": {"canonical_path": str(self.root / "changed"), "git_root": None}})

    def test_entry_limit_fails_explicitly(self) -> None:
        root = self.root / ".agents/skills"
        root.mkdir(parents=True)
        for index in range(1025):
            (root / f"entry-{index}").touch()
        with self.assertRaisesRegex(ValueError, "1024 directory entries"):
            self.discover()
        (root / "entry-1024").unlink()
        self.assertEqual(self.discover()["manifests"], [])

    def test_candidate_limit_fails_explicitly(self) -> None:
        for index in range(257):
            self.install(f"skill-{index}", "---\nname: real\n---\nBody")
        with self.assertRaisesRegex(ValueError, "256 skill candidates"):
            self.discover()
        (self.root / ".agents/skills/skill-256/SKILL.md").unlink()
        self.assertEqual(len(self.discover()["manifests"]), 256)

    def test_limits_are_shared_across_both_installation_roots(self) -> None:
        for index in range(129):
            self.install(f"modern-{index}", "---\nname: real\n---\nBody")
        for index in range(128):
            self.install(f"legacy-{index}", "---\nname: real\n---\nBody", ".agent/skills")
        with self.assertRaisesRegex(ValueError, "256 skill candidates"):
            self.discover()

    def test_aggregate_header_limit_fails_explicitly(self) -> None:
        header = "name: real\ndescription: " + "a" * (16 * 1024 - len("name: real\ndescription: \n")) + "\n"
        self.assertEqual(len(header.encode("utf-8")), 16 * 1024)
        for index in range(129):
            self.install(f"skill-{index}", "---\n" + header + "---\nBody")
        with self.assertRaisesRegex(ValueError, "2 MiB aggregate limit"):
            self.discover()
        (self.root / ".agents/skills/skill-128/SKILL.md").unlink()
        catalog = self.discover()
        self.assertEqual(len(catalog["manifests"]), 128)
        self.assertEqual(sum(len(manifest["frontmatter"].encode("utf-8"))
                             for manifest in catalog["manifests"]), 2 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main(verbosity=2)
