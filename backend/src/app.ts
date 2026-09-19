import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "./config";
import {
  createExperimentRoutes,
  experimentRoutes,
} from "./routes/experiments";
import { readingRoutes } from "./routes/readings";
import {
  createSensorHealthRoutes,
  sensorHealthRoutes,
} from "./routes/health";
import { ExperimentService } from "./services/experiments";
import { HealthService } from "./services/health";
import { supabase } from "./clients/supabase";

interface BuildAppOptions {
  experimentService?: ExperimentService;
  healthService?: HealthService;
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.get("/health", async () => {
    const { error } = await supabase
      .from("temperature_readings")
      .select("id")
      .limit(1);

    return {
      status: "ok",
      database: error ? "error" : "connected",
    };
  });

  app.get("/api", async () => ({
    service: "wineops-api",
    version: "1.0",
  }));

  app.register(cors, {
    origin: config.frontendUrl,
  });

  app.register(readingRoutes, {
    prefix: "/api/readings",
  });

  app.register(
    options.healthService
      ? createSensorHealthRoutes(options.healthService)
      : sensorHealthRoutes,
    { prefix: "/api/sensors" },
  );

  app.register(
    options.experimentService
      ? createExperimentRoutes(options.experimentService)
      : experimentRoutes,
    { prefix: "/api/experiments" },
  );

  return app;
}
