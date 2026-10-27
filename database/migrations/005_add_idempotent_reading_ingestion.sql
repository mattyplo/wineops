-- Keep a database-generated default so legacy reporters can continue their
-- staged direct inserts while API-based reporters supply their own UUID.
ALTER TABLE temperature_readings
ADD COLUMN reading_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE temperature_readings
ADD CONSTRAINT temperature_readings_reading_id_key UNIQUE (reading_id);

-- This RPC is intentionally the only database write path used by the API.
-- It validates the entire batch before inserting any row and treats an exact
-- replay as successful. SECURITY DEFINER permits a service-role backend to
-- perform the protected registry lookup and insert in one transaction.
CREATE OR REPLACE FUNCTION ingest_temperature_readings(
    p_device_id text,
    p_readings jsonb
)
RETURNS TABLE(inserted_count integer, duplicate_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    requested_count integer;
    new_count integer;
BEGIN
    IF p_device_id IS NULL OR btrim(p_device_id) = '' OR
       jsonb_typeof(p_readings) <> 'array' OR jsonb_array_length(p_readings) = 0 THEN
        RAISE EXCEPTION 'invalid reading batch' USING ERRCODE = '22023';
    END IF;

    DROP TABLE IF EXISTS _wineops_requested_readings;
    CREATE TEMP TABLE _wineops_requested_readings ON COMMIT DROP AS
    SELECT
        (item->>'reading_id')::uuid AS reading_id,
        item->>'sensor_id' AS sensor_id,
        (item->>'temperature_c')::real AS temperature_c,
        (item->>'reading_timestamp')::timestamptz AS reading_timestamp
    FROM jsonb_array_elements(p_readings) AS item;

    SELECT count(*) INTO requested_count FROM _wineops_requested_readings;

    IF EXISTS (
        SELECT 1
        FROM _wineops_requested_readings
        GROUP BY reading_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'reading_id conflict' USING ERRCODE = 'P0001';
    END IF;

    -- Lock matching registry rows until the function commits, preventing a
    -- concurrent state change from making a validated batch stale mid-insert.
    PERFORM 1
    FROM sensors
    WHERE hardware_id IN (SELECT sensor_id FROM _wineops_requested_readings)
    FOR SHARE;

    IF EXISTS (
        SELECT 1
        FROM _wineops_requested_readings AS requested
        LEFT JOIN sensors ON sensors.hardware_id = requested.sensor_id
        WHERE sensors.hardware_id IS NULL OR sensors.state <> 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'unknown or inactive sensor' USING ERRCODE = 'P0001';
    END IF;

    -- Reject an existing UUID whose durable identity differs before writing.
    IF EXISTS (
        SELECT 1
        FROM _wineops_requested_readings AS requested
        INNER JOIN temperature_readings AS stored USING (reading_id)
        WHERE stored.device_id IS DISTINCT FROM p_device_id
           OR stored.sensor_id IS DISTINCT FROM requested.sensor_id
           OR stored.temperature_c IS DISTINCT FROM requested.temperature_c
           OR stored.reading_timestamp IS DISTINCT FROM requested.reading_timestamp
    ) THEN
        RAISE EXCEPTION 'reading_id conflict' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO temperature_readings (
        reading_id, sensor_id, device_id, temperature_c, reading_timestamp
    )
    SELECT reading_id, sensor_id, p_device_id, temperature_c, reading_timestamp
    FROM _wineops_requested_readings
    ON CONFLICT (reading_id) DO NOTHING;

    GET DIAGNOSTICS new_count = ROW_COUNT;

    -- ON CONFLICT also handles a simultaneous request. Recheck after it has
    -- waited for the conflicting transaction, so a racing changed payload is
    -- never accidentally reported as a duplicate.
    IF EXISTS (
        SELECT 1
        FROM _wineops_requested_readings AS requested
        INNER JOIN temperature_readings AS stored USING (reading_id)
        WHERE stored.device_id IS DISTINCT FROM p_device_id
           OR stored.sensor_id IS DISTINCT FROM requested.sensor_id
           OR stored.temperature_c IS DISTINCT FROM requested.temperature_c
           OR stored.reading_timestamp IS DISTINCT FROM requested.reading_timestamp
    ) THEN
        RAISE EXCEPTION 'reading_id conflict' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT new_count, requested_count - new_count;
END;
$$;

REVOKE ALL ON FUNCTION ingest_temperature_readings(text, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_temperature_readings(text, jsonb) TO service_role;
