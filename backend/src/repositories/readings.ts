import { supabase } from "../clients/supabase";

export interface IngestReading {
  reading_id: string;
  sensor_id: string;
  temperature_c: number;
  reading_timestamp: string;
}

export interface IngestionResult {
  inserted: number;
  duplicates: number;
}

export interface ReadingRepository {
  ingest(deviceId: string, readings: IngestReading[]): Promise<IngestionResult>;
}

export class ReadingIngestionError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid_sensor" | "conflict",
  ) {
    super(message);
  }
}

export const readingRepository: ReadingRepository = {
  async ingest(deviceId, readings) {
    const { data, error } = await supabase.rpc("ingest_temperature_readings", {
      p_device_id: deviceId,
      p_readings: readings,
    });

    if (error) {
      if (error.message === "unknown or inactive sensor") {
        throw new ReadingIngestionError(error.message, "invalid_sensor");
      }
      if (error.message === "reading_id conflict") {
        throw new ReadingIngestionError(error.message, "conflict");
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.inserted_count !== "number" ||
      typeof result.duplicate_count !== "number") {
      throw new Error("Ingestion RPC returned an invalid result");
    }

    return {
      inserted: result.inserted_count,
      duplicates: result.duplicate_count,
    };
  },
};
