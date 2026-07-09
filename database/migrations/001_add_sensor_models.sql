CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

    sensor_id uuid NOT NULL
        REFERENCES sensors(id),

    monitoring_point_id uuid NOT NULL
        REFERENCES monitoring_points(id),

    started_at timestamptz NOT NULL DEFAULT now(),

    ended_at timestamptz
);


CREATE UNIQUE INDEX one_active_assignment_per_sensor
ON sensor_assignments(sensor_id)
WHERE ended_at IS NULL;

ALTER TABLE sensors ENABLE ROW LEVEL SECURITY;

ALTER TABLE monitoring_points ENABLE ROW LEVEL SECURITY;

ALTER TABLE sensor_assignments ENABLE ROW LEVEL SECURITY;