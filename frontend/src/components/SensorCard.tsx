import type { Reading } from "../types/reading";
import "./SensorCard.css";


interface SensorCardProps {
  reading: Reading;
}

export default function SensorCard({
  reading,
}: SensorCardProps) {

  return (

    <div className="sensor-card">

      <div className="sensor-card-header">

        <div>

          <h2>{reading.sensor_id}</h2>

          <p className="sensor-type">
            Temperature Sensor
          </p>

        </div>

        <span className="sensor-status online">
          Online
        </span>

      </div>

      <div className="temperature">

        {reading.temperature_c.toFixed(1)}°C

      </div>

      <div className="sensor-footer">

        <div>

          <span className="label">
            Last Reading
          </span>

          <span className="value">
            {new Date(reading.recorded_at).toLocaleString()}
          </span>

        </div>

      </div>

    </div>

  );

}
