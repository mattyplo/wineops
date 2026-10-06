import { FastifyInstance, FastifyReply } from "fastify";
import {
  ExperimentEventNotFoundError,
  experimentService,
  ExperimentNotFoundError,
  ExperimentService,
  ExperimentValidationError,
} from "../services/experiments";
import { ExperimentEventInput, ExperimentInput, ExperimentUpdate } from "../types/experiments";

interface ExperimentParams {
  id: string;
}

interface EventParams extends ExperimentParams {
  eventId: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateExperimentId(experimentId: string, reply: FastifyReply) {
  if (!uuidPattern.test(experimentId)) {
    reply.code(400).send({ error: "Invalid experiment ID" });
    return false;
  }

  return true;
}

function validateEventId(eventId: string, reply: FastifyReply) {
  if (!uuidPattern.test(eventId)) {
    reply.code(400).send({ error: "Invalid experiment event ID" });
    return false;
  }
  return true;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validateExperimentInput(
  body: unknown,
  partial: boolean,
): ExperimentInput | ExperimentUpdate | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const allowed = ["name", "description", "hypothesis", "started_at", "ended_at"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (!partial && !allowed.every((key) => key in value)) return null;
  if (partial && Object.keys(value).length === 0) return null;
  if ("name" in value && (typeof value.name !== "string" || !value.name.trim())) return null;
  for (const key of ["description", "hypothesis"] as const) {
    if (key in value && !isNullableString(value[key])) return null;
  }
  for (const key of ["started_at", "ended_at"] as const) {
    if (key in value && value[key] !== null && !isDate(value[key])) return null;
  }
  return value as ExperimentInput | ExperimentUpdate;
}

function validateEventInput(body: unknown): ExperimentEventInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    typeof value.event_type !== "string" || !value.event_type.trim() ||
    typeof value.description !== "string" || !value.description.trim() ||
    !isDate(value.occurred_at)
  ) return null;
  return value as unknown as ExperimentEventInput;
}

async function handleMutation<T>(
  reply: FastifyReply,
  action: () => Promise<T>,
) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ExperimentNotFoundError) {
      return reply.code(404).send({ error: "Experiment not found" });
    }
    if (error instanceof ExperimentEventNotFoundError) {
      return reply.code(404).send({ error: "Experiment event not found" });
    }
    if (error instanceof ExperimentValidationError) {
      return reply.code(400).send({ error: error.message });
    }
    throw error;
  }
}

export function createExperimentRoutes(service: ExperimentService) {
  return async function experimentRoutes(app: FastifyInstance) {
    app.get("/", async () => service.listExperiments());

    app.post<{ Body: unknown }>("/", async (request, reply) => {
      const input = validateExperimentInput(request.body, false);
      if (!input) return reply.code(400).send({ error: "Invalid experiment input" });
      const experiment = await handleMutation(reply, () =>
        service.createExperiment(input as ExperimentInput),
      );
      if (experiment) return reply.code(201).send(experiment);
    });

    app.get<{ Params: ExperimentParams }>("/:id", async (request, reply) => {
      if (!validateExperimentId(request.params.id, reply)) {
        return;
      }

      try {
        return await service.getExperiment(request.params.id);
      } catch (error) {
        if (error instanceof ExperimentNotFoundError) {
          return reply.code(404).send({ error: "Experiment not found" });
        }

        throw error;
      }
    });

    app.patch<{ Params: ExperimentParams; Body: unknown }>(
      "/:id",
      async (request, reply) => {
        if (!validateExperimentId(request.params.id, reply)) return;
        const input = validateExperimentInput(request.body, true);
        if (!input) return reply.code(400).send({ error: "Invalid experiment input" });
        return handleMutation(reply, () =>
          service.updateExperiment(request.params.id, input as ExperimentUpdate),
        );
      },
    );

    app.delete<{ Params: ExperimentParams }>("/:id", async (request, reply) => {
      if (!validateExperimentId(request.params.id, reply)) return;
      const result = await handleMutation(reply, () => service.deleteExperiment(request.params.id));
      if (result === true) return reply.code(204).send();
    });

    app.get<{ Params: ExperimentParams }>(
      "/:id/readings",
      async (request, reply) => {
        if (!validateExperimentId(request.params.id, reply)) {
          return;
        }

        try {
          return await service.getExperimentReadings(request.params.id);
        } catch (error) {
          if (error instanceof ExperimentNotFoundError) {
            return reply.code(404).send({ error: "Experiment not found" });
          }

          throw error;
        }
      },
    );

    app.post<{ Params: ExperimentParams; Body: unknown }>(
      "/:id/events",
      async (request, reply) => {
        if (!validateExperimentId(request.params.id, reply)) return;
        const input = validateEventInput(request.body);
        if (!input) return reply.code(400).send({ error: "Invalid experiment event input" });
        const event = await handleMutation(reply, () => service.createEvent(request.params.id, input));
        if (event) return reply.code(201).send(event);
      },
    );

    app.patch<{ Params: EventParams; Body: unknown }>(
      "/:id/events/:eventId",
      async (request, reply) => {
        if (!validateExperimentId(request.params.id, reply) || !validateEventId(request.params.eventId, reply)) return;
        const input = validateEventInput(request.body);
        if (!input) return reply.code(400).send({ error: "Invalid experiment event input" });
        return handleMutation(reply, () => service.updateEvent(request.params.id, request.params.eventId, input));
      },
    );

    app.delete<{ Params: EventParams }>("/:id/events/:eventId", async (request, reply) => {
      if (!validateExperimentId(request.params.id, reply) || !validateEventId(request.params.eventId, reply)) return;
      const result = await handleMutation(reply, () => service.deleteEvent(request.params.id, request.params.eventId));
      if (result === true) return reply.code(204).send();
    });
  };
}

export const experimentRoutes = createExperimentRoutes(experimentService);
