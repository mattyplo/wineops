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
  const unknownExperimentId = "00000000-0000-4000-8000-000000000000";
  await app.register(createExperimentRoutes(routeService()), {
    prefix: "/api/experiments",
  });

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/experiments",
  });
  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/experiments/${unknownExperimentId}`,
  });
  const readingsResponse = await app.inject({
    method: "GET",
    url: `/api/experiments/${unknownExperimentId}/readings`,
  });

  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json(), { experiments: [] });
  assert.equal(detailResponse.statusCode, 404);
  assert.deepEqual(detailResponse.json(), { error: "Experiment not found" });
  assert.equal(readingsResponse.statusCode, 404);
  assert.deepEqual(readingsResponse.json(), { error: "Experiment not found" });

  await app.close();
});

it("returns 400 for malformed experiment IDs without calling the service", async () => {
  const app = Fastify({ logger: false });
  const service = routeService();
  service.getExperiment = async () => {
    assert.fail("detail service should not be called");
  };
  service.getExperimentReadings = async () => {
    assert.fail("readings service should not be called");
  };
  await app.register(createExperimentRoutes(service), {
    prefix: "/api/experiments",
  });

  const detailResponse = await app.inject({
    method: "GET",
    url: "/api/experiments/not-a-uuid",
  });
  const readingsResponse = await app.inject({
    method: "GET",
    url: "/api/experiments/not-a-uuid/readings",
  });

  assert.equal(detailResponse.statusCode, 400);
  assert.deepEqual(detailResponse.json(), { error: "Invalid experiment ID" });
  assert.equal(readingsResponse.statusCode, 400);
  assert.deepEqual(readingsResponse.json(), {
    error: "Invalid experiment ID",
  });

  await app.close();
});
