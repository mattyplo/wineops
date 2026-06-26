# WineOps Raspberry Pi Temperature Sensor

This module runs on a Raspberry Pi and reads temperature data from DS18B20
1-Wire temperature sensors.

Data pipeline:

```
DS18B20 Sensor → Raspberry Pi → Python Reporter → Supabase
```

## Hardware

Required:

- Raspberry Pi
- DS18B20 temperature sensor(s)
- Jumper wires

The DS18B20 sensors are used to monitor wine fermentation temperatures.

## Wiring

### Single Sensor

DS18B20 → Raspberry Pi

| DS18B20 Wire | Raspberry Pi |
|---|---|
| Red | 3.3V |
| Black | GND |
| Yellow | GPIO4 (1-Wire data) |

## Multiple Sensors

Multiple DS18B20 sensors can share the same 1-Wire bus.

Each sensor has a unique hardware ID.

Example:

```
28-00000021a7d3
28-00000021b23b
```

Configure sensors using the `SENSORS` environment variable.

Example:

```env
SENSORS=28-00000021a7d3,28-00000021b23b
```

## Enable 1-Wire Interface

Enable the Raspberry Pi 1-Wire interface:

```bash
sudo raspi-config
```

Navigate to:

```
Interface Options
→ 1-Wire
→ Enable
```

Reboot:

```bash
sudo reboot
```

Verify the sensor is detected:

```bash
ls /sys/bus/w1/devices/
```

Expected output:

```
28-xxxxxxxxxxxx
w1_bus_master1
```

The `28-*` entries represent DS18B20 sensors.

## Software Setup

Create a virtual environment:

```bash
python3 -m venv venv
```

Activate:

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Configuration

Create the environment file:

```
~/.supabase_env
```

Example:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-key
SENSORS=28-00000021a7d3,28-00000021b23b
```

## Running

Start the reporter:

```bash
python supabase_reporter.py
```

The reporter will:

1. Read each configured sensor
2. Capture the temperature
3. Send the reading to Supabase
4. Wait for the next interval

## Running in Background

To keep the reporter running after disconnecting SSH:

```bash
nohup python -u supabase_reporter.py > reporter.log 2>&1 &
```

View logs:

```bash
tail -f reporter.log
```

## Output Format

Each temperature reading contains:

- `sensor_id`
- `temperature_c`
- `timestamp`

Example:

```json
{
  "sensor_id": "28-00000021a7d3",
  "temperature_c": 22.625,
  "timestamp": "2026-06-26T05:42:21Z"
}
```

## Troubleshooting

### Sensor not detected

Check:

```bash
ls /sys/bus/w1/devices/
```

If no `28-*` device appears:

- verify wiring
- verify 3.3V power
- verify ground connection
- confirm 1-Wire is enabled

### Temperature read errors

Check the sensor output:

```bash
cat /sys/bus/w1/devices/28-*/w1_slave
```

A valid sensor should show:

```
crc=XX YES
```
