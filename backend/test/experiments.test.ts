import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectTemperatureReadingPages,
  ExperimentRepository,
  resolveSensorAssignments,
} from "../src/repositories/experiments";
import {
  createExperimentService,
  ExperimentNotFoundError,
} from "../src/services/experiments";
import {
  ExperimentEvent,
  ExperimentRecord,
  ExperimentSummary,
  MonitoringPoint,
  ResolvedSensorAssignment,
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
  assignments?: ResolvedSensorAssignment[];
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
    async findResolvedSensorAssignments() {
      return fixture.assignments ?? [];
    },
    async findTemperatureReadings() {
      return fixture.readings ?? [];
    },
  };
}

describe("sensor assignment resolution", () => {
  it("maps assignment UUIDs to reading hardware IDs", () => {
    const result = resolveSensorAssignments(
      [
        {
          sensor_id: "2b13f921-fbd0-4c1f-b109-c56b0cfa86e1",
          monitoring_point_id: "water",
          started_at: "2026-07-21T05:50:00.000Z",
          ended_at: null,
        },
      ],
      [
        {
          id: "2b13f921-fbd0-4c1f-b109-c56b0cfa86e1",
          hardware_id: "28-00000021a7d3",
        },
      ],
    );

    assert.deepEqual(result, [
      {
        hardware_id: "28-00000021a7d3",
        monitoring_point_id: "water",
        started_at: "2026-07-21T05:50:00.000Z",
        ended_at: null,
      },
    ]);
  });

  it("fails explicitly when an assignment UUID cannot be resolved", () => {
    assert.throws(
      () =>
        resolveSensorAssignments(
          [
            {
              sensor_id: "missing-sensor-uuid",
              monitoring_point_id: "water",
              started_at: "2026-07-21T05:50:00.000Z",
              ended_at: null,
            },
          ],
          [],
        ),
      /Unable to resolve sensor assignment UUID missing-sensor-uuid/,
    );
  });
});

describe("temperature reading pagination", () => {
  it("continues from the last row's composite cursor", async () => {
    const cursors: Array<{
      id: string;
      sensor_id: string;
      recorded_at: string;
    } | null> = [];
    const reading = {
      id: "00000000-0000-4000-8000-000000000001",
      sensor_id: "28-00000021a7d3",
      temperature_c: 21,
      recorded_at: "2026-07-21T06:00:00.000Z",
    };

    const result = await collectTemperatureReadingPages(async (cursor) => {
      cursors.push(cursor);
      return cursor === null ? Array(1000).fill(reading) : [reading];
    });

    assert.equal(result.length, 1001);
    assert.deepEqual(cursors, [
      null,
      {
        id: reading.id,
        sensor_id: reading.sensor_id,
        recorded_at: reading.recorded_at,
      },
    ]);
  });
});

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
            hardware_id: "28-00000021a7d3",
            monitoring_point_id: "water",
            started_at: "2026-07-21T06:00:00.000Z",
            ended_at: "2026-07-21T06:30:00.000Z",
          },
        ],
        readings: [
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 20,
            recorded_at: "2026-07-21T05:50:00.000Z",
          },
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 21,
            recorded_at: "2026-07-21T06:00:00.000Z",
          },
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 22,
            recorded_at: "2026-07-21T06:30:00.000Z",
          },
          {
            sensor_id: "28-00000021a7d3",
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
    ]);
  });

  it("queries legacy readings by resolved hardware ID", async () => {
    const requestedHardwareIds: string[][] = [];
    const readings = [
      {
        sensor_id: "28-00000021a7d3",
        temperature_c: 21,
        recorded_at: "2026-07-21T06:00:00.000Z",
      },
    ];
    const repository = fixtureRepository({
      monitoringPoints: [{ id: "water", name: "Water Bath" }],
      assignments: [
        {
          hardware_id: "28-00000021a7d3",
          monitoring_point_id: "water",
          started_at: "2026-07-21T05:50:00.000Z",
          ended_at: null,
        },
      ],
      readings,
    });
    repository.findTemperatureReadings = async (hardwareIds) => {
      requestedHardwareIds.push(hardwareIds);
      return readings;
    };
    const service = createExperimentService(repository);

    const result = await service.getExperimentReadings(experiment.id);

    assert.deepEqual(requestedHardwareIds, [["28-00000021a7d3"]]);
    assert.equal(result.series[0].readings[0].temperature_c, 21);
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
            hardware_id: "28-00000021a7d3",
            monitoring_point_id: "water",
            started_at: "2026-07-20T00:00:00.000Z",
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 20,
            recorded_at: "2026-07-21T05:49:59.999Z",
          },
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 21,
            recorded_at: "2026-07-21T05:50:00.000Z",
          },
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 22,
            recorded_at: "2026-07-21T07:00:00.000Z",
          },
          {
            sensor_id: "28-00000021a7d3",
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
            hardware_id: "28-00000021a7d3",
            monitoring_point_id: "ambient",
            started_at: "2026-07-21T05:50:00.000Z",
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "28-00000021a7d3",
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
    repository.findResolvedSensorAssignments = async (_ids, start, end) => {
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
            hardware_id: "28-00000021a7d3",
            monitoring_point_id: "water",
            started_at: "2026-07-21T05:00:00.000Z",
            ended_at: "2026-07-21T06:30:00.000Z",
          },
          {
            hardware_id: "28-00000021b23b",
            monitoring_point_id: "water",
            started_at: "2026-07-21T06:30:00.000Z",
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "28-00000021b23b",
            temperature_c: 22,
            recorded_at: "2026-07-21T07:00:00.000Z",
          },
          {
            sensor_id: "28-00000021a7d3",
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

  it("attributes a handoff boundary reading only to the new monitoring point", async () => {
    const boundary = "2026-07-21T06:30:00.000Z";
    const service = createExperimentService(
      fixtureRepository({
        monitoringPoints: [
          { id: "ambient", name: "Ambient Air" },
          { id: "water", name: "Water Bath" },
        ],
        assignments: [
          {
            hardware_id: "28-00000021a7d3",
            monitoring_point_id: "ambient",
            started_at: "2026-07-21T05:00:00.000Z",
            ended_at: boundary,
          },
          {
            hardware_id: "28-00000021a7d3",
            monitoring_point_id: "water",
            started_at: boundary,
            ended_at: null,
          },
        ],
        readings: [
          {
            sensor_id: "28-00000021a7d3",
            temperature_c: 22,
            recorded_at: boundary,
          },
        ],
      }),
    );

    const result = await service.getExperimentReadings(experiment.id);

    assert.deepEqual(result.series, [
      {
        monitoring_point_id: "water",
        name: "Water Bath",
        readings: [{ temperature_c: 22, recorded_at: boundary }],
      },
    ]);
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
