# WineOps Raspberry Pi Temperature Sensor

This module runs on a Raspberry Pi and reads temperature data from DS18B20
1-Wire temperature sensors.

Data pipeline:

```
DS18B20 Sensor → Raspberry Pi → Python Reporter → Fastify API → Supabase
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
# Optional: both values must be positive integers.
REPORT_INTERVAL_SECONDS=300
REQUEST_TIMEOUT_SECONDS=90
```

`REPORT_INTERVAL_SECONDS` controls the delay after a reporting cycle completes
and defaults to `300` (five minutes). It is not a fixed measurement frequency:
actual cycle spacing also includes sensor-read and HTTP submission time.
`REQUEST_TIMEOUT_SECONDS` controls the HTTP request timeout and defaults to
`90`. Both settings are optional, so existing configuration files continue to
use these defaults. Invalid values cause the reporter to exit at startup with
an error that identifies the setting.

## Durable delivery queue

Before making an API request, the reporter commits every observation to a
local SQLite outbox at `~/.local/state/wineops/readings.sqlite3`. SQLite WAL
mode with full synchronous commits makes an acknowledged enqueue survive a
reporter restart or Pi reboot. The outbox preserves the original UUID,
measurement timestamp, sensor ID, device ID, and temperature; it never writes
directly to Supabase.

The queue holds 34,560 pending readings per configured sensor (120 days at a
five-minute interval), exceeding the 60-day minimum. It is a capacity, not an
expiration policy: successful submissions are removed, but no old pending
reading is evicted. A 4xx response other than 408 or 429 is retained in the
same database's `rejected_readings` table and reported in the journal; it does
not block later valid readings. Manual remediation is outside the reporter.

Retryable transport errors, timeouts, 408s, 429s, and 5xx responses keep the
same UUID and retry after bounded exponential backoff (one minute through one
hour). Each normal sampling cycle first captures all sensor readings, then
replays at most five due readings for up to 30 seconds. This keeps an outage
backlog from adding an extra post-cycle sleep. Fastify treats a repeated UUID
as an idempotent success, so an ambiguous timeout is safe to replay.

The reporter logs `Queue status` every cycle, including pending depth,
rejected count, and replay attempts. It logs retry delay and permanent status
for failures. If the queue is full, it retains every existing record and emits
a `CRITICAL` journal entry for the new reading it could not store; it never
silently evicts data. Disk-full or disk-damage conditions cannot be made safe
in software, so investigate that alert immediately. For a device rebuild,
stop the service and copy the database plus its `-wal` and `-shm` files before
replacing the device.

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

Use the device-level [`setup.sh`](../setup.sh) from the repository root. It
creates the virtual environment, installs dependencies, configures sensors, and
installs the systemd service:

```bash
./device/raspberry-pi/setup.sh
```

See the [Raspberry Pi setup guide](../README.md) for sparse-checkout,
reconfiguration, updating, and troubleshooting instructions.

## Configuration

Create the environment file:

```
~/.supabase_env
```

Example:

```env
WINEOPS_API_URL=https://api.example.com
WINEOPS_INGEST_TOKEN=shared-ingest-token
DEVICE_ID=cellar-pi
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
3. Send that reading to the WineOps Fastify API
4. Wait for the next interval

## Run automatically at startup

WineOps uses a systemd service so temperature reporting starts automatically
after a Raspberry Pi restart or power loss.

The device setup script installs, enables, and starts the service with paths
rendered for the current Pi user and checkout location. Check it with:

```bash
systemctl status wineops-reporter.service
journalctl -u wineops-reporter.service -b
```

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

Each API request contains one `device_id` and one client-generated UUID reading:

- `reading_id` (a UUID generated by the reporter)
- `sensor_id`
- `temperature_c`
- `reading_timestamp` (the device-reported measurement time)

Example:

```json
{
  "device_id": "cellar-pi",
  "reading_id": "f3b6b5f5-0e79-4d20-b44b-2d4e2e681bcd",
  "sensor_id": "28-00000021a7d3",
  "temperature_c": 22.625,
  "reading_timestamp": "2026-06-26T05:42:21Z"
}
```

## Troubleshooting

### API submission failures and queue recovery

Inspect queue activity without exposing the ingest token:

```bash
journalctl -u wineops-reporter.service -b | grep -E 'Queue status|submission failed|CRITICAL'
```

The reporter retries temporary failures automatically. A growing pending depth
usually means the network or API remains unavailable. Permanent rejections are
kept separately and reported, while later readings continue. Do not delete or
replace the SQLite files while the service is running; that would discard
recoverable fermentation history.

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
