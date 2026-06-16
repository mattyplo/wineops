export default function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>🍷 WineOps</h1>

      <p>Fermentation Monitoring Dashboard</p>

      <div style={{ marginTop: "2rem" }}>
        <h2>Status</h2>

        <ul>
          <li>Pi Device: Not connected</li>
          <li>Sensor Stream: Offline</li>
          <li>Database: Not configured</li>
        </ul>
      </div>

      <div
        style={{
          marginTop: "2rem",
          padding: "1rem",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        <h3>Fermenter #1</h3>
        <p>Temperature: -- °F</p>
        <p>Status: Waiting for first reading</p>
      </div>
    </div>
  );
}