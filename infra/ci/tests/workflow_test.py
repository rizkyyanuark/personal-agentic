#!/usr/bin/env python3
"""Exercise the checked-in CI admission policy without contacting GitLab."""
import argparse
from pathlib import Path
import re
import unittest

CONFIG = Path(__file__).resolve().parents[3] / ".gitlab-ci.yml"


def section(text, name):
    match = re.search(r"^" + re.escape(name) + r":\s*\n(.*?)(?=^\S|\Z)", text, re.MULTILINE | re.DOTALL)
    if match is None:
        raise ValueError("Missing CI section: " + name)
    return match.group(1)


def rules(text, name):
    lines = section(text, name).splitlines()
    if "  rules:" not in lines:
        parent = re.search(r"^  extends: ([.\w-]+)$", section(text, name), re.MULTILINE)
        if parent:
            return rules(text, parent.group(1))
        raise ValueError("No supported rules in " + name)
    result = []
    for line in lines[lines.index("  rules:") + 1:]:
        if not line.strip():
            continue
        if not line.startswith("    "):
            break
        entry = re.fullmatch(r"    - (if|when): (.+)", line)
        if entry:
            key, value = entry.groups()
            if key == "if":
                if not (value.startswith("'") and value.endswith("'")):
                    raise ValueError("Expected a quoted CI expression")
                value = value[1:-1]
            result.append({key: value})
        elif line.startswith("      when: ") and result:
            result[-1]["when"] = line.split(": ", 1)[1]
        else:
            raise ValueError("Unsupported CI rule syntax: " + line)
    if not result:
        raise ValueError("Empty CI rules")
    return result


def matches(expression, environment):
    terms = []
    for term in expression.split("&&"):
        match = re.fullmatch(r'\s*\$([A-Z_][A-Z_0-9]*)(?:\s*==\s*(\$[A-Z_][A-Z_0-9]*|"[^"\n]*"))?\s*', term)
        if match is None:
            raise ValueError("Unsupported CI condition: " + expression)
        variable, other = match.groups()
        value = environment.get(variable)
        if other is None:
            terms.append(bool(value))
        else:
            expected = environment.get(other[1:]) if other.startswith("$") else other[1:-1]
            terms.append(value == expected)
    return all(terms)


def admitted(text, name, environment):
    for rule in rules(text, name):
        if "if" not in rule or matches(rule["if"], environment):
            when = rule.get("when", "always")
            if when not in {"never", "always", "on_success"}:
                raise ValueError("Unsupported CI rule outcome: " + when)
            return when != "never"
    return False


class PipelineAdmission(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = CONFIG.read_text(encoding="utf8")

    def environment(self, **values):
        return {"CI_DEFAULT_BRANCH": "main", "CI_COMMIT_REF_PROTECTED": "false", **values}

    def test_feature_push_is_rejected_before_and_after_mr_creation(self):
        for opened in ("", "rizkyyanuark/personal-agentic!17"):
            with self.subTest(open_merge_requests=opened):
                env = self.environment(CI_PIPELINE_SOURCE="push", CI_COMMIT_BRANCH="fix/example", CI_OPEN_MERGE_REQUESTS=opened)
                self.assertFalse(admitted(self.config, "workflow", env))

    def test_mr_creation_and_updates_are_admitted_without_a_branch_variable(self):
        for event in ("detached", "merged_result", "merge_train"):
            with self.subTest(event=event):
                env = self.environment(CI_PIPELINE_SOURCE="merge_request_event", CI_MERGE_REQUEST_EVENT_TYPE=event)
                self.assertTrue(admitted(self.config, "workflow", env))

    def test_default_branch_retains_push_and_explicit_release_entrypoints(self):
        for source in ("push", "web", "api", "schedule", "trigger", "pipeline"):
            with self.subTest(source=source):
                env = self.environment(CI_PIPELINE_SOURCE=source, CI_COMMIT_BRANCH="main", CI_COMMIT_REF_PROTECTED="true", CI_OPEN_MERGE_REQUESTS="project!1")
                self.assertTrue(admitted(self.config, "workflow", env))
        self.assertTrue(admitted(self.config, "workflow", self.environment(CI_PIPELINE_SOURCE="push", CI_DEFAULT_BRANCH="trunk", CI_COMMIT_BRANCH="trunk")))

    def test_tags_and_other_branch_entrypoints_are_rejected(self):
        for source in ("push", "web", "api", "schedule", "trigger", "pipeline"):
            for values in ({"CI_COMMIT_BRANCH": "fix/example"}, {"CI_COMMIT_TAG": "v1.0"}, {"CI_COMMIT_TAG": "main"}):
                with self.subTest(source=source, values=values):
                    self.assertFalse(admitted(self.config, "workflow", self.environment(CI_PIPELINE_SOURCE=source, **values)))

    def test_image_and_deployment_jobs_still_require_protected_default_branch(self):
        for job in ("image_publish", "image_smoke", "deploy_production"):
            for source, branch, protected, expected in (("push", "main", "true", True), ("push", "main", "false", False), ("push", "fix/example", "true", False), ("merge_request_event", None, "true", False)):
                with self.subTest(job=job, source=source, branch=branch, protected=protected):
                    env = self.environment(CI_PIPELINE_SOURCE=source, CI_COMMIT_BRANCH=branch, CI_COMMIT_REF_PROTECTED=protected)
                    selected = admitted(self.config, "workflow", env) and admitted(self.config, job, env)
                    self.assertEqual(selected, expected)

    def test_worker_packages_remain_opt_in_on_protected_default_branch(self):
        for job in ("worker_windows_package", "worker_linux_package", "worker_publish"):
            for branch, protected, release, expected in (("main", "true", "1", True), ("main", "true", "", False), ("main", "false", "1", False), ("fix/example", "true", "1", False), (None, "true", "1", False)):
                with self.subTest(job=job, branch=branch, protected=protected, release=release):
                    env = self.environment(CI_PIPELINE_SOURCE="web", CI_COMMIT_BRANCH=branch, CI_COMMIT_REF_PROTECTED=protected, AE_WORKER_RELEASE=release)
                    self.assertEqual(admitted(self.config, "workflow", env) and admitted(self.config, job, env), expected)

    def test_unknown_condition_syntax_fails_instead_of_silently_passing(self):
        with self.assertRaises(ValueError):
            matches('$CI_COMMIT_BRANCH =~ /main/', {})

    def test_policy_regression_suite_is_wired_into_ci(self):
        self.assertIn("python -B infra/ci/tests/workflow_test.py", section(self.config, "production_config"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=CONFIG)
    args, unittest_args = parser.parse_known_args()
    CONFIG = args.config
    unittest.main(argv=[__file__, *unittest_args])
