import { supabase } from "../services/supabase";
import {
  ExperimentEvent,
  ExperimentRecord,
  ExperimentSummary,
  MonitoringPoint,
  SensorAssignment,
  TemperatureReading,
} from "../types/experiments";

export interface ExperimentRepository {
  listExperiments(): Promise<ExperimentSummary[]>;
  findExperiment(experimentId: string): Promise<ExperimentRecord | null>;
  findMonitoringPoints(experimentId: string): Promise<MonitoringPoint[]>;
  findEvents(experimentId: string): Promise<ExperimentEvent[]>;
  findSensorAssignments(
    monitoringPointIds: string[],
    windowStart: string,
    windowEnd: string,
  ): Promise<SensorAssignment[]>;
  findTemperatureReadings(
    sensorIds: string[],
    windowStart: string,
    windowEnd: string,
  ): Promise<TemperatureReading[]>;
}

function dataOrThrow<T>(data: T | null, error: { message: string } | null): T {
  if (error) {
    throw error;
  }

  if (data === null) {
    throw new Error("Supabase returned no data");
  }

  return data;
}

export const experimentRepository: ExperimentRepository = {
  async listExperiments() {
    const { data, error } = await supabase
      .from("experiments")
      .select("id,name,description,started_at,ended_at,created_at")
      .order("created_at", { ascending: false });

    return dataOrThrow(data, error) as ExperimentSummary[];
  },

  async findExperiment(experimentId) {
    const { data, error } = await supabase
      .from("experiments")
      .select(
        "id,name,description,hypothesis,started_at,ended_at,created_at",
      )
      .eq("id", experimentId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as ExperimentRecord | null;
  },

  async findMonitoringPoints(experimentId) {
    const { data: links, error: linkError } = await supabase
      .from("experiment_monitoring_points")
      .select("monitoring_point_id")
      .eq("experiment_id", experimentId);

    const monitoringPointIds = dataOrThrow(links, linkError).map(
      ({ monitoring_point_id }) => monitoring_point_id,
    );

    if (monitoringPointIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("monitoring_points")
      .select("id,name")
      .in("id", monitoringPointIds)
      .order("name");

    return dataOrThrow(data, error) as MonitoringPoint[];
  },

  async findEvents(experimentId) {
    const { data, error } = await supabase
      .from("experiment_events")
      .select("id,event_type,description,occurred_at")
      .eq("experiment_id", experimentId)
      .order("occurred_at", { ascending: true });

    return dataOrThrow(data, error) as ExperimentEvent[];
  },

  async findSensorAssignments(monitoringPointIds, windowStart, windowEnd) {
    if (monitoringPointIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("sensor_assignments")
      .select("sensor_id,monitoring_point_id,started_at,ended_at")
      .in("monitoring_point_id", monitoringPointIds)
      .lte("started_at", windowEnd)
      .or(`ended_at.is.null,ended_at.gte.${windowStart}`);

    return dataOrThrow(data, error) as SensorAssignment[];
  },

  async findTemperatureReadings(sensorIds, windowStart, windowEnd) {
    if (sensorIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("temperature_readings")
      .select("sensor_id,temperature_c,recorded_at")
      .in("sensor_id", sensorIds)
      .gte("recorded_at", windowStart)
      .lte("recorded_at", windowEnd)
      .order("recorded_at", { ascending: true });

    return dataOrThrow(data, error) as TemperatureReading[];
  },
};
