import type { HealthStatus, SensorHealth } from "../types/health";
import "./SensorCard.css";


interface SensorCardProps {
  sensor: SensorHealth;
}

function statusLabel(status: HealthStatus) {
  return status[0].toUpperCase() + status.slice(1);
}

export default function SensorCard({
  sensor,
}: SensorCardProps) {

  return (

    <div className="sensor-card">

      <div className="sensor-card-header">

        <div>

          <h2>{sensor.sensor_id}</h2>

          <p className="sensor-type">
            Temperature Sensor
          </p>

        </div>

        <span className={`sensor-status ${sensor.health_status}`}>
          {statusLabel(sensor.health_status)}
        </span>

      </div>

      <div className="temperature">

        {sensor.temperature_c === null
          ? "—"
          : `${sensor.temperature_c.toFixed(1)}°C`}

      </div>

      <div className="sensor-footer">

        <div>

          <span className="label">
            Last Reading
          </span>

          <span className="value">
            {sensor.last_seen_at
              ? new Date(sensor.last_seen_at).toLocaleString()
              : "No successful reading"}
          </span>

        </div>

        <div>

          <span className="label">
            Device
          </span>

          <span className="value">
            {sensor.device_id
              ? `${sensor.device_id} (${sensor.device_health_status ?? "unknown"})`
              : "Not reported"}
          </span>

        </div>

      </div>

    </div>

  );

}
