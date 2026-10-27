# WineOps Raspberry Pi Setup

This directory contains the WineOps temperature reporter for Raspberry Pi
computers running Raspberry Pi OS. The setup is independent of Raspberry Pi
model and OS architecture: it checks for the operating-system capabilities it
needs instead of maintaining a list of supported boards. The setup script
creates the Python environment, configures DS18B20 sensors, and installs a
systemd service that starts reporting after every reboot.

The script reports the detected board model, CPU architecture, and operating
system for troubleshooting, but it does not change behavior based on a
specific Raspberry Pi generation. It can run on 32-bit or 64-bit Raspberry Pi
OS when the required Python, systemd, and 1-Wire facilities are available.

## Prerequisites

Git is required to download and update WineOps. Install it before cloning the
repository:

```bash
sudo apt update
sudo apt install -y git
git --version
```

Connect each DS18B20 sensor to 3.3V, ground, and GPIO4. Enable 1-Wire:

```bash
sudo raspi-config
```

Choose **Interface Options → 1-Wire → Enable**, then reboot. Confirm that at
least one sensor is visible:

```bash
ls /sys/bus/w1/devices/28-*
```

## Fresh installation with sparse checkout

Only the Raspberry Pi device files need to be downloaded:

```bash
git clone --filter=blob:none --no-checkout https://github.com/mattyplo/wineops.git
cd wineops
git sparse-checkout init --cone
git sparse-checkout set device/raspberry-pi
git checkout main

./device/raspberry-pi/setup.sh
```

Run the script as the normal Pi user, not with `sudo`. It asks for elevation
only while installing system packages and the systemd service.

On its first run, the script prompts for:

- `WINEOPS_API_URL` (the HTTPS base URL of the WineOps Fastify API)
- `WINEOPS_INGEST_TOKEN` (input is hidden)
- `DEVICE_ID` (a stable, unique name for that Raspberry Pi)
- `SENSORS` (detected `28-*` IDs are offered as the default)

Configuration is stored in `~/.supabase_env` with permissions `600`. An
existing file is preserved during normal setup runs.

The supported configuration format permits blank lines and `#` comments, plus
one non-empty, quoted assignment for each of `WINEOPS_API_URL`, `WINEOPS_INGEST_TOKEN`,
`DEVICE_ID`, and `SENSORS`. For example:

```bash
WINEOPS_API_URL='https://api.example.com'
WINEOPS_INGEST_TOKEN='shared-ingest-token'
DEVICE_ID='pi-cellar-1'
SENSORS='28-000001'
```

Updates reject empty values, duplicate assignments, and unsupported entries
instead of appending a conflicting setting. Use `--reconfigure` to replace an
invalid configuration deliberately.

## Updating

For an existing installation, run the dedicated update script from the
repository root:

```bash
./device/raspberry-pi/update.sh
```

It retains the sparse-checkout configuration and uses `git pull --ff-only`,
then updates Python dependencies and the rendered service. It preserves all
existing values in `~/.supabase_env`, including the API URL, ingest token, and sensor
IDs. When a newly required value is missing, it derives a valid `DEVICE_ID`
from the Pi hostname when possible; otherwise it prompts only for the missing
value. The file mode is preserved when configuration is reconciled.

For automation, prevent prompts and receive a list of missing setting names:

```bash
./device/raspberry-pi/update.sh --non-interactive
```

The reporter is restarted only after the Git update, configuration check,
dependency installation, and service installation all succeed. If `git pull`
succeeds but a later step fails, the working tree may contain the new code but
the running reporter is not restarted; resolve the reported failure and rerun
the update. A failed restart prints service status for diagnosis.

Dependencies are built in a temporary virtual environment and replace the
active environment only after installation succeeds. If dependency installation
fails, the active environment and running reporter are left unchanged. Resolve
the package, network, or disk-space error shown by the update, then rerun
`./device/raspberry-pi/update.sh`; do not manually modify the active virtual
environment.

The active `temp_sensor/venv` path is a symlink to the completed environment;
the environment itself is never moved after Python creates it. The previous
environment is retained as `temp_sensor/venv.previous` until the systemd
restart succeeds. If the restart fails and reverting the Python environment is
appropriate after diagnosing the service error, run this from the repository
root, then restart the service:

```bash
rm device/raspberry-pi/temp_sensor/venv
mv device/raspberry-pi/temp_sensor/venv.previous device/raspberry-pi/temp_sensor/venv
sudo systemctl restart wineops-reporter.service
```

Do not start another update while `venv.previous` exists: either use this
recovery path or remove it only after confirming the new environment is sound.

Initial setup remains separate: use `./device/raspberry-pi/setup.sh` for a new
Pi, and use `./device/raspberry-pi/setup.sh --reconfigure` only when you
intend to replace configuration values.

The reporter installs the exact versions in
[`temp_sensor/requirements.txt`](temp_sensor/requirements.txt). Direct
dependencies are listed separately in
[`temp_sensor/requirements.in`](temp_sensor/requirements.in); update the pinned
file only after testing a newly resolved dependency set on the supported Pi OS
and Python versions.

## Reconfiguring

To explicitly replace the Supabase or sensor configuration:

```bash
./device/raspberry-pi/setup.sh --reconfigure
```

The previous environment file is retained as a timestamped backup. Secrets are
never accepted as command-line arguments.

Existing installations that contain `SUPABASE_URL`/`SUPABASE_KEY` must use
`--reconfigure` once to replace those direct-database credentials with
`WINEOPS_API_URL` and `WINEOPS_INGEST_TOKEN`. Perform this only after the API
deployment and database migration have been verified.

## Service operation

```bash
systemctl status wineops-reporter.service
journalctl -u wineops-reporter.service -b
sudo systemctl restart wineops-reporter.service
```

The service is enabled at boot and automatically restarts after a reporter
failure. After installation, reboot the Pi and check its status to verify the
complete boot flow:

```bash
sudo reboot
systemctl status wineops-reporter.service
```

## Troubleshooting

### The 1-Wire path does not exist

Run `sudo raspi-config`, enable 1-Wire, and reboot. The setup script stops
before installing the service when `/sys/bus/w1/devices` is unavailable.

### No sensors are detected

Check sensor power, ground, the GPIO4 data connection, and the required pull-up
resistor. Then inspect:

```bash
ls -la /sys/bus/w1/devices/
cat /sys/bus/w1/devices/28-*/w1_slave
```

A valid sensor read contains `YES` on the first line.

### The reporter does not start

Inspect the unit and recent logs:

```bash
systemctl status wineops-reporter.service
journalctl -u wineops-reporter.service -n 100 --no-pager
```

Also confirm the configuration permissions and values:

```bash
stat -c '%a %n' ~/.supabase_env
```

The expected permission mode is `600`. Do not paste the file's secret contents
into logs or support messages.

More information about the reporter and sensor payload is in
[`temp_sensor/README.md`](temp_sensor/README.md).
