import assert from "node:assert/strict";
import { it } from "node:test";
import Fastify from "fastify";
import { HealthRepository } from "../src/repositories/health";
import { createSensorHealthRoutes } from "../src/routes/health";
import { createHealthService } from "../src/services/health";

it("returns sensor health with device health information", async () => {
  const repository: HealthRepository = {
    async findSensorHealth() {
      return [{
        sensor_id: "28-00000021a7d3",
        sensor_state: "ACTIVE",
        device_id: "cellar-pi",
        temperature_c: 22.625,
        last_seen_at: "2026-09-14T10:00:00.000Z",
        reading_timestamp: "2026-09-14T09:59:59.000Z",
        health_status: "online",
        device_last_seen_at: "2026-09-14T10:00:00.000Z",
        device_health_status: "online",
      }];
    },
  };
  const app = Fastify({ logger: false });
  await app.register(createSensorHealthRoutes(createHealthService(repository)), {
    prefix: "/api/sensors",
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/sensors/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    sensors: await repository.findSensorHealth(),
  });
  await app.close();
});

it("propagates repository failures to Fastify error handling", async () => {
  const repository: HealthRepository = {
    async findSensorHealth() {
      throw new Error("database unavailable");
    },
  };
  const app = Fastify({ logger: false });
  await app.register(createSensorHealthRoutes(createHealthService(repository)), {
    prefix: "/api/sensors",
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/sensors/health",
  });

  assert.equal(response.statusCode, 500);
  await app.close();
});
