#!/usr/bin/env python3
"""Exercise measurement failure paths through real loopback HTTP and Linux counters."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "measure.py"
if not SOURCE.exists():
    SOURCE = Path(__file__).with_name("measure.py")
SPEC = importlib.util.spec_from_file_location("ops_measure", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HealthFixture(BaseHTTPRequestHandler):
    def do_GET(self):
        payloads = {"/ok": (200, b'{"status":"ok"}'), "/outage": (503, b'{"status":"unavailable"}'),
                    "/wrong-shape": (200, b'[]'), "/invalid-json": (200, b'broken')}
        code, body = payloads[self.path]
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


class MeasurementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), HealthFixture)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_health_and_actual_linux_resource_sample(self):
        value = MODULE.sample(self.base + "/ok")
        self.assertEqual(value["health"]["status"], 200)
        self.assertTrue(value["health"]["ready"])
        self.assertGreater(value["memory_available_kib"], 0)
        self.assertGreater(value["inodes_free"], 0)
        self.assertEqual(len(value["cpu"]), 8)

    def test_http_outage_records_failure_instead_of_success(self):
        value = MODULE.sample(self.base + "/outage")
        self.assertFalse(value["health"]["ready"])
        self.assertEqual(value["health"]["error"], "HTTPError")

    def test_success_status_with_wrong_body_shape_is_not_ready(self):
        value = MODULE.sample(self.base + "/wrong-shape")
        self.assertEqual(value["health"]["status"], 200)
        self.assertFalse(value["health"]["ready"])

    def test_invalid_json_is_an_explicit_failure(self):
        value = MODULE.sample(self.base + "/invalid-json")
        self.assertFalse(value["health"]["ready"])
        self.assertEqual(value["health"]["error"], "JSONDecodeError")

    def test_cli_refuses_unbounded_or_single_sample_window(self):
        result = subprocess.run([sys.executable, "-B", str(SOURCE), "--workload", "invalid-window", "--samples", "1"],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn("2..3600", result.stderr)

    def test_progress_file_is_private_and_preserves_real_sample(self):
        import json
        import stat
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "samples.jsonl"
            value = MODULE.sample(self.base + "/ok")
            MODULE.write_progress(path, value)
            self.assertEqual(json.loads(path.read_text()), value)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_progress_refuses_public_file_and_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "public.jsonl"
            path.write_text("private data remains unchanged")
            path.chmod(0o644)
            with self.assertRaises(PermissionError):
                MODULE.write_progress(path, {"sample": 1})
            self.assertEqual(path.read_text(), "private data remains unchanged")
            link = Path(temporary) / "redirect.jsonl"
            link.symlink_to(path)
            with self.assertRaises(OSError):
                MODULE.write_progress(link, {"sample": 1})


if __name__ == "__main__":
    unittest.main()
