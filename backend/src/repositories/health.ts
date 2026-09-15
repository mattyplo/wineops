import { supabase } from "../clients/supabase";
import { SensorHealth } from "../types/health";

export interface HealthRepository {
  findSensorHealth(): Promise<SensorHealth[]>;
}

export const healthRepository: HealthRepository = {
  async findSensorHealth() {
    const { data, error } = await supabase
      .from("sensor_health")
      .select("*")
      .order("sensor_id");

    if (error) {
      throw error;
    }

    return (data ?? []) as SensorHealth[];
  },
};
