import type { Reading } from "../types/reading";

const API_URL = import.meta.env.VITE_API_URL;


export async function getLatestReadings(): Promise<Reading[]> {
  const response = await fetch(
    `${API_URL}/api/readings/latest`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch readings");
  }

  return response.json();
}