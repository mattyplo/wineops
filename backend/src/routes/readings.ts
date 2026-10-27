import { FastifyInstance, FastifyReply } from "fastify";
import { IngestReading, ReadingIngestionError } from "../repositories/readings";
import {
  getLatestReadings,
  readingIngestionService,
  ReadingIngestionService,
} from "../services/readings";
import { config } from "../config";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IngestionInput {
  device_id: string;
  readings: IngestReading[];
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    !Number.isNaN(Date.parse(value));
}

export function validateIngestionInput(body: unknown): IngestionInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(value, "device_id") ||
    !Object.prototype.hasOwnProperty.call(value, "readings") ||
    typeof value.device_id !== "string" || !value.device_id.trim() ||
    !Array.isArray(value.readings) || value.readings.length === 0) return null;

  const readingIds = new Set<string>();
  const readings: IngestReading[] = [];
  for (const item of value.readings) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const reading = item as Record<string, unknown>;
    if (Object.keys(reading).length !== 4 ||
      !uuidPattern.test(String(reading.reading_id)) ||
      typeof reading.sensor_id !== "string" || !reading.sensor_id.trim() ||
      typeof reading.temperature_c !== "number" || !Number.isFinite(reading.temperature_c) ||
      !isTimestamp(reading.reading_timestamp) || readingIds.has(reading.reading_id as string)) {
      return null;
    }
    readingIds.add(reading.reading_id as string);
    readings.push(reading as unknown as IngestReading);
  }
  return { device_id: value.device_id, readings };
}

function hasValidToken(authorization: string | undefined) {
  return authorization === `Bearer ${config.ingestToken}`;
}

export function readingRoutes(service: ReadingIngestionService = readingIngestionService) {
  return async function routes(app: FastifyInstance) {
  app.get("/latest", async () => {
    return await getLatestReadings();
  });

  app.post<{ Body: unknown }>("/", async (request, reply: FastifyReply) => {
    if (!hasValidToken(request.headers.authorization)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const input = validateIngestionInput(request.body);
    if (!input) return reply.code(400).send({ error: "Invalid reading input" });

    try {
      const result = await service.ingest(input.device_id, input.readings);
      return reply.code(result.duplicates > 0 ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof ReadingIngestionError) {
        return reply.code(error.kind === "conflict" ? 409 : 422).send({ error: error.message });
      }
      throw error;
    }
  });
  };
}
