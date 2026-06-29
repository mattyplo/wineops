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