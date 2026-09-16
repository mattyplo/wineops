import { healthRepository, HealthRepository } from "../repositories/health";
import { SensorHealth } from "../types/health";

export interface HealthService {
  getSensorHealth(): Promise<{ sensors: SensorHealth[] }>;
}

export function createHealthService(
  repository: HealthRepository = healthRepository,
): HealthService {
  return {
    async getSensorHealth() {
      return { sensors: await repository.findSensorHealth() };
    },
  };
}

export const healthService = createHealthService();
