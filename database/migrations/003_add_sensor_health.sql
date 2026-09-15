ALTER TABLE temperature_readings
ADD COLUMN device_id text;

CREATE INDEX temperature_readings_sensor_id_recorded_at_idx
ON temperature_readings (sensor_id, recorded_at DESC, id DESC);

CREATE INDEX temperature_readings_device_id_recorded_at_idx
ON temperature_readings (device_id, recorded_at DESC, id DESC)
WHERE device_id IS NOT NULL;

CREATE OR REPLACE VIEW sensor_health AS
WITH latest_sensor_readings AS (
    SELECT DISTINCT ON (sensor_id)
        sensor_id,
        device_id,
        temperature_c,
        recorded_at,
        reading_timestamp
    FROM temperature_readings
    ORDER BY sensor_id, recorded_at DESC, id DESC
),
latest_device_readings AS (
    SELECT DISTINCT ON (device_id)
        device_id,
        recorded_at
    FROM temperature_readings
    WHERE device_id IS NOT NULL
    ORDER BY device_id, recorded_at DESC, id DESC
),
known_sensor_health AS (
    SELECT
        sensors.hardware_id AS sensor_id,
        sensors.state AS sensor_state,
        latest_sensor_readings.device_id,
        latest_sensor_readings.temperature_c,
        latest_sensor_readings.recorded_at,
        latest_sensor_readings.reading_timestamp
    FROM sensors
    LEFT JOIN latest_sensor_readings
        ON latest_sensor_readings.sensor_id = sensors.hardware_id
),
unregistered_sensor_health AS (
    SELECT
        latest_sensor_readings.sensor_id,
        NULL::text AS sensor_state,
        latest_sensor_readings.device_id,
        latest_sensor_readings.temperature_c,
        latest_sensor_readings.recorded_at,
        latest_sensor_readings.reading_timestamp
    FROM latest_sensor_readings
    LEFT JOIN sensors ON sensors.hardware_id = latest_sensor_readings.sensor_id
    WHERE sensors.id IS NULL
)
SELECT
    sensor_health.sensor_id,
    sensor_health.sensor_state,
    sensor_health.device_id,
    sensor_health.temperature_c,
    sensor_health.recorded_at AS last_seen_at,
    sensor_health.reading_timestamp,
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
FROM (
    SELECT * FROM known_sensor_health
    UNION ALL
    SELECT * FROM unregistered_sensor_health
) AS sensor_health
LEFT JOIN latest_device_readings
    ON latest_device_readings.device_id = sensor_health.device_id;

GRANT SELECT ON sensor_health TO anon;
GRANT SELECT ON sensor_health TO authenticated;
GRANT SELECT ON sensor_health TO service_role;
