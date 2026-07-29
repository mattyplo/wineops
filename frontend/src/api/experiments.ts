import type {
  ExperimentDetail,
  ExperimentReadings,
} from "../types/experiment";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new ApiError(
      response.status === 404
        ? "Experiment not found"
        : "Unable to load experiment data",
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export function getExperiment(experimentId: string) {
  return getJson<ExperimentDetail>(`/api/experiments/${experimentId}`);
}

export function getExperimentReadings(experimentId: string) {
  return getJson<ExperimentReadings>(
    `/api/experiments/${experimentId}/readings`,
  );
}
