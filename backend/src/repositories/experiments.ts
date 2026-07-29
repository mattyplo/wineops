import { supabase } from "../services/supabase";
import {
  ExperimentEvent,
  ExperimentRecord,
  ExperimentSummary,
  MonitoringPoint,
  ResolvedSensorAssignment,
  SensorAssignment,
  SensorRecord,
  TemperatureReading,
} from "../types/experiments";

export interface ExperimentRepository {
  listExperiments(): Promise<ExperimentSummary[]>;
  findExperiment(experimentId: string): Promise<ExperimentRecord | null>;
  findMonitoringPoints(experimentId: string): Promise<MonitoringPoint[]>;
  findEvents(experimentId: string): Promise<ExperimentEvent[]>;
  findResolvedSensorAssignments(
    monitoringPointIds: string[],
    windowStart: string,
    windowEnd: string,
  ): Promise<ResolvedSensorAssignment[]>;
  findTemperatureReadings(
    hardwareIds: string[],
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

export function resolveSensorAssignments(
  assignments: SensorAssignment[],
  sensors: SensorRecord[],
): ResolvedSensorAssignment[] {
  const hardwareIdBySensorId = new Map(
    sensors.map(({ id, hardware_id }) => [id, hardware_id]),
  );

  return assignments.map(({ sensor_id, ...assignment }) => {
    const hardwareId = hardwareIdBySensorId.get(sensor_id);

    if (!hardwareId) {
      throw new Error(
        `Unable to resolve sensor assignment UUID ${sensor_id} to a hardware ID`,
      );
    }

    return {
      ...assignment,
      hardware_id: hardwareId,
    };
  });
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

  async findResolvedSensorAssignments(
    monitoringPointIds,
    windowStart,
    windowEnd,
  ) {
    if (monitoringPointIds.length === 0) {
      return [];
    }

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("sensor_assignments")
      .select("sensor_id,monitoring_point_id,started_at,ended_at")
      .in("monitoring_point_id", monitoringPointIds)
      .lte("started_at", windowEnd)
      .or(`ended_at.is.null,ended_at.gte.${windowStart}`);

    const assignments = dataOrThrow(
      assignmentData,
      assignmentError,
    ) as SensorAssignment[];
    if (assignments.length === 0) {
      return [];
    }

    const sensorIds = [...new Set(assignments.map(({ sensor_id }) => sensor_id))];
    const { data: sensorData, error: sensorError } = await supabase
      .from("sensors")
      .select("id,hardware_id")
      .in("id", sensorIds);

    const sensors = dataOrThrow(sensorData, sensorError) as SensorRecord[];
    return resolveSensorAssignments(assignments, sensors);
  },

  async findTemperatureReadings(hardwareIds, windowStart, windowEnd) {
    if (hardwareIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("temperature_readings")
      .select("sensor_id,temperature_c,recorded_at")
      .in("sensor_id", hardwareIds)
      .gte("recorded_at", windowStart)
      .lte("recorded_at", windowEnd)
      .order("recorded_at", { ascending: true });

    return dataOrThrow(data, error) as TemperatureReading[];
  },
};
