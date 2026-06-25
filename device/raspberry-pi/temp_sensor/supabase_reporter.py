import requests
import os
import get_temp
import time
from dotenv import load_dotenv
from datetime import datetime

# Load env vars
load_dotenv(os.path.expanduser("~/.supabase_env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SENSOR_ID = os.getenv("SENSOR_ID")

# --- replace this with your real DS18B20 function ---
def read_temp():
    return get_temp.read_temp()

def send_to_supabase(temp_c, sensor_id=SENSOR_ID):
    url = f"{SUPABASE_URL}/rest/v1/temperature_readings"

    payload = {
        "sensor_id": sensor_id,
        "temperature_c": temp_c
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

def main():
  while True: 
    try:
        temp = read_temp()
        send_to_supabase(temp)

    except Exception as e:
        print("Error:", e)

    # wait 15 minutes
    time.sleep(15 * 60)

if __name__ == "__main__":
    main()
