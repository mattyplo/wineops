import { useEffect, useState } from "react";
import {
  ApiError,
  getExperiment,
  getExperimentReadings,
} from "../api/experiments";
import ExperimentChart, { seriesColor } from "../components/ExperimentChart";
import ExperimentEventTimeline from "../components/ExperimentEventTimeline";
import type {
  ExperimentDetail,
  ExperimentReadings,
} from "../types/experiment";
import { formatLocalDateTime } from "../utils/format";

interface ExperimentPageProps {
  experimentId: string;
}

type PageState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | {
      status: "ready";
      experiment: ExperimentDetail;
      readings: ExperimentReadings;
    };

function lifecycleLabel(experiment: ExperimentDetail) {
  if (!experiment.started_at) return "Not started";
  if (experiment.ended_at) return "Completed";
  return "In progress";
}

export default function ExperimentPage({
  experimentId,
}: ExperimentPageProps) {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadExperiment() {
      setState({ status: "loading" });
      try {
        const [experiment, readings] = await Promise.all([
          getExperiment(experimentId),
          getExperimentReadings(experimentId),
        ]);
        if (!cancelled) setState({ status: "ready", experiment, readings });
      } catch (error) {
        if (cancelled) return;
        setState({
          status:
            error instanceof ApiError && error.status === 404
              ? "not-found"
              : "error",
        });
      }
    }

    void loadExperiment();
    return () => {
      cancelled = true;
    };
  }, [experimentId]);

  if (state.status === "loading") {
    return (
      <main className="experiment-page centered-state" aria-live="polite">
        <div className="loading-indicator" aria-hidden="true" />
        <h1>Loading experiment</h1>
        <p>Gathering timeline context and temperature readings…</p>
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="experiment-page centered-state">
        <p className="state-code">404</p>
        <h1>Experiment not found</h1>
        <p>The experiment may have been removed, or the link may be incorrect.</p>
        <a href="/">Return to dashboard</a>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="experiment-page centered-state" role="alert">
        <p className="eyebrow">Connection problem</p>
        <h1>We couldn’t load this experiment</h1>
        <p>Check your connection and try refreshing the page.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  const { experiment, readings } = state;
  const plottedIds = new Set(
    readings.series.map(({ monitoring_point_id }) => monitoring_point_id),
  );
  const emptyPoints = experiment.monitoring_points.filter(
    ({ id }) => !plottedIds.has(id),
  );
  const hasReadings = readings.series.some(({ readings: items }) => items.length);
  const notStarted = !experiment.started_at;
  const orderedEvents = [...experiment.events].sort(
    (left, right) =>
      Date.parse(left.occurred_at) - Date.parse(right.occurred_at),
  );

  return (
    <main className="experiment-page">
      <a className="back-link" href="/">← Dashboard</a>

      <header className="experiment-header">
        <div>
          <div className="title-row">
            <p className="eyebrow">Experiment</p>
            <span className={`lifecycle lifecycle-${lifecycleLabel(experiment).toLowerCase().replace(" ", "-")}`}>
              {lifecycleLabel(experiment)}
            </span>
          </div>
          <h1>{experiment.name}</h1>
          {experiment.description && (
            <p className="experiment-description">{experiment.description}</p>
          )}
        </div>

        <dl className="experiment-times">
          <div>
            <dt>Started</dt>
            <dd>
              {experiment.started_at
                ? formatLocalDateTime(experiment.started_at)
                : "Not yet started"}
            </dd>
          </div>
          <div>
            <dt>Ended</dt>
            <dd>
              {experiment.ended_at
                ? formatLocalDateTime(experiment.ended_at)
                : experiment.started_at
                  ? "Still running"
                  : "—"}
            </dd>
          </div>
        </dl>
      </header>

      <section className="hypothesis panel" aria-labelledby="hypothesis-heading">
        <p className="eyebrow" id="hypothesis-heading">Hypothesis</p>
        <p>{experiment.hypothesis || "No hypothesis was recorded for this experiment."}</p>
      </section>

      <section className="panel chart-section" aria-labelledby="temperature-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Historical readings</p>
            <h2 id="temperature-heading">Temperature</h2>
          </div>
          <span className="unit-badge">°F</span>
        </div>

        <div className="series-legend" aria-label="Monitoring point series">
          {experiment.monitoring_points.map((point) => (
            <div
              className={`legend-item ${plottedIds.has(point.id) ? "" : "legend-empty"}`}
              key={point.id}
            >
              <span
                className="legend-swatch"
                style={{ backgroundColor: seriesColor(point.id) }}
              />
              <span>
                <strong>{point.name}</strong>
                <small>
                  {plottedIds.has(point.id)
                    ? "Monitoring point"
                    : "No readings in this experiment"}
                </small>
              </span>
            </div>
          ))}
        </div>

        {notStarted ? (
          <div className="chart-empty" data-testid="not-started">
            <strong>This experiment has not started</strong>
            <p>Temperature readings will appear here after a start time is recorded.</p>
          </div>
        ) : !hasReadings ? (
          <div className="chart-empty" data-testid="no-readings">
            <strong>No temperature readings yet</strong>
            <p>The experiment is underway, but no readings fall within its timeline.</p>
          </div>
        ) : (
          <ExperimentChart series={readings.series} events={orderedEvents} />
        )}

        {emptyPoints.length > 0 && hasReadings && (
          <div className="series-warning" data-testid="empty-series">
            <strong>Waiting for data:</strong>{" "}
            {emptyPoints.map(({ name }) => name).join(", ")}
          </div>
        )}
      </section>

      <ExperimentEventTimeline events={orderedEvents} />
    </main>
  );
}
