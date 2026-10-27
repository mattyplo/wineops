import { supabase } from "../clients/supabase";
import {
  IngestReading,
  IngestionResult,
  readingRepository,
  ReadingRepository,
} from "../repositories/readings";

export async function getLatestReadings() {
  const { data, error } = await supabase
    .from("latest_temperature_readings")
    .select("*")
    .order("sensor_id");

    

  if (error) {
    throw error;
  }

  return data;
}

export interface ReadingIngestionService {
  ingest(deviceId: string, readings: IngestReading[]): Promise<IngestionResult>;
}

export function createReadingIngestionService(
  repository: ReadingRepository = readingRepository,
): ReadingIngestionService {
  return {
    ingest(deviceId, readings) {
      return repository.ingest(deviceId, readings);
    },
  };
}

export const readingIngestionService = createReadingIngestionService();
