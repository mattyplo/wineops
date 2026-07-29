import { FastifyInstance, FastifyReply } from "fastify";
import {
  experimentService,
  ExperimentNotFoundError,
  ExperimentService,
} from "../services/experiments";

interface ExperimentParams {
  id: string;
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

export function createExperimentRoutes(service: ExperimentService) {
  return async function experimentRoutes(app: FastifyInstance) {
    app.get("/", async () => service.listExperiments());

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
  };
}

export const experimentRoutes = createExperimentRoutes(experimentService);
