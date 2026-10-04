-- WineOps current application schema snapshot.
--
-- Migrations in migrations/ are the source of truth for schema evolution.
-- This file is a human-readable reference for the state after migrations
-- 001 through 004; do not make schema changes by editing this snapshot.
-- It is not an executable replacement for the migration history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE temperature_readings (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sensor_id text NOT NULL,
    temperature_c real NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    reading_timestamp timestamptz,
    device_id text
);

CREATE TABLE sensors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hardware_id text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'ACTIVE'
        CHECK (state IN ('ACTIVE', 'INACTIVE', 'RETIRED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE monitoring_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sensor_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id uuid NOT NULL REFERENCES sensors(id),
    monitoring_point_id uuid NOT NULL REFERENCES monitoring_points(id),
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);

CREATE TABLE experiments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    hypothesis text,
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ended_at IS NULL OR started_at IS NOT NULL),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE experiment_monitoring_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    monitoring_point_id uuid NOT NULL REFERENCES monitoring_points(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (experiment_id, monitoring_point_id)
);

CREATE TABLE experiment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    description text NOT NULL,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_active_assignment_per_sensor
ON sensor_assignments(sensor_id) WHERE ended_at IS NULL;

CREATE INDEX experiment_events_experiment_id_occurred_at_idx
ON experiment_events(experiment_id, occurred_at);

CREATE INDEX temperature_readings_sensor_id_recorded_at_idx
ON temperature_readings (sensor_id, recorded_at DESC, id DESC);

CREATE INDEX temperature_readings_device_id_recorded_at_idx
ON temperature_readings (device_id, recorded_at DESC, id DESC)
WHERE device_id IS NOT NULL;

CREATE VIEW latest_temperature_readings AS
SELECT DISTINCT ON (sensor_id)
    id, sensor_id, temperature_c, recorded_at, reading_timestamp
FROM temperature_readings
ORDER BY sensor_id, recorded_at DESC, id DESC;

CREATE VIEW sensor_health AS
WITH latest_sensor_readings AS (
    SELECT DISTINCT ON (temperature_readings.sensor_id)
        temperature_readings.id, temperature_readings.sensor_id,
        temperature_readings.device_id, temperature_readings.temperature_c,
        temperature_readings.recorded_at, temperature_readings.reading_timestamp
    FROM temperature_readings
    INNER JOIN sensors ON sensors.hardware_id = temperature_readings.sensor_id
    ORDER BY temperature_readings.sensor_id,
        temperature_readings.recorded_at DESC, temperature_readings.id DESC
),
latest_device_readings AS (
    SELECT DISTINCT ON (device_id) device_id, recorded_at
    FROM latest_sensor_readings
    WHERE device_id IS NOT NULL
    ORDER BY device_id, recorded_at DESC, id DESC
),
registered_sensor_health AS (
    SELECT sensors.hardware_id AS sensor_id, sensors.state AS sensor_state,
        latest_sensor_readings.device_id, latest_sensor_readings.temperature_c,
        latest_sensor_readings.recorded_at, latest_sensor_readings.reading_timestamp
    FROM sensors
    LEFT JOIN latest_sensor_readings
        ON latest_sensor_readings.sensor_id = sensors.hardware_id
)
SELECT sensor_health.sensor_id, sensor_health.sensor_state,
    sensor_health.device_id, sensor_health.temperature_c,
    sensor_health.recorded_at AS last_seen_at, sensor_health.reading_timestamp,
    CASE
        WHEN sensor_health.recorded_at IS NULL THEN 'offline'
        WHEN sensor_health.recorded_at > now() - INTERVAL '30 minutes' THEN 'online'
        WHEN sensor_health.recorded_at >= now() - INTERVAL '60 minutes' THEN 'stale'
        ELSE 'offline'
    END AS health_status,
    latest_device_readings.recorded_at AS device_last_seen_at,
    CASE
        WHEN sensor_health.device_id IS NULL THEN NULL
        WHEN latest_device_readings.recorded_at > now() - INTERVAL '30 minutes' THEN 'online'
        WHEN latest_device_readings.recorded_at >= now() - INTERVAL '60 minutes' THEN 'stale'
        ELSE 'offline'
    END AS device_health_status
FROM registered_sensor_health AS sensor_health
LEFT JOIN latest_device_readings
    ON latest_device_readings.device_id = sensor_health.device_id;

ALTER TABLE temperature_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_monitoring_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can insert temperature readings"
ON temperature_readings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "service role can insert temperature readings"
ON temperature_readings FOR INSERT TO service_role WITH CHECK (true);

GRANT INSERT ON temperature_readings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON temperature_readings TO service_role;
GRANT SELECT ON latest_temperature_readings TO anon;
GRANT SELECT ON latest_temperature_readings TO authenticated;
GRANT SELECT ON latest_temperature_readings TO service_role;
GRANT SELECT ON sensor_health TO anon;
GRANT SELECT ON sensor_health TO authenticated;
GRANT SELECT ON sensor_health TO service_role;
