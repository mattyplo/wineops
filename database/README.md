# Database

The WineOps database schema is managed through SQL migrations.

Currently migrations are applied manually through the Supabase SQL editor.

## Migration order

``` text
001_add_sensor_models.sql
002_add_experiments.sql
```

## Tables

temperature_readings
- Raw sensor measurements

sensors
- Physical DS18B20 probes

monitoring_points
- Real-world things being monitored

sensor_assignments
- Historical relationship between sensors and monitoring points

experiments
- Experiment definitions and lifecycle

experiment_monitoring_points
- Monitoring points included in experiments

experiment_events
- Timestamped events that occur during experiments

## Experiment Data Model

```text
Experiment
    │
    ├── Experiment Monitoring Points
    │        │
    │        └── Monitoring Points
    │                 │
    │                 └── Sensor Assignments
    │                          │
    │                          └── Sensors
    │
    └── Experiment Events
```

Experiments reference monitoring points rather than physical sensors because a monitoring point represents the real-world thing being observed, such as a fermenter or water bath. Physical sensors can be replaced or reassigned over time. Sensor assignments preserve that history, allowing an experiment to remain attached to the same monitored subject while readings are traced to whichever sensor was assigned at a given time.

### experiments

- `id` - UUID primary key
- `name` - Required experiment name
- `description` - Optional description
- `hypothesis` - Optional hypothesis
- `started_at` - Optional experiment start time
- `ended_at` - Optional experiment end time; requires `started_at` and cannot be earlier than it
- `created_at` - Creation time
- `updated_at` - Last update time

### experiment_monitoring_points

- `id` - UUID primary key
- `experiment_id` - Required reference to `experiments`; deleted with the experiment
- `monitoring_point_id` - Required reference to `monitoring_points`
- `created_at` - Creation time
- `updated_at` - Last update time
- Each monitoring point can be included only once per experiment

### experiment_events

- `id` - UUID primary key
- `experiment_id` - Required reference to `experiments`; deleted with the experiment
- `event_type` - Required event category
- `description` - Required event description
- `occurred_at` - Required time when the event occurred
- `created_at` - Creation time
- Events are indexed by experiment and occurrence time

## Views

latest_temperature_readings
- Latest reading per sensor
