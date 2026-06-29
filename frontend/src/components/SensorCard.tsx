import type { Reading } from "../types/reading";


interface SensorCardProps {
  reading: Reading;
}


export default function SensorCard({
  reading,
}: SensorCardProps) {

  return (
    <div className="sensor-card">

      <h3>
        {reading.sensor_id}
      </h3>

      <div className="temperature">
        {reading.temperature_c} °C
      </div>

      <small>
        {new Date(
          reading.recorded_at
        ).toLocaleString()}
      </small>

    </div>
  );
}