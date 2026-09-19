import { FastifyInstance } from "fastify";
import { healthService, HealthService } from "../services/health";

export function createSensorHealthRoutes(service: HealthService) {
  return async function sensorHealthRoutes(app: FastifyInstance) {
    app.get("/health", async () => service.getSensorHealth());
  };
}

export const sensorHealthRoutes = createSensorHealthRoutes(healthService);
