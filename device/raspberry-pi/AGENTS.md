# Raspberry Pi device

This directory contains the Raspberry Pi DS18B20 reporter. `temp_sensor/get_temp.py` reads Linux 1-Wire files under `/sys/bus/w1/devices`; `temp_sensor/supabase_reporter.py` reads configured sensor IDs and posts readings directly to Supabase every 15 minutes.

Use `./setup.sh` as the supported installation, update, and reconfiguration path. Run it as the normal Pi user, not with `sudo`; it requests elevation only when needed. The script checks prerequisites and 1-Wire sensor discovery, creates or updates the Python virtual environment, preserves the existing `~/.supabase_env` by default, renders the systemd unit for the current user and repository location, installs it, and restarts the reporter. Use `./setup.sh --reconfigure` to replace the environment configuration. Do not duplicate these steps or manually install the placeholder service template.

The reporter loads `SUPABASE_URL`, `SUPABASE_KEY`, stable `DEVICE_ID`, and comma-separated `SENSORS` from `~/.supabase_env`. It sends `sensor_id`, `device_id`, `temperature_c`, and a UTC `reading_timestamp`. DS18B20 hardware IDs (for example, `28-...`) are the configured identities.

The current implementation prints errors for a sensor or HTTP response and continues its loop. It has no persistent offline queue, retry/backoff, or deduplication behavior; do not claim those guarantees without implementing them.

`systemd/wineops-reporter.service` is a template rendered by `setup.sh`; its placeholders must not be installed unchanged. The installed unit waits for network-online and restarts the process after 30 seconds.

For installation, updates, and hardware checks, follow [README.md](README.md). The reporter payload details remain in [temp_sensor/README.md](temp_sensor/README.md). Before setup, verify detected devices with:

```bash
ls /sys/bus/w1/devices/
cat /sys/bus/w1/devices/28-*/w1_slave
```

There is no automated device test suite in this repository. On a Pi, run `./setup.sh --help` to inspect the supported interface and follow the README's service-status and journal checks after installation.
