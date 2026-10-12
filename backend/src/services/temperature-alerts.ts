import {
  temperatureAlertRepository,
  TemperatureAlertRepository,
} from "../repositories/temperature-alerts";
import {
  createNtfyPublisher,
  NotificationPublisher,
} from "./notifications";

export interface TemperatureAlertConfig {
  sensorId: string;
  monitoringPointName: string;
  highThresholdC: number;
  ntfyServer: string;
  ntfyTopic: string;
}

export type TemperatureAlertResult =
  | "disabled"
  | "no-reading"
  | "below-threshold"
  | "already-claimed"
  | "sent"
  | "publish-failed";

export function readTemperatureAlertConfig(
  env: NodeJS.ProcessEnv = process.env,
): TemperatureAlertConfig | null {
  if (env.TEMPERATURE_ALERT_ENABLED !== "true") return null;

  const required = [
    "TEMPERATURE_ALERT_SENSOR_ID",
    "TEMPERATURE_ALERT_MONITORING_POINT",
    "TEMPERATURE_ALERT_HIGH_THRESHOLD_C",
    "NTFY_TOPIC",
  ] as const;
  for (const name of required) {
    if (!env[name]) throw new Error(`Missing required environment variable ${name}`);
  }

  const highThresholdC = Number(env.TEMPERATURE_ALERT_HIGH_THRESHOLD_C);
  if (!Number.isFinite(highThresholdC)) {
    throw new Error("TEMPERATURE_ALERT_HIGH_THRESHOLD_C must be a number");
  }

  return {
    sensorId: env.TEMPERATURE_ALERT_SENSOR_ID!,
    monitoringPointName: env.TEMPERATURE_ALERT_MONITORING_POINT!,
    highThresholdC,
    ntfyServer: env.NTFY_SERVER || "https://ntfy.sh",
    ntfyTopic: env.NTFY_TOPIC!,
  };
}

export function createTemperatureAlertService(
  config: TemperatureAlertConfig | null,
  repository: TemperatureAlertRepository = temperatureAlertRepository,
  publisher: NotificationPublisher | undefined = undefined,
  log: Pick<Console, "error"> = console,
) {
  const resolvedPublisher = publisher ?? (config
    ? createNtfyPublisher({ server: config.ntfyServer, topic: config.ntfyTopic })
    : undefined);

  return {
    async evaluate(): Promise<TemperatureAlertResult> {
      if (!config || !resolvedPublisher) return "disabled";

      const reading = await repository.findLatestReading(config.sensorId);
      if (!reading) return "no-reading";
      const ruleKey = `high-temperature:${config.sensorId}`;
      if (reading.temperature_c <= config.highThresholdC) {
        await repository.clearDelivery(ruleKey);
        return "below-threshold";
      }

      if (!await repository.claimDelivery(ruleKey, reading.id)) {
        return "already-claimed";
      }

      const message = `${config.monitoringPointName}: ${reading.temperature_c.toFixed(1)}°C exceeds the configured high threshold of ${config.highThresholdC.toFixed(1)}°C.`;
      try {
        await resolvedPublisher.publish({
          title: "WineOps high temperature",
          message,
          priority: "high",
          clickUrl: "https://wineops.vercel.app",
        });
        await repository.markDeliverySent(ruleKey, reading.id);
        return "sent";
      } catch (error) {
        log.error({ error, readingId: reading.id }, "Temperature alert notification failed");
        try {
          await repository.markDeliveryFailed(ruleKey, reading.id);
        } catch (markError) {
          log.error({ error: markError, readingId: reading.id }, "Could not record temperature alert notification failure");
        }
        return "publish-failed";
      }
    },
  };
}
