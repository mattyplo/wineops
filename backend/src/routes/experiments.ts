import { FastifyInstance } from "fastify";
import {
  experimentService,
  ExperimentNotFoundError,
  ExperimentService,
} from "../services/experiments";

interface ExperimentParams {
  id: string;
}

export function createExperimentRoutes(service: ExperimentService) {
  return async function experimentRoutes(app: FastifyInstance) {
    app.get("/", async () => service.listExperiments());

    app.get<{ Params: ExperimentParams }>("/:id", async (request, reply) => {
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
