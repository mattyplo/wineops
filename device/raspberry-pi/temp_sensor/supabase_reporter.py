import requests
import os
import get_temp
import time
import uuid
from dotenv import load_dotenv
from datetime import datetime, timezone

# Load env vars
load_dotenv(os.path.expanduser("~/.supabase_env"))

WINEOPS_API_URL = os.getenv("WINEOPS_API_URL")
WINEOPS_INGEST_TOKEN = os.getenv("WINEOPS_INGEST_TOKEN")
REQUEST_TIMEOUT_SECONDS = 10

def get_sensor_ids():
    sensors = os.getenv("SENSORS")

    if not sensors:
        raise Exception("No SENSORS configured in environment")

    return [s.strip() for s in sensors.split(",")]

def get_device_id():
    device_id = os.getenv("DEVICE_ID")

    if not device_id:
        raise Exception("No DEVICE_ID configured in environment")

    return device_id

# --- replace this with your real DS18B20 function ---
def read_temp(sensor_id):
    return get_temp.read_temp(sensor_id)

def get_api_configuration():
    if not WINEOPS_API_URL or not WINEOPS_API_URL.startswith("https://"):
        raise Exception("WINEOPS_API_URL must be configured with an https:// URL")
    if not WINEOPS_INGEST_TOKEN:
        raise Exception("WINEOPS_INGEST_TOKEN must be configured")
    return WINEOPS_API_URL.rstrip("/"), WINEOPS_INGEST_TOKEN

def send_to_api(readings, device_id):
    api_url, ingest_token = get_api_configuration()
    payload = {
        "device_id": device_id,
        "readings": readings,
    }

    headers = {
        "Authorization": f"Bearer {ingest_token}",
        "Content-Type": "application/json",
    }

    response = requests.post(
        f"{api_url}/api/readings",
        json=payload,
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    print(f"Submitted {len(readings)} reading(s): HTTP {response.status_code}")

def main():
    sensors = get_sensor_ids()
    device_id = get_device_id()

    while True: 
        readings = []
        for sensor_id in sensors:
            try:
                temp = read_temp(sensor_id)
                readings.append({
                    "reading_id": str(uuid.uuid4()),
                    "sensor_id": sensor_id,
                    "temperature_c": temp,
                    "reading_timestamp": datetime.now(timezone.utc).isoformat(),
                })

            except Exception as e:
                print(f"{sensor_id} failed:", e)

        if readings:
            try:
                send_to_api(readings, device_id)
            except requests.RequestException as e:
                # Do not log the response body: it can include deployment details.
                print(f"Reading submission failed: {type(e).__name__}")
            except Exception as e:
                print(f"Reading submission failed: {e}")
    
        # wait 15 minutes
        time.sleep(15 * 60)

if __name__ == "__main__":
    main()
