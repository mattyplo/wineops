import os
import sqlite3
import time
import uuid
from datetime import datetime, timezone

import get_temp
import requests
from dotenv import load_dotenv

load_dotenv(os.path.expanduser("~/.supabase_env"))
WINEOPS_API_URL = os.getenv("WINEOPS_API_URL")
WINEOPS_INGEST_TOKEN = os.getenv("WINEOPS_INGEST_TOKEN")
DEFAULT_REPORT_INTERVAL_SECONDS = 300
DEFAULT_REQUEST_TIMEOUT_SECONDS = 90
REQUEST_TIMEOUT_SECONDS = DEFAULT_REQUEST_TIMEOUT_SECONDS
MIN_QUEUE_READINGS_PER_SENSOR = 60 * 24 * 12
QUEUE_READINGS_PER_SENSOR = MIN_QUEUE_READINGS_PER_SENSOR * 2
MAX_REPLAY_PER_CYCLE = 5
REPLAY_BUDGET_SECONDS = 30
INITIAL_RETRY_SECONDS = 60
MAX_RETRY_SECONDS = 3600


class QueueFullError(Exception):
    pass


class SubmissionError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def default_queue_path():
    return os.path.join(os.getenv("XDG_STATE_HOME", os.path.expanduser("~/.local/state")), "wineops", "readings.sqlite3")


class ReadingQueue:
    """Transactional, durable outbox for one reporter process."""
    def __init__(self, path, capacity):
        self.path, self.capacity = path, capacity
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, mode=0o700, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.execute("""CREATE TABLE IF NOT EXISTS pending_readings (
            reading_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, sensor_id TEXT NOT NULL,
            temperature_c REAL NOT NULL, reading_timestamp TEXT NOT NULL, queued_at REAL NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at REAL NOT NULL, last_error TEXT)""")
        self.connection.execute("""CREATE TABLE IF NOT EXISTS rejected_readings (
            reading_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, sensor_id TEXT NOT NULL,
            temperature_c REAL NOT NULL, reading_timestamp TEXT NOT NULL, rejected_at REAL NOT NULL,
            attempts INTEGER NOT NULL, last_error TEXT NOT NULL)""")
        self.connection.execute("CREATE INDEX IF NOT EXISTS pending_readings_due ON pending_readings(next_attempt_at, queued_at)")
        self.connection.commit()

    def close(self):
        self.connection.close()

    def enqueue(self, reading, device_id, now=None):
        now = time.time() if now is None else now
        with self.connection:
            if self.connection.execute("SELECT 1 FROM pending_readings WHERE reading_id = ?", (reading["reading_id"],)).fetchone():
                return
            pending = self.connection.execute("SELECT COUNT(*) FROM pending_readings").fetchone()[0]
            if pending >= self.capacity:
                raise QueueFullError(f"durable queue is full ({pending}/{self.capacity}); existing readings were retained")
            self.connection.execute("""INSERT INTO pending_readings
                (reading_id, device_id, sensor_id, temperature_c, reading_timestamp, queued_at, next_attempt_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""", (reading["reading_id"], device_id, reading["sensor_id"], reading["temperature_c"], reading["reading_timestamp"], now, now))

    def next_due(self, now=None):
        now = time.time() if now is None else now
        row = self.connection.execute("""SELECT reading_id, device_id, sensor_id, temperature_c, reading_timestamp, attempts
            FROM pending_readings WHERE next_attempt_at <= ? ORDER BY queued_at LIMIT 1""", (now,)).fetchone()
        if not row:
            return None
        return dict(zip(("reading_id", "device_id", "sensor_id", "temperature_c", "reading_timestamp", "attempts"), row))

    def delivered(self, reading_id):
        with self.connection:
            self.connection.execute("DELETE FROM pending_readings WHERE reading_id = ?", (reading_id,))

    def retry(self, reading_id, attempts, error, now=None):
        now = time.time() if now is None else now
        delay = min(INITIAL_RETRY_SECONDS * (2 ** min(attempts - 1, 10)), MAX_RETRY_SECONDS)
        with self.connection:
            self.connection.execute("UPDATE pending_readings SET attempts=?, next_attempt_at=?, last_error=? WHERE reading_id=?", (attempts, now + delay, error, reading_id))
        return delay

    def reject(self, reading, error, now=None):
        now = time.time() if now is None else now
        with self.connection:
            self.connection.execute("""INSERT OR REPLACE INTO rejected_readings
                (reading_id, device_id, sensor_id, temperature_c, reading_timestamp, rejected_at, attempts, last_error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", (reading["reading_id"], reading["device_id"], reading["sensor_id"], reading["temperature_c"], reading["reading_timestamp"], now, reading["attempts"] + 1, error))
            self.connection.execute("DELETE FROM pending_readings WHERE reading_id = ?", (reading["reading_id"],))

    def counts(self):
        return tuple(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in ("pending_readings", "rejected_readings"))


def get_positive_integer_environment(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    if not value.isascii() or not value.isdecimal() or int(value) <= 0:
        raise Exception(f"{name} must be a positive integer in ~/.supabase_env; got {value!r}.")
    return int(value)


def get_reporter_settings():
    return (get_positive_integer_environment("REPORT_INTERVAL_SECONDS", DEFAULT_REPORT_INTERVAL_SECONDS), get_positive_integer_environment("REQUEST_TIMEOUT_SECONDS", DEFAULT_REQUEST_TIMEOUT_SECONDS))


def get_sensor_ids():
    sensors = os.getenv("SENSORS")
    if not sensors:
        raise Exception("No SENSORS configured in environment")
    return [sensor.strip() for sensor in sensors.split(",")]


def get_device_id():
    device_id = os.getenv("DEVICE_ID")
    if not device_id:
        raise Exception("No DEVICE_ID configured in environment")
    return device_id


def read_temp(sensor_id):
    return get_temp.read_temp(sensor_id)


def get_api_configuration():
    if not WINEOPS_API_URL or not WINEOPS_API_URL.startswith("https://"):
        raise Exception("WINEOPS_API_URL must be configured with an https:// URL")
    if not WINEOPS_INGEST_TOKEN:
        raise Exception("WINEOPS_INGEST_TOKEN must be configured")
    return WINEOPS_API_URL.rstrip("/"), WINEOPS_INGEST_TOKEN


def send_to_api(reading, device_id=None):
    api_url, ingest_token = get_api_configuration()
    payload = {"device_id": device_id or reading["device_id"], "reading_id": reading["reading_id"], "sensor_id": reading["sensor_id"], "temperature_c": reading["temperature_c"], "reading_timestamp": reading["reading_timestamp"]}
    try:
        response = requests.post(f"{api_url}/api/readings", json=payload, headers={"Authorization": f"Bearer {ingest_token}", "Content-Type": "application/json"}, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException as error:
        response = getattr(error, "response", None)
        raise SubmissionError(type(error).__name__, getattr(response, "status_code", None)) from error
    print(f"Submitted reading_id={reading['reading_id']} sensor_id={reading['sensor_id']}: HTTP {response.status_code}")


def is_permanent_failure(error):
    return error.status_code is not None and 400 <= error.status_code < 500 and error.status_code not in (408, 429)


def log_submission_failure(reading, error, attempts, delay=None):
    detail = "permanent=true" if delay is None else f"retry_in_seconds={delay}"
    print(f"Reading submission failed: device_id={reading['device_id']} sensor_id={reading['sensor_id']} measurement_at={reading['reading_timestamp']} reading_id={reading['reading_id']} error={type(error).__name__} status={error.status_code} attempts={attempts} {detail}")


def replay_due_readings(queue, monotonic=time.monotonic):
    deadline, attempted = monotonic() + REPLAY_BUDGET_SECONDS, 0
    while attempted < MAX_REPLAY_PER_CYCLE and monotonic() < deadline:
        reading = queue.next_due()
        if reading is None:
            break
        attempted += 1
        try:
            send_to_api(reading)
        except SubmissionError as error:
            attempts = reading["attempts"] + 1
            if is_permanent_failure(error):
                queue.reject(reading, f"{type(error).__name__}: {error}")
                log_submission_failure(reading, error, attempts)
            else:
                delay = queue.retry(reading["reading_id"], attempts, f"{type(error).__name__}: {error}")
                log_submission_failure(reading, error, attempts, delay)
                # A transport failure can consume the configured request timeout.
                # Stop this replay slice so an outage cannot multiply that delay.
                break
        except Exception as error:
            attempts = reading["attempts"] + 1
            delay = queue.retry(reading["reading_id"], attempts, f"{type(error).__name__}: {error}")
            print(f"Reading replay failed unexpectedly: reading_id={reading['reading_id']} retry_in_seconds={delay} error={type(error).__name__}")
            break
        else:
            queue.delivered(reading["reading_id"])
    pending, rejected = queue.counts()
    print(f"Queue status: pending={pending}/{queue.capacity} rejected={rejected} replay_attempted={attempted}")


def report_readings_once(sensors, device_id, queue):
    for sensor_id in sensors:
        try:
            reading = {"reading_id": str(uuid.uuid4()), "sensor_id": sensor_id, "temperature_c": read_temp(sensor_id), "reading_timestamp": datetime.now(timezone.utc).isoformat()}
            queue.enqueue(reading, device_id)
        except QueueFullError as error:
            print(f"CRITICAL: new reading was not queued: device_id={device_id} sensor_id={sensor_id} error={error}")
        except Exception as error:
            print(f"{sensor_id} failed: {type(error).__name__}: {error}")
    replay_due_readings(queue)


def main():
    global REQUEST_TIMEOUT_SECONDS
    report_interval_seconds, REQUEST_TIMEOUT_SECONDS = get_reporter_settings()
    sensors, device_id = get_sensor_ids(), get_device_id()
    queue = ReadingQueue(default_queue_path(), QUEUE_READINGS_PER_SENSOR * len(sensors))
    print(f"Durable queue: path={queue.path} capacity={queue.capacity} ({QUEUE_READINGS_PER_SENSOR} per sensor)")
    next_sample_at = time.monotonic()
    try:
        while True:
            report_readings_once(sensors, device_id, queue)
            next_sample_at += report_interval_seconds
            time.sleep(max(0, next_sample_at - time.monotonic()))
    finally:
        queue.close()


if __name__ == "__main__":
    main()
