export type HealthStatus = "online" | "stale" | "offline";

export interface SensorHealth {
  sensor_id: string;
  sensor_state: string | null;
  device_id: string | null;
  temperature_c: number | null;
  last_seen_at: string | null;
  reading_timestamp: string | null;
  health_status: HealthStatus;
  device_last_seen_at: string | null;
  device_health_status: HealthStatus | null;
}
