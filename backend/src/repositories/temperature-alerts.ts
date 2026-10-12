import { supabase } from "../clients/supabase";

export interface AlertReading {
  id: number;
  sensor_id: string;
  temperature_c: number;
  recorded_at: string;
}

export interface TemperatureAlertRepository {
  findLatestReading(sensorId: string): Promise<AlertReading | null>;
  claimDelivery(ruleKey: string, readingId: number): Promise<boolean>;
  clearDelivery(ruleKey: string): Promise<void>;
  markDeliverySent(ruleKey: string, readingId: number): Promise<void>;
  markDeliveryFailed(ruleKey: string, readingId: number): Promise<void>;
}

export const temperatureAlertRepository: TemperatureAlertRepository = {
  async findLatestReading(sensorId) {
    const { data, error } = await supabase
      .from("temperature_readings")
      .select("id,sensor_id,temperature_c,recorded_at")
      .eq("sensor_id", sensorId)
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as AlertReading | null;
  },

  async claimDelivery(ruleKey, readingId) {
    const { error } = await supabase
      .from("temperature_alert_deliveries")
      .insert({ rule_key: ruleKey, temperature_reading_id: readingId, status: "claimed" });

    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  },

  async clearDelivery(ruleKey) {
    const { error } = await supabase
      .from("temperature_alert_deliveries")
      .delete()
      .eq("rule_key", ruleKey);
    if (error) throw error;
  },

  async markDeliverySent(ruleKey, readingId) {
    const { error } = await supabase
      .from("temperature_alert_deliveries")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("rule_key", ruleKey)
      .eq("temperature_reading_id", readingId);
    if (error) throw error;
  },

  async markDeliveryFailed(ruleKey, readingId) {
    const { error } = await supabase
      .from("temperature_alert_deliveries")
      .update({ status: "failed" })
      .eq("rule_key", ruleKey)
      .eq("temperature_reading_id", readingId);
    if (error) throw error;
  },
};
