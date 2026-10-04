# Database

WineOps uses PostgreSQL through Supabase. The ordered SQL files in `migrations/`
are the authoritative schema history. The reconstructed `001`–`004` sequence is
a historical baseline that can create a clean WineOps application database:

```text
001_create_temperature_readings.sql
002_add_sensor_models.sql
003_add_experiments.sql
004_add_sensor_health.sql
```

The existing production database already contains this schema. Do not replay
this reconstructed baseline against production. Future production schema changes
begin with `005_...` and must be added as new migrations.

`schema.sql` is a checked-in, human-readable current-state snapshot. It is a
reference only, not a second schema authority or a file to edit for changes.
After adding a migration, verify it against an appropriate clean/test database,
refresh or verify `schema.sql`, and review both the migration and snapshot
changes. Views are migration-managed; `views.sql` is no longer part of the
workflow.

The migrations preserve separate physical sensors, monitoring points, and
time-bounded sensor assignments. Experiments associate with monitoring points,
not directly with hardware sensors. Treat RLS policies and grants as
security-sensitive: all seven application tables use RLS, and only
`temperature_readings` has explicit INSERT policies for `anon` and
`service_role`.

Migrations are currently applied manually through the Supabase SQL editor.
There is no checked-in database test or migration runner; verify SQL in the
appropriate Supabase environment when the documented process changes.
