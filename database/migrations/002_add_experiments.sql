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
    experiment_id uuid NOT NULL
        REFERENCES experiments(id)
        ON DELETE CASCADE,

    monitoring_point_id uuid NOT NULL
        REFERENCES monitoring_points(id),

    PRIMARY KEY (experiment_id, monitoring_point_id)
);


CREATE TABLE experiment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    experiment_id uuid NOT NULL
        REFERENCES experiments(id)
        ON DELETE CASCADE,

    event_type text NOT NULL,
    description text NOT NULL,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX experiment_events_experiment_id_occurred_at_idx
ON experiment_events(experiment_id, occurred_at);


ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

ALTER TABLE experiment_monitoring_points ENABLE ROW LEVEL SECURITY;

ALTER TABLE experiment_events ENABLE ROW LEVEL SECURITY;
