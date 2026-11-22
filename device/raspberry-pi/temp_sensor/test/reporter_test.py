import importlib.util
import os
from pathlib import Path
import sys
import tempfile
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


def reading(identifier="00000000-0000-4000-8000-000000000001"):
    return {"reading_id": identifier, "sensor_id": "28-1", "temperature_c": 20.5,
            "reading_timestamp": "2026-10-26T10:00:00+00:00"}


class ReporterTests(unittest.TestCase):
    def setUp(self):
        reporter.WINEOPS_API_URL = "https://api.example.test/"
        reporter.WINEOPS_INGEST_TOKEN = "not-for-logs"
        reporter.REQUEST_TIMEOUT_SECONDS = reporter.DEFAULT_REQUEST_TIMEOUT_SECONDS
        self.tempdir = tempfile.TemporaryDirectory()
        self.queue_path = os.path.join(self.tempdir.name, "readings.sqlite3")

    def tearDown(self):
        self.tempdir.cleanup()

    def queue(self, capacity=10):
        return reporter.ReadingQueue(self.queue_path, capacity)

    def test_settings_use_defaults_and_reject_invalid_values(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("REPORT_INTERVAL_SECONDS", None)
            os.environ.pop("REQUEST_TIMEOUT_SECONDS", None)
            self.assertEqual(reporter.get_reporter_settings(), (300, 90))
        with patch.dict(os.environ, {"REPORT_INTERVAL_SECONDS": "0"}):
            with self.assertRaisesRegex(Exception, "REPORT_INTERVAL_SECONDS must be a positive integer"):
                reporter.get_reporter_settings()

    def test_send_uses_single_reading_endpoint_timeout_and_bearer_token(self):
        captured = {}
        class Response:
            status_code = 201
            def raise_for_status(self): pass
        def post(url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            return Response()
        reporter.requests.post = post
        reporter.send_to_api(reading(), "pi-1")
        self.assertEqual(captured["url"], "https://api.example.test/api/readings")
        self.assertEqual(captured["timeout"], 90)
        self.assertEqual(captured["headers"]["Authorization"], "Bearer not-for-logs")
        self.assertEqual(captured["json"]["device_id"], "pi-1")

    def test_outage_then_recovery_preserves_original_payload_and_uuid(self):
        queue = self.queue()
        queue.enqueue(reading(), "pi-1", now=10)
        sent = []
        def timeout(_reading, _device_id=None):
            raise reporter.SubmissionError("timeout")
        with patch.object(reporter, "send_to_api", timeout):
            reporter.replay_due_readings(queue)
        saved = queue.next_due(now=10**12)
        self.assertEqual(saved["reading_id"], reading()["reading_id"])
        self.assertEqual(saved["reading_timestamp"], reading()["reading_timestamp"])
        queue.connection.execute("UPDATE pending_readings SET next_attempt_at = 0")
        queue.connection.commit()
        with patch.object(reporter, "send_to_api", lambda item, _device_id=None: sent.append(item.copy())):
            reporter.replay_due_readings(queue)
        self.assertEqual([item["reading_id"] for item in sent], [reading()["reading_id"]])
        self.assertEqual(queue.counts(), (0, 0))
        queue.close()

    def test_restart_persistence_and_ambiguous_timeout_replay_same_uuid_once(self):
        queue = self.queue()
        queue.enqueue(reading(), "pi-1")
        queue.close()
        queue = self.queue()
        seen = []
        def ambiguous(item, _device_id=None):
            seen.append(item["reading_id"])
            raise reporter.SubmissionError("connection lost after request")
        with patch.object(reporter, "send_to_api", ambiguous):
            reporter.replay_due_readings(queue)
        queue.connection.execute("UPDATE pending_readings SET next_attempt_at = 0")
        queue.connection.commit()
        with patch.object(reporter, "send_to_api", lambda item, _device_id=None: seen.append(item["reading_id"])):
            reporter.replay_due_readings(queue)
        self.assertEqual(seen, [reading()["reading_id"], reading()["reading_id"]])
        self.assertEqual(queue.counts()[0], 0)
        queue.close()

    def test_permanent_failure_is_retained_separately_without_blocking_later_reading(self):
        queue = self.queue()
        first, second = reading(), reading("00000000-0000-4000-8000-000000000002")
        queue.enqueue(first, "pi-1")
        queue.enqueue(second, "pi-1")
        sent = []
        def send(item, _device_id=None):
            if item["reading_id"] == first["reading_id"]:
                raise reporter.SubmissionError("invalid sensor", 422)
            sent.append(item["reading_id"])
        with patch.object(reporter, "send_to_api", send):
            reporter.replay_due_readings(queue)
        self.assertEqual(sent, [second["reading_id"]])
        self.assertEqual(queue.counts(), (0, 1))
        queue.close()

    def test_capacity_retains_existing_readings_and_fails_loudly(self):
        queue = self.queue(capacity=1)
        first, second = reading(), reading("00000000-0000-4000-8000-000000000002")
        queue.enqueue(first, "pi-1")
        with self.assertRaises(reporter.QueueFullError):
            queue.enqueue(second, "pi-1")
        self.assertEqual(queue.next_due()["reading_id"], first["reading_id"])
        queue.close()

    def test_queue_capacity_is_at_least_sixty_days_per_sensor(self):
        self.assertGreaterEqual(reporter.QUEUE_READINGS_PER_SENSOR, reporter.MIN_QUEUE_READINGS_PER_SENSOR)
        self.assertEqual(reporter.MIN_QUEUE_READINGS_PER_SENSOR, 17280)

    def test_main_sleeps_until_fixed_next_sample_time(self):
        class StopLoop(Exception): pass
        class Queue:
            path = "/tmp/test-queue"
            capacity = 1
            def close(self): pass
        with patch.object(reporter, "get_reporter_settings", return_value=(300, 90)), \
             patch.object(reporter, "get_sensor_ids", return_value=["28-1"]), \
             patch.object(reporter, "get_device_id", return_value="pi-1"), \
             patch.object(reporter, "ReadingQueue", return_value=Queue()), \
             patch.object(reporter, "report_readings_once"), \
             patch.object(reporter.time, "monotonic", side_effect=[100, 105]), \
             patch.object(reporter.time, "sleep", side_effect=StopLoop) as sleep:
            with self.assertRaises(StopLoop):
                reporter.main()
        sleep.assert_called_once_with(295)


if __name__ == "__main__":
    unittest.main()
