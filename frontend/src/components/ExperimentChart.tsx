import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ExperimentEvent,
  ExperimentReadingSeries,
} from "../types/experiment";
import {
  celsiusToFahrenheit,
  formatEventType,
  formatLocalDateTime,
} from "../utils/format";

export const SERIES_COLORS = [
  "#ef8f63",
  "#62c3b5",
  "#8ea7ff",
  "#d5a6f7",
  "#e0ba5f",
  "#73b9e6",
];

export function seriesColor(seriesId: string) {
  let hash = 0;
  for (const character of seriesId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
}

interface ExperimentChartProps {
  series: ExperimentReadingSeries[];
  events: ExperimentEvent[];
}

interface ChartRow {
  timestamp: number;
  [seriesId: string]: number;
}

function buildChartData(series: ExperimentReadingSeries[]) {
  const rows = new Map<number, ChartRow>();

  series.forEach((item) => {
    item.readings.forEach((reading) => {
      const timestamp = Date.parse(reading.recorded_at);
      const row = rows.get(timestamp) ?? { timestamp };
      row[item.monitoring_point_id] = celsiusToFahrenheit(
        reading.temperature_c,
      );
      rows.set(timestamp, row);
    });
  });

  return [...rows.values()].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
}

export default function ExperimentChart({
  series,
  events,
}: ExperimentChartProps) {
  const chartData = buildChartData(series);

  return (
    <div className="chart-wrap" data-testid="experiment-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 16, right: 18, bottom: 12, left: 0 }}
        >
          <CartesianGrid stroke="#303942" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(value: number) =>
              new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(value))
            }
            stroke="#8f9ba5"
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            unit="°"
            stroke="#8f9ba5"
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            labelFormatter={(value) => formatLocalDateTime(new Date(Number(value)).toISOString())}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}°F`,
              String(name),
            ]}
            contentStyle={{
              background: "#172029",
              border: "1px solid #3b4852",
              borderRadius: "10px",
            }}
          />
          {events.map((event, index) => (
            <ReferenceLine
              key={event.id}
              x={Date.parse(event.occurred_at)}
              stroke="#d7a35d"
              strokeDasharray="4 4"
              label={{
                value: index + 1,
                position: "insideTopRight",
                fill: "#f2c77f",
                fontSize: 11,
              }}
            />
          ))}
          {series.map((item) => (
            <Line
              key={item.monitoring_point_id}
              type="monotone"
              dataKey={item.monitoring_point_id}
              name={item.name}
              stroke={seriesColor(item.monitoring_point_id)}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {events.length > 0 && (
        <p className="chart-note">
          Numbered markers correspond to events in the timeline below.{" "}
          <span className="sr-only">
            {events.map((event, index) => `${index + 1}: ${formatEventType(event.event_type)}`).join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}
