# WineOps Raspberry Pi Setup

This directory contains the WineOps temperature reporter for a Raspberry Pi 3
running Raspberry Pi OS Lite (32-bit). The setup script creates the Python
environment, configures DS18B20 sensors, and installs a systemd service that
starts reporting after every reboot.

## Prerequisites

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

- `SUPABASE_URL`
- `SUPABASE_KEY` (input is hidden)
- `SENSORS` (detected `28-*` IDs are offered as the default)

Configuration is stored in `~/.supabase_env` with permissions `600`. An
existing file is preserved during normal setup runs.

## Updating

Pull the latest device files and rerun setup:

```bash
git pull
./device/raspberry-pi/setup.sh
```

Rerunning setup preserves `~/.supabase_env`, updates Python dependencies,
updates the service definition, and restarts the reporter.

## Reconfiguring

To explicitly replace the Supabase or sensor configuration:

```bash
./device/raspberry-pi/setup.sh --reconfigure
```

The previous environment file is retained as a timestamped backup. Secrets are
never accepted as command-line arguments.

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
