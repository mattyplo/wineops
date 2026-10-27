import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { IngestReading, ReadingIngestionError } from "../src/repositories/readings";
import { readingRoutes } from "../src/routes/readings";
import { ReadingIngestionService } from "../src/services/readings";

const reading: IngestReading = {
  reading_id: "00000000-0000-4000-8000-000000000001",
  sensor_id: "28-00000021a7d3",
  temperature_c: 22.625,
  reading_timestamp: "2026-10-26T18:42:21.123Z",
};

function fixtureService(): ReadingIngestionService {
  return {
    async ingest() {
      return { inserted: 1, duplicates: 0 };
    },
  };
}

async function build(service = fixtureService()) {
  const app = Fastify({ logger: false });
  await app.register(readingRoutes(service), { prefix: "/api/readings" });
  return app;
}

function request(app: Awaited<ReturnType<typeof build>>, payload: unknown, token = "test-ingest-token") {
  return app.inject({
    method: "POST",
    url: "/api/readings",
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    payload,
  });
}

describe("POST /api/readings", () => {
  it("authenticates and persists a valid batch", async () => {
    const received: Array<{ deviceId: string; readings: IngestReading[] }> = [];
    const service = fixtureService();
    service.ingest = async (deviceId, readings) => {
      received.push({ deviceId, readings });
      return { inserted: 1, duplicates: 0 };
    };
    const app = await build(service);

    const response = await request(app, { device_id: "cellar-pi", readings: [reading] });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), { inserted: 1, duplicates: 0 });
    assert.deepEqual(received, [{ deviceId: "cellar-pi", readings: [reading] }]);
    await app.close();
  });

  it("rejects missing and incorrect shared tokens before calling the service", async () => {
    const service = fixtureService();
    service.ingest = async () => assert.fail("service must not receive unauthenticated data");
    const app = await build(service);

    const unauthenticatedRequests = [
      app.inject({ method: "POST", url: "/api/readings", payload: { device_id: "cellar-pi", readings: [reading] } }),
      request(app, { device_id: "cellar-pi", readings: [reading] }, "wrong-token"),
    ];
    for (const pendingResponse of unauthenticatedRequests) {
      const response = await pendingResponse;
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { error: "Unauthorized" });
    }
    await app.close();
  });

  it("rejects malformed, empty, and internally duplicated batches", async () => {
    const app = await build();
    for (const payload of [
      { device_id: "cellar-pi", readings: [] },
      { device_id: "cellar-pi", readings: [{ ...reading, reading_id: "not-a-uuid" }] },
      { device_id: "cellar-pi", readings: [reading, reading] },
      { device_id: "cellar-pi", readings: [{ ...reading, temperature_c: Number.NaN }] },
      { device_id: "cellar-pi", readings: [{ ...reading, reading_timestamp: "not-a-time" }] },
    ]) {
      const response = await request(app, payload);
      assert.equal(response.statusCode, 400);
    }
    await app.close();
  });

  it("returns 200 for a mixed new and duplicate batch", async () => {
    const service = fixtureService();
    service.ingest = async () => ({ inserted: 1, duplicates: 1 });
    const app = await build(service);
    const response = await request(app, {
      device_id: "cellar-pi",
      readings: [reading, { ...reading, reading_id: "00000000-0000-4000-8000-000000000002" }],
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { inserted: 1, duplicates: 1 });
    await app.close();
  });

  it("maps registry and UUID conflicts without partial-success responses", async () => {
    const cases: Array<[ReadingIngestionError, number]> = [
      [new ReadingIngestionError("unknown or inactive sensor", "invalid_sensor"), 422],
      [new ReadingIngestionError("reading_id conflict", "conflict"), 409],
    ];
    for (const [error, expectedStatus] of cases) {
      const service = fixtureService();
      service.ingest = async () => { throw error; };
      const app = await build(service);
      const response = await request(app, { device_id: "cellar-pi", readings: [reading] });
      assert.equal(response.statusCode, expectedStatus);
      assert.deepEqual(response.json(), { error: error.message });
      await app.close();
    }
  });

  it("propagates database failures as 500 rather than acknowledging data", async () => {
    const service = fixtureService();
    service.ingest = async () => { throw new Error("database unavailable"); };
    const app = await build(service);
    const response = await request(app, { device_id: "cellar-pi", readings: [reading] });
    assert.equal(response.statusCode, 500);
    await app.close();
  });
});
