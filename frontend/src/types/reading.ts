export interface Reading {
  id: number;
  sensor_id: string;
  temperature_c: number;
  recorded_at: string;
  reading_timestamp: string | null;
}