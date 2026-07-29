export interface ExperimentSummary {
  id: string;
  name: string;
  description: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface ExperimentRecord extends ExperimentSummary {
  hypothesis: string | null;
}

export interface MonitoringPoint {
  id: string;
  name: string;
}

export interface ExperimentEvent {
  id: string;
  event_type: string;
  description: string;
  occurred_at: string;
}

export interface SensorAssignment {
  sensor_id: string;
  monitoring_point_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface SensorRecord {
  id: string;
  hardware_id: string;
}

export interface ResolvedSensorAssignment {
  hardware_id: string;
  monitoring_point_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface TemperatureReading {
  sensor_id: string;
  temperature_c: number;
  recorded_at: string;
}

export interface ExperimentDetail extends ExperimentRecord {
  monitoring_points: MonitoringPoint[];
  events: ExperimentEvent[];
}

export interface ExperimentReading {
  temperature_c: number;
  recorded_at: string;
}

export interface ExperimentReadingSeries {
  monitoring_point_id: string;
  name: string;
  readings: ExperimentReading[];
}

export interface ExperimentReadings {
  experiment_id: string;
  series: ExperimentReadingSeries[];
}
