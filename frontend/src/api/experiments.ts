import type {
  ExperimentDetail,
  ExperimentEvent,
  ExperimentEventInput,
  ExperimentInput,
  ExperimentReadings,
  ExperimentRecord,
  ExperimentSummary,
  ExperimentUpdate,
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

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(payload?.error ?? "Unable to save experiment changes", response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function listExperiments() {
  return getJson<{ experiments: ExperimentSummary[] }>("/api/experiments");
}

export function createExperiment(input: ExperimentInput) {
  return sendJson<ExperimentRecord>("/api/experiments", "POST", input);
}

export function getExperiment(experimentId: string) {
  return getJson<ExperimentDetail>(`/api/experiments/${experimentId}`);
}

export function getExperimentReadings(experimentId: string) {
  return getJson<ExperimentReadings>(
    `/api/experiments/${experimentId}/readings`,
  );
}

export function updateExperiment(experimentId: string, input: ExperimentUpdate) {
  return sendJson<ExperimentRecord>(`/api/experiments/${experimentId}`, "PATCH", input);
}

export function deleteExperiment(experimentId: string) {
  return sendJson<void>(`/api/experiments/${experimentId}`, "DELETE");
}

export function createExperimentEvent(experimentId: string, input: ExperimentEventInput) {
  return sendJson<ExperimentEvent>(`/api/experiments/${experimentId}/events`, "POST", input);
}

export function updateExperimentEvent(experimentId: string, eventId: string, input: ExperimentEventInput) {
  return sendJson<ExperimentEvent>(`/api/experiments/${experimentId}/events/${eventId}`, "PATCH", input);
}

export function deleteExperimentEvent(experimentId: string, eventId: string) {
  return sendJson<void>(`/api/experiments/${experimentId}/events/${eventId}`, "DELETE");
}
