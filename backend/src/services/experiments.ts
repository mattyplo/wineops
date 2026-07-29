import {
  experimentRepository,
  ExperimentRepository,
} from "../repositories/experiments";
import {
  ExperimentDetail,
  ExperimentReadingSeries,
  ExperimentReadings,
  ExperimentSummary,
} from "../types/experiments";

export class ExperimentNotFoundError extends Error {
  constructor(experimentId: string) {
    super(`Experiment ${experimentId} not found`);
    this.name = "ExperimentNotFoundError";
  }
}

export interface ExperimentService {
  listExperiments(): Promise<{ experiments: ExperimentSummary[] }>;
  getExperiment(experimentId: string): Promise<ExperimentDetail>;
  getExperimentReadings(experimentId: string): Promise<ExperimentReadings>;
}

export function createExperimentService(
  repository: ExperimentRepository = experimentRepository,
  now: () => Date = () => new Date(),
): ExperimentService {
  async function requireExperiment(experimentId: string) {
    const experiment = await repository.findExperiment(experimentId);

    if (!experiment) {
      throw new ExperimentNotFoundError(experimentId);
    }

    return experiment;
  }

  return {
    async listExperiments() {
      const experiments = await repository.listExperiments();
      experiments.sort(
        (left, right) =>
          Date.parse(right.created_at) - Date.parse(left.created_at),
      );
      return { experiments };
    },

    async getExperiment(experimentId) {
      const experiment = await requireExperiment(experimentId);
      const [monitoringPoints, events] = await Promise.all([
        repository.findMonitoringPoints(experimentId),
        repository.findEvents(experimentId),
      ]);

      return {
        ...experiment,
        monitoring_points: monitoringPoints,
        events: events.sort(
          (left, right) =>
            Date.parse(left.occurred_at) - Date.parse(right.occurred_at),
        ),
      };
    },

    async getExperimentReadings(experimentId) {
      const experiment = await requireExperiment(experimentId);
      const emptyResult = { experiment_id: experimentId, series: [] };

      if (!experiment.started_at) {
        return emptyResult;
      }

      const windowEnd = experiment.ended_at ?? now().toISOString();
      if (Date.parse(experiment.started_at) > Date.parse(windowEnd)) {
        return emptyResult;
      }

      const monitoringPoints =
        await repository.findMonitoringPoints(experimentId);
      if (monitoringPoints.length === 0) {
        return emptyResult;
      }

      const assignments = await repository.findResolvedSensorAssignments(
        monitoringPoints.map(({ id }) => id),
        experiment.started_at,
        windowEnd,
      );
      const hardwareIds = [
        ...new Set(assignments.map(({ hardware_id }) => hardware_id)),
      ];
      const readings = await repository.findTemperatureReadings(
        hardwareIds,
        experiment.started_at,
        windowEnd,
      );

      const seriesByMonitoringPoint = new Map<string, ExperimentReadingSeries>(
        monitoringPoints.map((monitoringPoint) => [
          monitoringPoint.id,
          {
            monitoring_point_id: monitoringPoint.id,
            name: monitoringPoint.name,
            readings: [],
          },
        ]),
      );

      for (const reading of readings) {
        const readingTime = Date.parse(reading.recorded_at);
        if (
          readingTime < Date.parse(experiment.started_at) ||
          readingTime > Date.parse(windowEnd)
        ) {
          continue;
        }

        for (const assignment of assignments) {
          if (
            assignment.hardware_id === reading.sensor_id &&
            readingTime >= Date.parse(assignment.started_at) &&
            (assignment.ended_at === null ||
              readingTime < Date.parse(assignment.ended_at))
          ) {
            seriesByMonitoringPoint
              .get(assignment.monitoring_point_id)
              ?.readings.push({
                temperature_c: reading.temperature_c,
                recorded_at: reading.recorded_at,
              });
          }
        }
      }

      const series = [...seriesByMonitoringPoint.values()]
        .map((item) => ({
          ...item,
          readings: item.readings.sort(
            (left, right) =>
              Date.parse(left.recorded_at) - Date.parse(right.recorded_at),
          ),
        }))
        .filter(({ readings: matchingReadings }) => matchingReadings.length > 0);

      return { experiment_id: experimentId, series };
    },
  };
}

export const experimentService = createExperimentService();
