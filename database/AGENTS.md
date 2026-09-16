# Database

WineOps uses PostgreSQL through Supabase. Checked-in schema changes are ordered SQL migrations in `migrations/`; they are currently applied manually through the Supabase SQL editor. Apply them in the order listed in [README.md](README.md), and add new migrations rather than editing migrations that may already have been applied.

The checked-in migrations establish separate physical sensors, monitoring points, and time-bounded sensor assignments. Preserve that distinction: experiments are associated with monitoring points, not directly with hardware sensors. Existing constraints include one active assignment per sensor, unique monitoring-point membership per experiment, and valid experiment start/end ordering.

Row-level security is enabled on the tables created by the migrations. Treat policy and grants changes as security-sensitive. `views.sql` defines `latest_temperature_readings` and `sensor_health`, granting both to `anon`, `authenticated`, and `service_role`.

`temperature_readings` is referenced by the view and application but is not created by the migrations currently in this repository; do not infer its full schema from this directory alone. There is no checked-in database test or migration runner—verify SQL in the appropriate Supabase environment and update the database README when the documented process changes.
