import { supabase } from "./supabase";

export async function getLatestReadings() {
  const { data, error } = await supabase
    .from("latest_temperature_readings")
    .select("*")
    .order("sensor_id");

    

  if (error) {
    throw error;
  }

  return data;
}