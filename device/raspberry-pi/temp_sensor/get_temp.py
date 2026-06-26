import os
import glob
import time

os.system('modprobe w1-gpio')
os.system('modprobe w1-therm')

BASE_DIR = '/sys/bus/w1/devices'

def read_temp(sensor_id):
    device_file = os.path.join(
        BASE_DIR,
        sensor_id,
        "w1_slave"
    )

    lines = read_temp_raw(device_file)

    while lines[0].strip()[-3:] != "YES":
        time.sleep(0.2)
        lines = read_temp_raw(device_file)

    equals_pos = lines[1].find("t=")

    if equals_pos != -1:
        temp_string = lines[1][equals_pos + 2:]
        return float(temp_string) / 1000.0

    raise Exception(f"No temperature found for {sensor_id}")


def read_temp_raw(device_file):
    with open(device_file, "r") as f:
        return f.readlines()

# print("The temperature is: ")
# print(str(read_temp()) + " degrees celcius")
