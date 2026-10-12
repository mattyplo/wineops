CREATE TABLE temperature_alert_deliveries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rule_key text NOT NULL,
    temperature_reading_id bigint NOT NULL REFERENCES temperature_readings(id),
    status text NOT NULL CHECK (status IN ('claimed', 'sent', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    UNIQUE (rule_key)
);

ALTER TABLE temperature_alert_deliveries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON temperature_alert_deliveries TO service_role;
GRANT USAGE, SELECT ON SEQUENCE temperature_alert_deliveries_id_seq TO service_role;
