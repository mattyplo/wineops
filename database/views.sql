create or replace view latest_temperature_readings as
select distinct on (sensor_id)
    id,
    sensor_id,
    temperature_c,
    recorded_at,
    reading_timestamp
from temperature_readings
order by
    sensor_id,
    recorded_at desc;

grant select on latest_temperature_readings to anon;
grant select on latest_temperature_readings to authenticated;
grant select on latest_temperature_readings to service_role;


create or replace view sensor_health as
with latest_sensor_readings as (
    select distinct on (sensor_id)
        sensor_id,
        device_id,
        temperature_c,
        recorded_at,
        reading_timestamp
    from temperature_readings
    inner join sensors on sensors.hardware_id = temperature_readings.sensor_id
    order by sensor_id, recorded_at desc, id desc
),
latest_device_readings as (
    select distinct on (device_id)
        device_id,
        recorded_at
    from latest_sensor_readings
    where device_id is not null
    order by device_id, recorded_at desc, id desc
),
registered_sensor_health as (
    select
        sensors.hardware_id as sensor_id,
        sensors.state as sensor_state,
        latest_sensor_readings.device_id,
        latest_sensor_readings.temperature_c,
        latest_sensor_readings.recorded_at,
        latest_sensor_readings.reading_timestamp
    from sensors
    left join latest_sensor_readings
        on latest_sensor_readings.sensor_id = sensors.hardware_id
)
select
    sensor_health.sensor_id,
    sensor_health.sensor_state,
    sensor_health.device_id,
    sensor_health.temperature_c,
    sensor_health.recorded_at as last_seen_at,
    sensor_health.reading_timestamp,
    case
        when sensor_health.recorded_at is null then 'offline'
        when sensor_health.recorded_at > now() - interval '30 minutes' then 'online'
        when sensor_health.recorded_at >= now() - interval '60 minutes' then 'stale'
        else 'offline'
    end as health_status,
    latest_device_readings.recorded_at as device_last_seen_at,
    case
        when sensor_health.device_id is null then null
        when latest_device_readings.recorded_at > now() - interval '30 minutes' then 'online'
        when latest_device_readings.recorded_at >= now() - interval '60 minutes' then 'stale'
        else 'offline'
    end as device_health_status
from registered_sensor_health as sensor_health
left join latest_device_readings
    on latest_device_readings.device_id = sensor_health.device_id;

grant select on sensor_health to anon;
grant select on sensor_health to authenticated;
grant select on sensor_health to service_role;
