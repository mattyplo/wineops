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

export interface ExperimentDetail {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
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
