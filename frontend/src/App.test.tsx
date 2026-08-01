import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-chart">{children}</div>
  ),
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: ({ name, stroke }: { name: string; stroke: string }) => (
    <span data-testid="chart-line" data-color={stroke}>{name}</span>
  ),
  ReferenceLine: ({ x, label }: { x: number; label: { value: number } }) => (
    <span data-testid="event-marker" data-timestamp={x}>
      {label.value}
    </span>
  ),
}));

const experiment = {
  id: "experiment-1",
  name: "Cold soak trial",
  description: "Testing bath stability.",
  hypothesis: "The water bath will stay within two degrees.",
  started_at: "2026-07-21T05:50:00.000Z",
  ended_at: null,
  created_at: "2026-07-20T12:00:00.000Z",
  monitoring_points: [
    { id: "ambient", name: "Ambient Air" },
    { id: "water", name: "Water Bath" },
  ],
  events: [
    {
      id: "event-1",
      event_type: "ice_added",
      description: "Added one scoop of ice to the bath.",
      occurred_at: "2026-07-21T06:30:00.000Z",
    },
  ],
};

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockRequests(
  detail: unknown = experiment,
  readings: unknown = {
    experiment_id: experiment.id,
    series: [
      {
        monitoring_point_id: "water",
        name: "Water Bath",
        readings: [
          {
            temperature_c: 20,
            recorded_at: "2026-07-21T06:00:00.000Z",
          },
        ],
      },
    ],
  },
) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
    String(input).endsWith("/readings")
      ? response(readings)
      : response(detail),
  );
}

describe("experiment route", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/experiments/experiment-1");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("fetches both endpoints at route level and renders key context", async () => {
    mockRequests();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Loading experiment" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Cold soak trial" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/experiments\/experiment-1$/),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/experiments\/experiment-1\/readings$/),
    );
    expect(screen.getByText("The water bath will stay within two degrees.")).toBeInTheDocument();
    expect(screen.getByTestId("chart-line")).toHaveTextContent("Water Bath");
    expect(screen.getByTestId("event-marker")).toBeInTheDocument();
    expect(screen.getByText("Added one scoop of ice to the bath.")).toBeInTheDocument();
    expect(screen.getByTestId("empty-series")).toHaveTextContent("Ambient Air");
  });

  it("numbers chart markers in the same chronological order as the timeline", async () => {
    const earlierEvent = {
      id: "event-earlier",
      event_type: "experiment_started",
      description: "Started the experiment.",
      occurred_at: "2026-07-21T06:10:00.000Z",
    };
    const laterEvent = {
      id: "event-later",
      event_type: "ice_added",
      description: "Added ice after the first reading.",
      occurred_at: "2026-07-21T06:40:00.000Z",
    };
    mockRequests({ ...experiment, events: [laterEvent, earlierEvent] });
    render(<App />);

    const markers = await screen.findAllByTestId("event-marker");
    const timelineEvents = screen.getAllByTestId("timeline-event");

    expect(markers[0]).toHaveTextContent("1");
    expect(markers[0]).toHaveAttribute(
      "data-timestamp",
      String(Date.parse(earlierEvent.occurred_at)),
    );
    expect(markers[1]).toHaveTextContent("2");
    expect(markers[1]).toHaveAttribute(
      "data-timestamp",
      String(Date.parse(laterEvent.occurred_at)),
    );
    expect(timelineEvents[0]).toHaveTextContent(earlierEvent.description);
    expect(timelineEvents[1]).toHaveTextContent(laterEvent.description);
  });

  it("distinguishes an experiment that has not started", async () => {
    mockRequests(
      { ...experiment, started_at: null, events: [] },
      { experiment_id: experiment.id, series: [] },
    );
    render(<App />);

    expect(await screen.findByTestId("not-started")).toHaveTextContent(
      "This experiment has not started",
    );
    expect(screen.getByTestId("no-events")).toBeInTheDocument();
  });

  it("distinguishes a started experiment with no readings", async () => {
    mockRequests(experiment, { experiment_id: experiment.id, series: [] });
    render(<App />);

    expect(await screen.findByTestId("no-readings")).toHaveTextContent(
      "No temperature readings yet",
    );
  });

  it("renders not-found separately from other API failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      response({ error: "Experiment not found" }, 404),
    );
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Experiment not found" })).toBeInTheDocument();
  });

  it("renders a network error state", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "We couldn’t load this experiment" }),
    ).toBeInTheDocument();
  });

  it("renders local-time elements using machine locale", async () => {
    mockRequests();
    render(<App />);
    await screen.findByRole("heading", { name: "Cold soak trial" });

    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(experiment.started_at));
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
