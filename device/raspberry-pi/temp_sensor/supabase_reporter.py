import requests
import os
import get_temp
import time
from dotenv import load_dotenv
from datetime import datetime, timezone

# Load env vars
load_dotenv(os.path.expanduser("~/.supabase_env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

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

def send_to_supabase(temp_c, sensor_id, device_id):
    url = f"{SUPABASE_URL}/rest/v1/temperature_readings"

    payload = {
        "sensor_id": sensor_id,
        "device_id": device_id,
        "temperature_c": temp_c,
        "reading_timestamp": datetime.now(timezone.utc).isoformat()
    }

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    r = requests.post(url, json=payload, headers=headers)

    print("Status:", r.status_code)
    if r.text:
        print(r.text)
    r.raise_for_status()

def main():
    sensors = get_sensor_ids()
    device_id = get_device_id()

    while True: 
        for sensor_id in sensors:
            try:
                temp = read_temp(sensor_id)
                send_to_supabase(temp, sensor_id, device_id)

            except Exception as e:
                print(f"{sensor_id} failed:", e)
    
        # wait 15 minutes
        time.sleep(15 * 60)

if __name__ == "__main__":
    main()
