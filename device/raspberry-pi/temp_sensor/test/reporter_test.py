import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

requests = types.ModuleType("requests")
requests.RequestException = type("RequestException", (Exception,), {})
requests.post = None
dotenv = types.ModuleType("dotenv")
dotenv.load_dotenv = lambda *_a, **_kw: None
get_temp = types.ModuleType("get_temp")
get_temp.read_temp = lambda _id: 20.0
sys.modules.update({"requests": requests, "dotenv": dotenv, "get_temp": get_temp})

path = Path(__file__).resolve().parents[1] / "supabase_reporter.py"
spec = importlib.util.spec_from_file_location("wineops_reporter", path)
reporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reporter)


class ReporterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db_path = Path(self.temp.name) / "queue.sqlite3"
        self.queue = reporter.DurableQueue(self.db_path, max_bytes=10_000_000, min_free_bytes=0)
        reporter.WINEOPS_API_URL = "https://api.example.test/"
        reporter.WINEOPS_INGEST_TOKEN = "secret-value"
        reporter.REQUEST_TIMEOUT_SECONDS = 90
        self.original_read_temp = reporter.read_temp
        self.original_send = reporter.send_to_api
        self.addCleanup(lambda: setattr(reporter, "read_temp", self.original_read_temp))
        self.addCleanup(lambda: setattr(reporter, "send_to_api", self.original_send))

    def sample(self):
        reporter.report_readings_once(["28-first", "28-second"], "pi01", self.queue)

    def test_settings(self):
        with patch.dict(os.environ, {"REPORT_INTERVAL_SECONDS": "123", "REQUEST_TIMEOUT_SECONDS": "67"}):
            self.assertEqual(reporter.get_reporter_settings(), (123, 67))
        for name in ("REPORT_INTERVAL_SECONDS", "REQUEST_TIMEOUT_SECONDS"):
            with patch.dict(os.environ, {name: "0"}):
                with self.assertRaises(ValueError):
                    reporter.get_reporter_settings()

    def test_fastify_contract_and_timeout(self):
        seen = {}

        class Response:
            status_code = 201

        def post(url, **kwargs):
            seen.update(kwargs)
            seen["url"] = url
            return Response()

        reporter.requests.post = post
        self.assertEqual(
            reporter.send_to_api({"reading_id": "abc", "sensor_id": "s",
                                  "temperature_c": 19.4, "reading_timestamp": "2026-01-01T00:00:00Z"}, "pi01"),
            201,
        )
        self.assertEqual(seen["url"], "https://api.example.test/api/readings")
        self.assertEqual(seen["json"]["device_id"], "pi01")
        self.assertEqual(seen["timeout"], 90)
        self.assertEqual(seen["headers"]["Authorization"], "Bearer secret-value")

    def test_offline_collects_every_sensor_without_http(self):
        reporter.send_to_api = lambda *_a: (_ for _ in ()).throw(requests.RequestException())
        self.sample()
        self.sample()
        self.assertEqual(self.queue.counts(), (4, 0))
        self.assertEqual(reporter.deliver_one(self.queue), "retry")
        self.assertEqual(self.queue.counts(), (4, 0))

    def test_restart_replays_original_metadata(self):
        self.sample()
        original = self.queue.next_pending()
        reopened = reporter.DurableQueue(self.db_path, min_free_bytes=0)
        received = []
        def send(reading, device):
            received.append((reading.copy(), device))
            return 201
        reporter.send_to_api = send
        while reporter.deliver_one(reopened) != "empty":
            pass
        self.assertEqual(self.queue.counts(), (0, 0))
        first = next((reading, device) for reading, device in received
                     if reading["reading_id"] == original["reading_id"])
        self.assertEqual(first[1], original["device_id"])
        self.assertEqual(first[0]["reading_timestamp"], original["reading_timestamp"])
        self.assertEqual(first[0]["sensor_id"], original["sensor_id"])

    def test_timeout_after_commit_retries_same_uuid(self):
        self.sample()
        recorded = set()
        attempts = []
        def ambiguous(reading, _device):
            attempts.append(reading["reading_id"])
            if reading["reading_id"] not in recorded:
                recorded.add(reading["reading_id"])
                raise requests.RequestException("response lost")
            return 200  # Fastify reports duplicate
        reporter.send_to_api = ambiguous
        self.assertEqual(reporter.deliver_one(self.queue), "retry")
        self.assertEqual(reporter.deliver_one(self.queue), "success")
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(len(recorded), 1)
        self.assertEqual(self.queue.counts(), (1, 0))

    def test_permanent_failure_quarantined_does_not_block(self):
        self.sample()
        def send(reading, _device):
            if reading["sensor_id"] == "28-first":
                raise reporter.DeliveryHTTPError(422)
            return 201
        reporter.send_to_api = send
        self.assertEqual(reporter.deliver_one(self.queue), "rejected")
        self.assertEqual(reporter.deliver_one(self.queue), "success")
        self.assertEqual(self.queue.counts(), (0, 1))

    def test_auth_error_is_retryable_not_quarantined(self):
        self.sample()
        reporter.send_to_api = lambda *_a: (_ for _ in ()).throw(reporter.DeliveryHTTPError(401))
        self.assertEqual(reporter.deliver_one(self.queue), "retry")
        self.assertEqual(self.queue.counts(), (2, 0))

    def test_capacity_exhaustion_does_not_evict_existing(self):
        self.sample()
        capped = reporter.DurableQueue(self.db_path, max_bytes=1, min_free_bytes=0)
        with self.assertRaises(reporter.QueueCapacityError):
            capped.enqueue({"reading_id": "test", "sensor_id": "s",
                            "temperature_c": 18, "reading_timestamp": "now"}, "pi01")
        self.assertEqual(self.queue.counts(), (2, 0))

    def test_sensor_failure_does_not_block_other_sensors(self):
        reporter.read_temp = lambda sensor: 21.0 if sensor != "28-first" else (_ for _ in ()).throw(OSError())
        self.sample()
        self.assertEqual(self.queue.counts(), (1, 0))
        self.assertEqual(self.queue.next_pending()["sensor_id"], "28-second")

    def test_sampling_runs_while_delivery_is_blocked(self):
        blocked = threading.Event()
        release = threading.Event()
        def send(_reading, _device):
            blocked.set()
            release.wait(2)
            raise requests.RequestException()
        reporter.send_to_api = send
        self.sample()
        worker = threading.Thread(target=reporter.deliver_one, args=(self.queue,))
        worker.start()
        self.assertTrue(blocked.wait(1))
        self.sample()  # collector is not blocked by in-flight delivery
        self.assertEqual(self.queue.counts(), (4, 0))
        release.set()
        worker.join(2)
        self.assertFalse(worker.is_alive())

    def test_delivery_backoff_is_bounded(self):
        class StopAfterThree(Exception):
            pass
        calls = []
        waits = []
        original = reporter.deliver_one
        reporter.deliver_one = lambda _q: "retry"
        self.addCleanup(lambda: setattr(reporter, "deliver_one", original))
        class Stop:
            def is_set(self):
                return False
            def wait(self, delay):
                waits.append(delay)
                if len(waits) == 12:
                    raise StopAfterThree()
        with patch.object(reporter.time, "monotonic", return_value=100):
            with self.assertRaises(StopAfterThree):
                reporter.delivery_loop(self.queue, Stop())
        self.assertEqual(waits[:4], [1, 2, 4, 8])
        self.assertLessEqual(max(waits), reporter.MAX_BACKOFF_SECONDS)

    def test_failure_logs_do_not_include_secret(self):
        capture = io.StringIO()
        with contextlib.redirect_stdout(capture):
            reporter.log_submission_failure("pi01", {"sensor_id": "s"}, requests.RequestException())
        self.assertNotIn("secret-value", capture.getvalue())


if __name__ == "__main__":
    unittest.main()
