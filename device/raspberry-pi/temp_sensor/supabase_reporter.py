"""Durable, independently scheduled DS18B20 collection and Fastify delivery."""
import os
import shutil
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import get_temp
import requests
from dotenv import load_dotenv

load_dotenv(os.path.expanduser("~/.supabase_env"))

WINEOPS_API_URL = os.getenv("WINEOPS_API_URL")
WINEOPS_INGEST_TOKEN = os.getenv("WINEOPS_INGEST_TOKEN")
DEFAULT_REPORT_INTERVAL_SECONDS = 300
DEFAULT_REQUEST_TIMEOUT_SECONDS = 90
REQUEST_TIMEOUT_SECONDS = DEFAULT_REQUEST_TIMEOUT_SECONDS
# An operational ceiling, not a retention/TTL policy. Actual free disk space
# may become limiting sooner. Never delete undelivered observations to make room.
MAX_QUEUE_BYTES = 256 * 1024 * 1024
MIN_FREE_BYTES = 64 * 1024 * 1024
DELIVERY_SPACING_SECONDS = 1
MAX_BACKOFF_SECONDS = 300
QUEUE_PATH = Path.home() / ".local" / "share" / "wineops" / "readings.sqlite3"


def get_positive_integer_environment(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    if not value.isascii() or not value.isdecimal() or int(value) <= 0:
        raise ValueError(f"{name} must be a positive integer in ~/.supabase_env; got {value!r}.")
    return int(value)


def get_reporter_settings():
    return (
        get_positive_integer_environment("REPORT_INTERVAL_SECONDS", DEFAULT_REPORT_INTERVAL_SECONDS),
        get_positive_integer_environment("REQUEST_TIMEOUT_SECONDS", DEFAULT_REQUEST_TIMEOUT_SECONDS),
    )


def get_sensor_ids():
    sensors = os.getenv("SENSORS")
    if not sensors:
        raise ValueError("No SENSORS configured in environment")
    return [s.strip() for s in sensors.split(",") if s.strip()]


def get_device_id():
    device_id = os.getenv("DEVICE_ID")
    if not device_id:
        raise ValueError("No DEVICE_ID configured in environment")
    return device_id


def read_temp(sensor_id):
    return get_temp.read_temp(sensor_id)


def get_api_configuration():
    if not WINEOPS_API_URL or not WINEOPS_API_URL.startswith("https://"):
        raise ValueError("WINEOPS_API_URL must be configured with an https:// URL")
    if not WINEOPS_INGEST_TOKEN:
        raise ValueError("WINEOPS_INGEST_TOKEN must be configured")
    return WINEOPS_API_URL.rstrip("/"), WINEOPS_INGEST_TOKEN


def send_to_api(reading, device_id):
    api_url, ingest_token = get_api_configuration()
    response = requests.post(
        f"{api_url}/api/readings",
        json={"device_id": device_id, **reading},
        headers={"Authorization": f"Bearer {ingest_token}", "Content-Type": "application/json"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    # Only Fastify's confirmed insert (201) or confirmed duplicate (200)
    # authorizes deletion. 401/403/5xx/timeout must remain retryable.
    if response.status_code not in (200, 201):
        raise DeliveryHTTPError(response.status_code)
    return response.status_code


class DeliveryHTTPError(Exception):
    def __init__(self, status_code):
        self.status_code = status_code
        super().__init__(f"HTTP {status_code}")


class QueueCapacityError(Exception):
    pass


class DurableQueue:
    """SQLite rollback journal + FULL sync; short transactions in each thread."""

    def __init__(self, path=QUEUE_PATH, max_bytes=MAX_QUEUE_BYTES, min_free_bytes=MIN_FREE_BYTES):
        self.path = Path(path)
        self.max_bytes = max_bytes
        self.min_free_bytes = min_free_bytes
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(str(self.path), timeout=10)
        try:
            connection.execute("PRAGMA busy_timeout=10000")
            connection.execute("PRAGMA synchronous=FULL")
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self):
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS observations (
                reading_id TEXT PRIMARY KEY,
                sensor_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                temperature_c REAL NOT NULL,
                reading_timestamp TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending'
                    CHECK(state IN ('pending', 'rejected')),
                attempts INTEGER NOT NULL DEFAULT 0,
                last_status INTEGER
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS pending_order ON observations(state, reading_timestamp)")

    def enqueue(self, reading, device_id):
        # Check both configured cap and actual available volume. A failed
        # insert is loudly reported; we never evict a stored observation.
        used = self.path.stat().st_size
        available = shutil.disk_usage(self.path.parent).free
        if used >= self.max_bytes or available < self.min_free_bytes:
            raise QueueCapacityError(
                f"queue capacity exhausted db_bytes={used} free_bytes={available} "
                f"max_bytes={self.max_bytes} reserve_bytes={self.min_free_bytes}"
            )
        with self.connect() as db:
            db.execute(
                """INSERT INTO observations
                (reading_id,sensor_id,device_id,temperature_c,reading_timestamp)
                VALUES (?,?,?,?,?)""",
                (reading["reading_id"], reading["sensor_id"], device_id,
                 reading["temperature_c"], reading["reading_timestamp"]),
            )

    def next_pending(self):
        with self.connect() as db:
            row = db.execute(
                """SELECT reading_id,sensor_id,device_id,temperature_c,reading_timestamp,attempts
                FROM observations WHERE state='pending'
                ORDER BY reading_timestamp, reading_id LIMIT 1"""
            ).fetchone()
        if row is None:
            return None
        return {
            "reading_id": row[0], "sensor_id": row[1], "device_id": row[2],
            "temperature_c": row[3], "reading_timestamp": row[4], "attempts": row[5],
        }

    def acknowledge(self, reading_id):
        with self.connect() as db:
            db.execute("DELETE FROM observations WHERE reading_id=? AND state='pending'", (reading_id,))

    def failed(self, reading_id, status=None, permanent=False):
        with self.connect() as db:
            db.execute(
                """UPDATE observations SET attempts=attempts+1,last_status=?,
                   state=CASE WHEN ? THEN 'rejected' ELSE state END WHERE reading_id=?""",
                (status, int(permanent), reading_id),
            )

    def counts(self):
        with self.connect() as db:
            results = db.execute(
                "SELECT state, COUNT(*) FROM observations GROUP BY state"
            ).fetchall()
        counts = dict(results)
        return counts.get("pending", 0), counts.get("rejected", 0)


def log_submission_failure(device_id, reading, error):
    print(
        "Reading submission failed: "
        f"device_id={device_id} sensor_id={reading.get('sensor_id', 'unknown')} "
        f"measurement_at={reading.get('reading_timestamp', 'unknown')} "
        f"error={type(error).__name__}",
        flush=True,
    )


def report_readings_once(sensors, device_id, queue):
    for sensor_id in sensors:
        try:
            reading = {
                "reading_id": str(uuid.uuid4()),
                "sensor_id": sensor_id,
                "temperature_c": read_temp(sensor_id),
                "reading_timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as error:
            print(f"Sensor read failed sensor_id={sensor_id} error={type(error).__name__}", flush=True)
            continue
        try:
            queue.enqueue(reading, device_id)
        except (sqlite3.Error, OSError, QueueCapacityError) as error:
            # This reading is not durable: make the loss unambiguously visible.
            print(f"CRITICAL observation NOT STORED sensor_id={sensor_id} "
                  f"reading_id={reading['reading_id']} error={error}", flush=True)


def deliver_one(queue):
    """Return success, empty, retry, or rejected; no request can block sampling."""
    item = queue.next_pending()
    if item is None:
        return "empty"
    reading = {key: item[key] for key in
               ("reading_id", "sensor_id", "temperature_c", "reading_timestamp")}
    try:
        status = send_to_api(reading, item["device_id"])
    except DeliveryHTTPError as error:
        # Bad payload / ID conflict / unknown sensor: quarantine for #58.
        permanent = error.status_code in (400, 409, 422)
        queue.failed(item["reading_id"], error.status_code, permanent)
        log_submission_failure(item["device_id"], reading, error)
        if permanent:
            print(f"PERMANENT rejection reading_id={item['reading_id']} "
                  f"status={error.status_code}; retained for issue #58", flush=True)
        return "rejected" if permanent else "retry"
    except (requests.RequestException, ValueError) as error:
        queue.failed(item["reading_id"])
        log_submission_failure(item["device_id"], reading, error)
        return "retry"
    # Unexpected errors must not acknowledge/delete the reading.
    queue.acknowledge(item["reading_id"])
    if item["attempts"] > 0:
        print(f"Recovered reading_id={item['reading_id']} attempts={item['attempts']} "
              f"status={status}", flush=True)
    return "success"


def delivery_loop(queue, stop_event):
    backoff = 1
    last_diagnostic = 0.0
    while not stop_event.is_set():
        try:
            result = deliver_one(queue)
            now = time.monotonic()
            if now - last_diagnostic >= 300 or last_diagnostic == 0:
                pending, rejected = queue.counts()
                print(f"Queue status pending={pending} rejected={rejected} "
                      f"db_bytes={queue.path.stat().st_size}", flush=True)
                last_diagnostic = now
            if result == "retry":
                delay = backoff
                backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
            else:
                backoff = 1
                delay = DELIVERY_SPACING_SECONDS
        except (sqlite3.Error, OSError) as error:
            print(f"CRITICAL delivery queue error={type(error).__name__}: {error}", flush=True)
            delay = MAX_BACKOFF_SECONDS
        stop_event.wait(delay)


def run_sampling(sensors, device_id, queue, interval, stop_event):
    next_sample = time.monotonic()
    while not stop_event.is_set():
        if stop_event.wait(max(0, next_sample - time.monotonic())):
            return
        report_readings_once(sensors, device_id, queue)
        next_sample += interval
        # Skip missed deadlines rather than allow backlog/retries to cause
        # cumulative drift. Never generate synthetic historical measurements.
        now = time.monotonic()
        if next_sample <= now:
            skipped = int((now - next_sample) // interval) + 1
            next_sample += skipped * interval
            print(f"Sampling overran interval missed_slots={skipped}", flush=True)


def main():
    global REQUEST_TIMEOUT_SECONDS
    interval, REQUEST_TIMEOUT_SECONDS = get_reporter_settings()
    sensors, device_id = get_sensor_ids(), get_device_id()
    get_api_configuration()
    queue = DurableQueue()
    stop_event = threading.Event()
    worker = threading.Thread(target=delivery_loop, args=(queue, stop_event), daemon=True)
    worker.start()
    try:
        run_sampling(sensors, device_id, queue, interval, stop_event)
    finally:
        stop_event.set()
        worker.join(timeout=1)


if __name__ == "__main__":
    main()
