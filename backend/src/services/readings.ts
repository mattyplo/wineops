import { supabase } from "./supabase";

export async function getLatestReadings() {
  const { data, error } = await supabase
    .from("temperature_readings")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return data;
}