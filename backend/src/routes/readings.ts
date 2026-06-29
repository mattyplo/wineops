import { FastifyInstance } from "fastify";
import { getLatestReadings } from "../services/readings";

export async function readingRoutes(app: FastifyInstance) {
  app.get("/latest", async () => {
    return await getLatestReadings();
  });
}