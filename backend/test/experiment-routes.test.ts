import assert from "node:assert/strict";
import { it } from "node:test";
import Fastify from "fastify";
import { createExperimentRoutes } from "../src/routes/experiments";
import {
  ExperimentNotFoundError,
  ExperimentService,
} from "../src/services/experiments";

function routeService(): ExperimentService {
  return {
    async listExperiments() {
      return { experiments: [] };
    },
    async getExperiment(experimentId) {
      throw new ExperimentNotFoundError(experimentId);
    },
    async getExperimentReadings(experimentId) {
      throw new ExperimentNotFoundError(experimentId);
    },
  };
}

it("registers all experiment routes and maps unknown IDs to 404", async () => {
  const app = Fastify({ logger: false });
  await app.register(createExperimentRoutes(routeService()), {
    prefix: "/api/experiments",
  });

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/experiments",
  });
  const detailResponse = await app.inject({
    method: "GET",
    url: "/api/experiments/unknown",
  });
  const readingsResponse = await app.inject({
    method: "GET",
    url: "/api/experiments/unknown/readings",
  });

  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json(), { experiments: [] });
  assert.equal(detailResponse.statusCode, 404);
  assert.deepEqual(detailResponse.json(), { error: "Experiment not found" });
  assert.equal(readingsResponse.statusCode, 404);
  assert.deepEqual(readingsResponse.json(), { error: "Experiment not found" });

  await app.close();
});
