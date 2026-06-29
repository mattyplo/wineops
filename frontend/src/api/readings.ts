import type { Reading } from "../types/reading";

const API_URL = "http://localhost:3000";


export async function getLatestReadings(): Promise<Reading[]> {
  const response = await fetch(
    `${API_URL}/api/readings/latest`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch readings");
  }

  return response.json();
}