const sensors = [
  { name: "Ambient", temp: 72.3, status: "online" },
  { name: "Fermenter #1", temp: 68.7, status: "online" },
  { name: "Water Bath", temp: 64.9, status: "offline" }
];

function SensorCard({ name, temp, status }) {
  return (
    <div style={{
      border: "1px solid #2a2f3a",
      borderRadius: 10,
      padding: 16,
      background: "#141824",
      minWidth: 220
    }}>
      <h3 style={{ margin: "0 0 10px 0" }}>{name}</h3>

      <div style={{ fontSize: 28, fontWeight: "bold" }}>
        {temp ?? "--"} °F
      </div>

      <div style={{
        marginTop: 10,
        fontSize: 12,
        color: status === "online" ? "#4ade80" : "#f87171"
      }}>
        ● {status}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f1115",
      color: "#e6e6e6",
      padding: 24,
      fontFamily: "system-ui, sans-serif"
    }}>
      <h1 style={{ marginBottom: 4 }}>🍷 WineOps</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Fermentation Monitoring System
      </p>

      <div style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        marginTop: 24
      }}>
        {sensors.map((s) => (
          <SensorCard key={s.name} {...s} />
        ))}
      </div>

      <div style={{
        marginTop: 32,
        padding: 16,
        border: "1px solid #2a2f3a",
        borderRadius: 10,
        background: "#121622"
      }}>
        <h2 style={{ marginTop: 0 }}>System Status</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>API: not connected</li>
          <li>Raspberry Pi: not connected</li>
          <li>Data stream: offline</li>
        </ul>
      </div>
    </div>
  );
}