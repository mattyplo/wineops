import { readTemperatureAlertConfig, createTemperatureAlertService } from "../services/temperature-alerts";

async function main() {
  const service = createTemperatureAlertService(readTemperatureAlertConfig());
  const result = await service.evaluate();
  console.log(`Temperature alert check: ${result}`);
}

main().catch((error) => {
  console.error("Temperature alert check failed", error);
  process.exitCode = 1;
});
