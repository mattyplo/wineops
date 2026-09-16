import { useEffect, useState } from "react";
import { getSensorHealth } from "./api/health";
import SensorCard from "./components/SensorCard";
import ExperimentPage from "./pages/ExperimentPage";
import type { SensorHealth } from "./types/health";

import "./App.css";


function Dashboard() {

  const [sensors, setSensors] = useState<SensorHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {

    async function loadSensorHealth() {

      try {

        const data = await getSensorHealth();

        setSensors(data);

      } catch (err) {

        if (err instanceof Error) {
          setError(err.message);
        }

      } finally {
        setLoading(false);

      }

    }

    loadSensorHealth();

  }, []);


  return (
    <div className="app">

      <h1>
        WineOps Dashboard
      </h1>


      {error && (
        <p>{error}</p>
      )}


      <div className="sensor-grid">

        {loading && <p>Loading sensor health…</p>}

        {sensors.map((sensor) => (

          <SensorCard
            key={sensor.sensor_id}
            sensor={sensor}
          />

        ))}

        {!loading && !error && sensors.length === 0 && (
          <p>No sensors are available yet.</p>
        )}

      </div>

    </div>
  );
}

function App() {
  const match = window.location.pathname.match(/^\/experiments\/([^/]+)\/?$/);

  if (match) {
    return <ExperimentPage experimentId={decodeURIComponent(match[1])} />;
  }

  return <Dashboard />;
}

export default App;
