import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


requests = types.ModuleType("requests")
requests.RequestException = type("RequestException", (Exception,), {})
requests.post = None
dotenv = types.ModuleType("dotenv")
dotenv.load_dotenv = lambda *_args, **_kwargs: None
get_temp = types.ModuleType("get_temp")
get_temp.read_temp = lambda _sensor_id: 20.0
sys.modules.update({"requests": requests, "dotenv": dotenv, "get_temp": get_temp})

reporter_path = Path(__file__).resolve().parents[1] / "supabase_reporter.py"
spec = importlib.util.spec_from_file_location("wineops_reporter", reporter_path)
reporter = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(reporter)
original_read_temp = reporter.read_temp
original_send_to_api = reporter.send_to_api
original_report_readings_once = reporter.report_readings_once


class ReporterTests(unittest.TestCase):
    def setUp(self):
        reporter.WINEOPS_API_URL = "https://api.example.test/"
        reporter.WINEOPS_INGEST_TOKEN = "not-for-logs"
        reporter.REQUEST_TIMEOUT_SECONDS = reporter.DEFAULT_REQUEST_TIMEOUT_SECONDS
        reporter.read_temp = original_read_temp
        reporter.send_to_api = original_send_to_api
        reporter.report_readings_once = original_report_readings_once

    def test_reporter_settings_use_defaults_when_absent(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("REPORT_INTERVAL_SECONDS", None)
            os.environ.pop("REQUEST_TIMEOUT_SECONDS", None)
            self.assertEqual(
                reporter.get_reporter_settings(),
                (
                    reporter.DEFAULT_REPORT_INTERVAL_SECONDS,
                    reporter.DEFAULT_REQUEST_TIMEOUT_SECONDS,
                ),
            )

    def test_reporter_settings_respect_valid_environment_overrides(self):
        with patch.dict(
            os.environ,
            {"REPORT_INTERVAL_SECONDS": "120", "REQUEST_TIMEOUT_SECONDS": "45"},
        ):
            self.assertEqual(reporter.get_reporter_settings(), (120, 45))

    def test_reporter_settings_reject_invalid_values(self):
        for name in ("REPORT_INTERVAL_SECONDS", "REQUEST_TIMEOUT_SECONDS"):
            for value in ("", " ", "1.5", "0", "-1", "five"):
                with self.subTest(name=name, value=value), patch.dict(
                    os.environ, {name: value}, clear=False
                ):
                    with self.assertRaisesRegex(
                        Exception, f"{name} must be a positive integer"
                    ):
                        reporter.get_reporter_settings()

    def test_submission_uses_single_reading_endpoint_timeout_and_bearer_token(self):
        captured = {}

        class Response:
            status_code = 201

            def raise_for_status(self):
                return None

        def post(url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            return Response()

        reporter.requests.post = post
        reporter.send_to_api({"reading_id": "id", "sensor_id": "28-1", "reading_timestamp": "2026-10-26T10:00:00Z"}, "pi-1")

        self.assertEqual(captured["url"], "https://api.example.test/api/readings")
        self.assertEqual(captured["timeout"], reporter.REQUEST_TIMEOUT_SECONDS)
        self.assertEqual(captured["headers"]["Authorization"], "Bearer not-for-logs")
        self.assertEqual(captured["json"]["device_id"], "pi-1")
        self.assertEqual(captured["json"]["sensor_id"], "28-1")
        self.assertNotIn("readings", captured["json"])

    def test_main_uses_configured_reporting_interval_and_request_timeout(self):
        reported = []

        class StopLoop(Exception):
            pass

        def sleep(seconds):
            self.assertEqual(seconds, 123)
            raise StopLoop()

        reporter.report_readings_once = lambda sensors, device_id: reported.append(
            (sensors, device_id)
        )
        with patch.dict(
            os.environ,
            {"REPORT_INTERVAL_SECONDS": "123", "REQUEST_TIMEOUT_SECONDS": "67"},
        ), patch.object(reporter, "get_sensor_ids", return_value=["28-1"]), patch.object(
            reporter, "get_device_id", return_value="pi-1"
        ), patch.object(reporter.time, "sleep", sleep):
            with self.assertRaises(StopLoop):
                reporter.main()

        self.assertEqual(reported, [(["28-1"], "pi-1")])
        self.assertEqual(reporter.REQUEST_TIMEOUT_SECONDS, 67)

        captured = {}

        class Response:
            status_code = 201

            def raise_for_status(self):
                return None

        def post(_url, **kwargs):
            captured.update(kwargs)
            return Response()

        reporter.requests.post = post
        reporter.send_to_api(
            {
                "reading_id": "id",
                "sensor_id": "28-1",
                "reading_timestamp": "2026-10-26T10:00:00Z",
            },
            "pi-1",
        )
        self.assertEqual(captured["timeout"], 67)

    def test_failure_log_has_operational_context_but_not_token(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            reporter.log_submission_failure(
                "pi-1",
                {"sensor_id": "28-1", "reading_timestamp": "2026-10-26T10:01:00Z"},
                requests.RequestException(),
            )
        message = output.getvalue()
        self.assertIn("device_id=pi-1", message)
        self.assertIn("sensor_id=28-1", message)
        self.assertIn("measurement_at=2026-10-26T10:01:00Z", message)
        self.assertNotIn("not-for-logs", message)

    def test_one_submission_failure_does_not_prevent_later_sensors(self):
        submitted = []
        reporter.read_temp = lambda sensor_id: 20.0 if sensor_id != "bad-read" else (_ for _ in ()).throw(Exception("offline"))

        def send(reading, _device_id):
            submitted.append(reading["sensor_id"])
            if reading["sensor_id"] == "bad-submit":
                raise requests.RequestException()

        reporter.send_to_api = send
        reporter.report_readings_once(["good-first", "bad-read", "bad-submit", "good-last"], "pi-1")
        self.assertEqual(submitted, ["good-first", "bad-submit", "good-last"])


if __name__ == "__main__":
    unittest.main()
