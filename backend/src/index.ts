import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config";

import { readingRoutes } from "./routes/readings";
import { supabase } from "./services/supabase";

const app = Fastify({
  logger: true
});

app.get("/health", async () => {
  const { error } = await supabase
    .from("temperature_readings")
    .select("id")
    .limit(1);

  return {
    status: "ok",
    database: error ? "error" : "connected"
  };
});

app.get("/api", async () => {
  return {
    service: "wineops-api",
    version: "1.0"
  };
});

const start = async () => {
  try {
    await app.register(cors, {
      origin: config.frontendUrl,
    });

    await app.register(readingRoutes, {
      prefix: "/api/readings",
    });

    await app.listen({
      port: config.port,
      host: "0.0.0.0"
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
