import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { supabase } from "../src/clients/supabase";
import {
  IngestReading,
  ReadingIngestionError,
  readingRepository,
} from "../src/repositories/readings";

const reading: IngestReading = {
  reading_id: "00000000-0000-4000-8000-000000000001",
  sensor_id: "28-00000021a7d3",
  temperature_c: 22.625,
  reading_timestamp: "2026-10-26T18:42:21.123Z",
};

const originalRpc = supabase.rpc;

afterEach(() => {
  supabase.rpc = originalRpc;
});

describe("reading ingestion repository", () => {
  it("calls the single-reading RPC with the original measurement fields", async () => {
    let received: unknown;
    supabase.rpc = async (name, args) => {
      received = { name, args };
      return { data: { inserted_count: 1, duplicate_count: 0 }, error: null } as never;
    };

    const result = await readingRepository.ingest("cellar-pi", reading);

    assert.deepEqual(result, { inserted: 1, duplicates: 0 });
    assert.deepEqual(received, {
      name: "ingest_temperature_reading",
      args: {
        p_device_id: "cellar-pi",
        p_reading_id: reading.reading_id,
        p_sensor_id: reading.sensor_id,
        p_temperature_c: reading.temperature_c,
        p_reading_timestamp: reading.reading_timestamp,
      },
    });
  });

  it("maps registry and UUID RPC errors", async () => {
    for (const [message, kind] of [
      ["unknown or inactive sensor", "invalid_sensor"],
      ["reading_id conflict", "conflict"],
    ] as const) {
      supabase.rpc = async () => ({ data: null, error: { message } }) as never;
      await assert.rejects(
        readingRepository.ingest("cellar-pi", reading),
        (error: unknown) => error instanceof ReadingIngestionError && error.kind === kind,
      );
    }
  });
});
