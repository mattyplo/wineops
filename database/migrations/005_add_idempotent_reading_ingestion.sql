-- Keep a database-generated default so legacy reporters can continue their
-- staged direct inserts while API-based reporters supply their own UUID.
ALTER TABLE temperature_readings
ADD COLUMN reading_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE temperature_readings
ADD CONSTRAINT temperature_readings_reading_id_key UNIQUE (reading_id);

-- This RPC is intentionally the only database write path used by the API.
-- It validates and records one reading, treating an exact replay as
-- successful. SECURITY DEFINER permits a service-role backend to perform the
-- protected registry lookup and insert in one transaction.
CREATE OR REPLACE FUNCTION ingest_temperature_reading(
    p_device_id text,
    p_reading_id uuid,
    p_sensor_id text,
    p_temperature_c real,
    p_reading_timestamp timestamptz
)
RETURNS TABLE(inserted_count integer, duplicate_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    new_count integer;
BEGIN
    IF p_device_id IS NULL OR btrim(p_device_id) = '' OR
       p_reading_id IS NULL OR p_sensor_id IS NULL OR btrim(p_sensor_id) = '' OR
       p_temperature_c IS NULL OR p_reading_timestamp IS NULL THEN
        RAISE EXCEPTION 'invalid reading input' USING ERRCODE = '22023';
    END IF;

    -- Lock matching registry rows until the function commits, preventing a
    -- concurrent state change from making a validated reading stale mid-insert.
    PERFORM 1
    FROM sensors
    WHERE hardware_id = p_sensor_id
    FOR SHARE;

    IF NOT EXISTS (
        SELECT 1 FROM sensors
        WHERE hardware_id = p_sensor_id AND state = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'unknown or inactive sensor' USING ERRCODE = 'P0001';
    END IF;

    -- Reject an existing UUID whose durable identity differs before writing.
    IF EXISTS (
        SELECT 1 FROM temperature_readings AS stored
        WHERE stored.reading_id = p_reading_id
          AND (stored.device_id IS DISTINCT FROM p_device_id
            OR stored.sensor_id IS DISTINCT FROM p_sensor_id
            OR stored.temperature_c IS DISTINCT FROM p_temperature_c
            OR stored.reading_timestamp IS DISTINCT FROM p_reading_timestamp)
    ) THEN
        RAISE EXCEPTION 'reading_id conflict' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO temperature_readings (
        reading_id, sensor_id, device_id, temperature_c, reading_timestamp
    )
    VALUES (p_reading_id, p_sensor_id, p_device_id, p_temperature_c, p_reading_timestamp)
    ON CONFLICT (reading_id) DO NOTHING;

    GET DIAGNOSTICS new_count = ROW_COUNT;

    -- ON CONFLICT also handles a simultaneous request. Recheck after it has
    -- waited for the conflicting transaction, so a racing changed payload is
    -- never accidentally reported as a duplicate.
    IF EXISTS (
        SELECT 1 FROM temperature_readings AS stored
        WHERE stored.reading_id = p_reading_id
          AND (stored.device_id IS DISTINCT FROM p_device_id
            OR stored.sensor_id IS DISTINCT FROM p_sensor_id
            OR stored.temperature_c IS DISTINCT FROM p_temperature_c
            OR stored.reading_timestamp IS DISTINCT FROM p_reading_timestamp)
    ) THEN
        RAISE EXCEPTION 'reading_id conflict' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT new_count, 1 - new_count;
END;
$$;

REVOKE ALL ON FUNCTION ingest_temperature_reading(text, uuid, text, real, timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_temperature_reading(text, uuid, text, real, timestamptz) TO service_role;
