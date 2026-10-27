import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest


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


class ReporterTests(unittest.TestCase):
    def setUp(self):
        reporter.WINEOPS_API_URL = "https://api.example.test/"
        reporter.WINEOPS_INGEST_TOKEN = "not-for-logs"
        reporter.read_temp = original_read_temp
        reporter.send_to_api = original_send_to_api

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
