import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExperimentRepository } from "../src/repositories/experiments";
import {
  createExperimentService,
  ExperimentNotFoundError,
} from "../src/services/experiments";
import {
  ExperimentEvent,
  ExperimentRecord,
  ExperimentSummary,
  MonitoringPoint,
  SensorAssignment,
  TemperatureReading,
} from "../src/types/experiments";

const experiment: ExperimentRecord = {
  id: "experiment-1",
  name: "Water bath stability",
  description: "Compare water and ambient temperatures.",
  hypothesis: "The bath changes temperature more slowly.",
  started_at: "2026-07-21T05:50:00.000Z",
  ended_at: null,
  created_at: "2026-07-20T18:00:00.000Z",
};

interface Fixture {
  experiments?: ExperimentSummary[];
  experiment?: ExperimentRecord | null;
  monitoringPoints?: MonitoringPoint[];
  events?: ExperimentEvent[];
  assignments?: SensorAssignment[];
  readings?: TemperatureReading[];
}

function fixtureRepository(fixture: Fixture = {}): ExperimentRepository {
  return {
    async listExperiments() {
      return [...(fixture.experiments ?? [])];
    },
    async findExperiment() {
      return fixture.experiment === undefined ? experiment : fixture.experiment;
    },
    async findMonitoringPoints() {
      return fixture.monitoringPoints ?? [];
    },
    async findEvents() {
      return [...(fixture.events ?? [])];
    },
    async findSensorAssignments() {
      return fixture.assignments ?? [];
    },
    async findTemperatureReadings() {
      return fixture.readings ?? [];
    },
  };
}

describe("experiment service", () => {
  it("lists experiments by created_at descending", async () => {
    const { hypothesis: _hypothesis, ...summary } = experiment;
    const older = { ...summary, id: "older" };
    const newer = {
      ...summary,
      id: "newer",
      created_at: "2026-07-21T18:00:00.000Z",
    };
    const service = createExperimentService(
      fixtureRepository({ experiments: [older, newer] }),
    );

    const result = await service.listExperiments();

    assert.deepEqual(
      result.experiments.map(({ id }) => id),
      ["newer", "older"],
    );
    assert.deepEqual(Object.keys(result.experiments[0]), [
      "id",
      "name",
      "description",
      "started_at",
      "ended_at",
      "created_at",
    ]);
  });

  it("returns an empty experiment list", async () => {
    const service = createExperimentService(fixtureRepository());
    assert.deepEqual(await service.listExperiments(), { experiments: [] });
  });

  it("returns detail with associated monitoring points and ordered events", async () => {
    const service = createExperimentService(
      fixtureRepository({
        monitoringPoints: [{ id: "water", name: "Water Bath" }],
        events: [
          {
            id: "later",
            event_type: "ice_added",
            description: "Added ice.",
            occurred_at: "2026-07-22T22:00:00.000Z",
          },
          {
            id: "earlier",
            event_type: "started",
            description: "Started experiment.",
            occurred_at: "2026-07-21T05:50:00.000Z",
          },
        ],
      }),
    );

    const result = await service.getExperiment(experiment.id);

    assert.equal(result.hypothesis, experiment.hypothesis);
    assert.deepEqual(result.monitoring_points, [
      { id: "water", name: "Water Bath" },
    ]);
    assert.deepEqual(
      result.events.map(({ id }) => id),
      ["earlier", "later"],
    );
  });

  it("includes only readings covered by assignment and experiment boundaries", async () => {
    const endedExperiment = {
      ...experiment,
      ended_at: "2026-07-21T07:00:00.000Z",
    };
    const service = createExperimentService(
      fixtureRepository({
        experiment: endedExperiment,
        monitoringPoints: [{ id: "water", name: "Water Bath" }],
        assignments: [
          {
            sensor_id: "sensor-a",
            monitoring_point_id: "water",
            started_at: "2026-07-21T06:00:00.000Z",
            ended_at: "2026-07-21T06:30:00.000Z",
          },
        ],
        readings: [
          {
            sensor_id: "sensor-a",
            temperature_c: 20,
            recorded_at: "2026-07-21T05:50:00.000Z",
          },
          {
            sensor_id: "sensor-a",
            temperature_c: 21,
            recorded_at: "2026-07-21T06:00:00.000Z",
          },
          {
            sensor_id: "sensor-a",
            temperature_c: 22,
            recorded_at: "2026-07-21T06:30:00.000Z",
          },
          {
            sensor_id: "sensor-a",
            temperature_c: 23,
            recorded_at: "2026-07-21T07:00:00.000Z",
          },
        ],
      }),
    );

    const result = await service.getExperimentReadings(experiment.id);

    assert.deepEqual(result.series[0].readings, [
      {
        temperature_c: 21,
        recorded_at: "2026-07-21T06:00:00.000Z",
      },
      {
        temperature_c: 22,
        recorded_at: "2026-07-21T06:30:00.000Z",
      },
    ]);
  });

  it("applies inclusive experiment start and end boundaries", async () => {
    const service = createExperimentService(
      fixtureRepository({
        experiment: {
          ...experiment,
          ended_at: "2026-07-21T07:00:00.000Z",
        },
        monitoringPoints: [{ id: "water", name: "Water Bath" }],
        assignments: [
          {
            sensor_id: "sensor-a",
            monitoring_point_id: "water",
            started_at: "2026-07-20T00:00:00.000Z",
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "sensor-a",
            temperature_c: 20,
            recorded_at: "2026-07-21T05:49:59.999Z",
          },
          {
            sensor_id: "sensor-a",
            temperature_c: 21,
            recorded_at: "2026-07-21T05:50:00.000Z",
          },
          {
            sensor_id: "sensor-a",
            temperature_c: 22,
            recorded_at: "2026-07-21T07:00:00.000Z",
          },
          {
            sensor_id: "sensor-a",
            temperature_c: 23,
            recorded_at: "2026-07-21T07:00:00.001Z",
          },
        ],
      }),
    );

    const result = await service.getExperimentReadings(experiment.id);

    assert.deepEqual(
      result.series[0].readings.map(({ temperature_c }) => temperature_c),
      [21, 22],
    );
  });

  it("does not create series for monitoring points outside the experiment", async () => {
    const service = createExperimentService(
      fixtureRepository({
        monitoringPoints: [{ id: "water", name: "Water Bath" }],
        assignments: [
          {
            sensor_id: "ambient-sensor",
            monitoring_point_id: "ambient",
            started_at: "2026-07-21T05:50:00.000Z",
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "ambient-sensor",
            temperature_c: 23,
            recorded_at: "2026-07-21T06:00:00.000Z",
          },
        ],
      }),
    );

    assert.deepEqual(await service.getExperimentReadings(experiment.id), {
      experiment_id: experiment.id,
      series: [],
    });
  });

  it("uses the present as the inclusive end of a null-ended experiment", async () => {
    const calls: string[][] = [];
    const repository = fixtureRepository({
      monitoringPoints: [{ id: "ambient", name: "Ambient Air" }],
    });
    repository.findSensorAssignments = async (_ids, start, end) => {
      calls.push([start, end]);
      return [];
    };
    const service = createExperimentService(
      repository,
      () => new Date("2026-07-26T12:00:00.000Z"),
    );

    await service.getExperimentReadings(experiment.id);

    assert.deepEqual(calls, [
      [experiment.started_at!, "2026-07-26T12:00:00.000Z"],
    ]);
  });

  it("continues one monitoring-point series across sensor replacement", async () => {
    const service = createExperimentService(
      fixtureRepository({
        monitoringPoints: [{ id: "water", name: "Water Bath" }],
        assignments: [
          {
            sensor_id: "old-sensor",
            monitoring_point_id: "water",
            started_at: "2026-07-21T05:00:00.000Z",
            ended_at: "2026-07-21T06:30:00.000Z",
          },
          {
            sensor_id: "new-sensor",
            monitoring_point_id: "water",
            started_at: "2026-07-21T06:30:00.000Z",
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "new-sensor",
            temperature_c: 22,
            recorded_at: "2026-07-21T07:00:00.000Z",
          },
          {
            sensor_id: "old-sensor",
            temperature_c: 21,
            recorded_at: "2026-07-21T06:00:00.000Z",
          },
        ],
      }),
    );

    const result = await service.getExperimentReadings(experiment.id);

    assert.equal(result.series.length, 1);
    assert.equal(result.series[0].monitoring_point_id, "water");
    assert.deepEqual(
      result.series[0].readings.map(({ temperature_c }) => temperature_c),
      [21, 22],
    );
  });

  it("returns empty readings for an experiment that has not started", async () => {
    const service = createExperimentService(
      fixtureRepository({
        experiment: { ...experiment, started_at: null },
      }),
    );

    assert.deepEqual(await service.getExperimentReadings(experiment.id), {
      experiment_id: experiment.id,
      series: [],
    });
  });

  it("returns empty readings when no readings match", async () => {
    const service = createExperimentService(
      fixtureRepository({
        monitoringPoints: [{ id: "water", name: "Water Bath" }],
        assignments: [],
        readings: [],
      }),
    );

    assert.deepEqual(await service.getExperimentReadings(experiment.id), {
      experiment_id: experiment.id,
      series: [],
    });
  });

  it("rejects unknown experiments for detail and readings", async () => {
    const service = createExperimentService(
      fixtureRepository({ experiment: null }),
    );

    await assert.rejects(
      service.getExperiment("unknown"),
      ExperimentNotFoundError,
    );
    await assert.rejects(
      service.getExperimentReadings("unknown"),
      ExperimentNotFoundError,
    );
  });
});
