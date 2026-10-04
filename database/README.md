# Database

WineOps uses PostgreSQL through Supabase. SQL migrations in `migrations/` are
the authoritative schema history; they are currently applied manually through
the Supabase SQL editor.

## Migration baseline and order

The following reconstructed historical baseline can create a clean WineOps
application database:

```text
001_create_temperature_readings.sql
002_add_sensor_models.sql
003_add_experiments.sql
004_add_sensor_health.sql
```

The existing production database already contains this schema. Do not replay
the reconstructed `001`–`004` baseline against production. Future production
schema changes must continue with `005_...` migrations.

## Schema snapshot and future workflow

`schema.sql` is the checked-in, human-readable snapshot of the current state
after the migrations. It is a reference, not a second schema authority and not
the place to make schema changes. Views are migration-managed, so `views.sql`
is no longer part of the workflow.

For every future schema change:

1. Add a migration.
2. Verify it against an appropriate clean/test database.
3. Refresh or verify `schema.sql`.
4. Review both the migration and snapshot changes.

## Tables

- `temperature_readings` — raw sensor measurements; nullable `device_id`
  identifies new Raspberry Pi reports, while historical rows may be unmapped.
- `sensors` — physical DS18B20 probes.
- `monitoring_points` — real-world things being monitored.
- `sensor_assignments` — time-bounded sensor/monitoring-point history.
- `experiments` — experiment definitions and lifecycle.
- `experiment_monitoring_points` — monitoring points included in experiments.
- `experiment_events` — timestamped experiment events.

## Experiment Data Model

```text
Experiment
    │
    ├── Experiment Monitoring Points
    │        │
    │        └── Monitoring Points
    │                 │
    │                 └── Sensor Assignments
    │                          │
    │                          └── Sensors
    │
    └── Experiment Events
```

Experiments reference monitoring points rather than physical sensors because a monitoring point represents the real-world thing being observed, such as a fermenter or water bath. Physical sensors can be replaced or reassigned over time. Sensor assignments preserve that history, allowing an experiment to remain attached to the same monitored subject while readings are traced to whichever sensor was assigned at a given time.

## Views

- `latest_temperature_readings` — latest reading per sensor.
- `sensor_health` — health for registered sensors only, based on Supabase
  receipt time: online under 30 minutes, stale from 30 through 60 minutes, and
  offline afterward. Device health uses the latest successful reading for any
  sensor sharing a `device_id`; it is not a heartbeat.
