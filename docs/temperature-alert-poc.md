# Temperature alert proof of concept

Issue #17 checks a single configured sensor's latest **persisted** Supabase
reading and sends one ntfy notification when it is above a configured high
threshold. The path is:

```text
DS18B20 → Pi reporter → Supabase temperature_readings → Render cron job → ntfy → iPhone
```

The Pi posts directly to Supabase; Fastify does not receive sensor readings.
The dashboard continues to read through Fastify.

## Configuration

Set these on the Render cron job (and locally for manual checks):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
NTFY_SERVER=https://ntfy.sh
NTFY_TOPIC=your-subscribed-ntfy-topic
TEMPERATURE_ALERT_ENABLED=true
TEMPERATURE_ALERT_SENSOR_ID=28-xxxxxxxxxxxx
TEMPERATURE_ALERT_MONITORING_POINT=Fermentation Room ambient
TEMPERATURE_ALERT_HIGH_THRESHOLD_C=20
```

`NTFY_SERVER` defaults to `https://ntfy.sh` when omitted. The existing ntfy
phone setup is described in [ntfy-setup.md](ntfy-setup.md). Keep the topic
secret-like: public ntfy topics are not authenticated.

Apply `database/migrations/005_add_temperature_alert_deliveries.sql` through
the Supabase SQL editor before deploying. It provides a durable active-breach
claim for the rule, so overlapping cron executions, fresh high readings, and
Render restarts cannot publish repeated notifications. A below-threshold
reading clears that claim for a future breach.

## Render schedule

Create a **Cron Job** in Render using the `backend` directory:

- Schedule: `*/15 * * * *`
- Build command: `npm ci && npm run build`
- Start command: `npm run check-temperature-alert`

Copy the backend's `SUPABASE_*` variables plus the alert variables above to
the cron job. This is intentionally a one-shot process rather than an
in-process timer in the web service: web instances can restart or sleep, while
the database claim makes cron retries safe.

## End-to-end check

1. Subscribe the iPhone ntfy app to `NTFY_TOPIC` and confirm normal ntfy setup.
2. Set `TEMPERATURE_ALERT_HIGH_THRESHOLD_C` below the current real DS18B20
   temperature, then wait for the Pi to store a new reading (up to 15 minutes)
   or run `npm run build && npm run check-temperature-alert` from `backend/`
   with the same environment.
3. Verify the iPhone receives **WineOps high temperature** and that its link
   opens `https://wineops.vercel.app`.
4. Inspect the cron log for `Temperature alert check: sent` and the
   `temperature_alert_deliveries` row for status `sent`.
5. Restore a safe threshold or set `TEMPERATURE_ALERT_ENABLED=false` after the
   test.

## Limits

This is not the Issue #11 alerting system: it has no reminder, recovery,
sensor-health alert, acknowledgement, alert UI, or general rule management.
The claim is written before publishing to avoid duplicate pushes; consequently
an interrupted or failed ntfy request is recorded as `failed` and is not
automatically retried. This POC deliberately favors avoiding accidental repeat
notifications over delivery assurance.
