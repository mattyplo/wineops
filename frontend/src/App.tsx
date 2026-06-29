import { useEffect, useState } from "react";
import { getLatestReadings } from "./api/readings";
import SensorCard from "./components/SensorCard";
import type { Reading } from "./types/reading";

import "./App.css";


function App() {

  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {

    async function loadReadings() {

      try {

        const data =
          await getLatestReadings();

        setReadings(data);

      } catch (err) {

        if (err instanceof Error) {
          setError(err.message);
        }

      }

    }

    loadReadings();

  }, []);


  return (
    <div>

      <h1>
        WineOps Dashboard
      </h1>


      {error && (
        <p>{error}</p>
      )}


      <div className="sensor-grid">

        {readings.map((reading) => (

          <SensorCard
            key={reading.id}
            reading={reading}
          />

        ))}

      </div>

    </div>
  );
}


export default App;