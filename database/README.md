# Database

The WineOps database schema is managed through SQL migrations.

Currently migrations are applied manually through the Supabase SQL editor.

## Migration order

001_add_sensor_models.sql

## Tables

temperature_readings
- Raw sensor measurements

sensors
- Physical DS18B20 probes

monitoring_points
- Real-world things being monitored

sensor_assignments
- Historical relationship between sensors and monitoring points

## Views

latest_temperature_readings
- Latest reading per sensor