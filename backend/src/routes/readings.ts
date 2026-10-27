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
  reading: IngestReading;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    !Number.isNaN(Date.parse(value));
}

export function validateIngestionInput(body: unknown): IngestionInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 5 ||
    !Object.prototype.hasOwnProperty.call(value, "device_id") ||
    !Object.prototype.hasOwnProperty.call(value, "reading_id") ||
    !Object.prototype.hasOwnProperty.call(value, "sensor_id") ||
    !Object.prototype.hasOwnProperty.call(value, "temperature_c") ||
    !Object.prototype.hasOwnProperty.call(value, "reading_timestamp") ||
    typeof value.device_id !== "string" || !value.device_id.trim() ||
    !uuidPattern.test(String(value.reading_id)) ||
    typeof value.sensor_id !== "string" || !value.sensor_id.trim() ||
    typeof value.temperature_c !== "number" || !Number.isFinite(value.temperature_c) ||
    !isTimestamp(value.reading_timestamp)) return null;

  return {
    device_id: value.device_id,
    reading: {
      reading_id: value.reading_id as string,
      sensor_id: value.sensor_id,
      temperature_c: value.temperature_c,
      reading_timestamp: value.reading_timestamp,
    },
  };
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
      const result = await service.ingest(input.device_id, input.reading);
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
