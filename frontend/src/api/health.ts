import type { SensorHealth } from "../types/health";

const API_URL = import.meta.env.VITE_API_URL;

export async function getSensorHealth(): Promise<SensorHealth[]> {
  const response = await fetch(`${API_URL}/api/sensors/health`);

  if (!response.ok) {
    throw new Error("Failed to fetch sensor health");
  }

  const data: { sensors: SensorHealth[] } = await response.json();
  return data.sensors;
}
