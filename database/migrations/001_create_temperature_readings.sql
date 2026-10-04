CREATE TABLE temperature_readings (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sensor_id text NOT NULL,
    temperature_c real NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    reading_timestamp timestamptz
);

ALTER TABLE temperature_readings ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON temperature_readings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON temperature_readings TO service_role;

CREATE POLICY "anon can insert temperature readings"
ON temperature_readings
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "service role can insert temperature readings"
ON temperature_readings
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE VIEW latest_temperature_readings AS
SELECT DISTINCT ON (sensor_id)
    id,
    sensor_id,
    temperature_c,
    recorded_at,
    reading_timestamp
FROM temperature_readings
ORDER BY sensor_id, recorded_at DESC, id DESC;

GRANT SELECT ON latest_temperature_readings TO anon;
GRANT SELECT ON latest_temperature_readings TO authenticated;
GRANT SELECT ON latest_temperature_readings TO service_role;
