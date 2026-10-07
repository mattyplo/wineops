import assert from "node:assert/strict";
import { it } from "node:test";
import { buildApp } from "../src/app";

it("allows CORS preflights for experiment mutation methods", async () => {
  const app = buildApp({ logger: false });

  for (const method of ["PATCH", "DELETE"]) {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/experiments/00000000-0000-4000-8000-000000000000",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": method,
      },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
    assert.ok(response.headers["access-control-allow-methods"]?.split(/,\s*/).includes(method));
  }

  await app.close();
});
