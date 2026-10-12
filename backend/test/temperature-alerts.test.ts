import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AlertReading, TemperatureAlertRepository } from "../src/repositories/temperature-alerts";
import { createNtfyPublisher, NotificationPublisher } from "../src/services/notifications";
import {
  createTemperatureAlertService,
  readTemperatureAlertConfig,
  TemperatureAlertConfig,
} from "../src/services/temperature-alerts";

const config: TemperatureAlertConfig = {
  sensorId: "28-test",
  monitoringPointName: "Fermentation Room",
  highThresholdC: 20,
  ntfyServer: "https://ntfy.sh",
  ntfyTopic: "wineops-test",
};

const highReading: AlertReading = {
  id: 42,
  sensor_id: config.sensorId,
  temperature_c: 22.625,
  recorded_at: "2026-10-11T23:00:00.000Z",
};

function repository(reading: AlertReading | null, claimed = true): TemperatureAlertRepository {
  return {
    async findLatestReading() { return reading; },
    async claimDelivery() { return claimed; },
    async clearDelivery() {},
    async markDeliverySent() {},
    async markDeliveryFailed() {},
  };
}

describe("temperature alert configuration", () => {
  it("is disabled unless explicitly enabled", () => {
    assert.equal(readTemperatureAlertConfig({}), null);
  });

  it("requires the configured target and threshold when enabled", () => {
    assert.throws(
      () => readTemperatureAlertConfig({ TEMPERATURE_ALERT_ENABLED: "true" }),
      /TEMPERATURE_ALERT_SENSOR_ID/,
    );
  });
});

describe("temperature alert evaluation", () => {
  it("does nothing when the configured sensor has no persisted reading", async () => {
    const result = await createTemperatureAlertService(config, repository(null), {
      async publish() { throw new Error("should not publish"); },
    }).evaluate();
    assert.equal(result, "no-reading");
  });

  it("does not publish a reading at or below the high threshold", async () => {
    const cleared: string[] = [];
    const result = await createTemperatureAlertService(config, {
      ...repository({ ...highReading, temperature_c: 20 }),
      async clearDelivery(ruleKey) { cleared.push(ruleKey); },
    }, {
      async publish() { throw new Error("should not publish"); },
    }).evaluate();
    assert.equal(result, "below-threshold");
    assert.deepEqual(cleared, ["high-temperature:28-test"]);
  });

  it("suppresses a reading already claimed by another polling run", async () => {
    const result = await createTemperatureAlertService(
      config,
      repository(highReading, false),
      { async publish() { throw new Error("should not publish"); } },
    ).evaluate();
    assert.equal(result, "already-claimed");
  });

  it("publishes one high-temperature notification with the dashboard link", async () => {
    const published: Parameters<NotificationPublisher["publish"]>[0][] = [];
    const sent: number[] = [];
    const result = await createTemperatureAlertService(config, {
      ...repository(highReading),
      async markDeliverySent(_ruleKey, readingId) { sent.push(readingId); },
    }, {
      async publish(notification) { published.push(notification); },
    }).evaluate();

    assert.equal(result, "sent");
    assert.deepEqual(sent, [42]);
    assert.deepEqual(published, [{
      title: "WineOps high temperature",
      message: "Fermentation Room: 22.6°C exceeds the configured high threshold of 20.0°C.",
      priority: "high",
      clickUrl: "https://wineops.vercel.app",
    }]);
  });

  it("logs an ntfy failure and records the claimed reading as failed", async () => {
    const failed: number[] = [];
    const logs: unknown[][] = [];
    const result = await createTemperatureAlertService(config, {
      ...repository(highReading),
      async markDeliveryFailed(_ruleKey, readingId) { failed.push(readingId); },
    }, {
      async publish() { throw new Error("ntfy unavailable"); },
    }, {
      error(...args: unknown[]) { logs.push(args); },
    }).evaluate();

    assert.equal(result, "publish-failed");
    assert.deepEqual(failed, [42]);
    assert.equal(logs.length, 1);
  });
});

describe("ntfy publisher", () => {
  it("posts title, priority, click link, and message to the configured topic", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const publisher = createNtfyPublisher(
      { server: "https://ntfy.sh/", topic: "wineops test" },
      async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return new Response("ok", { status: 200 });
      },
    );

    await publisher.publish({
      title: "Title",
      message: "Message",
      priority: "high",
      clickUrl: "https://wineops.vercel.app",
    });

    assert.equal(requestedUrl, "https://ntfy.sh/wineops%20test");
    assert.equal(requestedInit?.method, "POST");
    assert.equal((requestedInit?.headers as Record<string, string>).Title, "Title");
    assert.equal((requestedInit?.headers as Record<string, string>).Priority, "high");
    assert.equal((requestedInit?.headers as Record<string, string>).Click, "https://wineops.vercel.app");
    assert.equal(requestedInit?.body, "Message");
  });

  it("rejects an unsuccessful ntfy response", async () => {
    const publisher = createNtfyPublisher(
      { server: "https://ntfy.sh", topic: "wineops-test" },
      async () => new Response("no", { status: 503 }),
    );
    await assert.rejects(
      publisher.publish({ title: "Title", message: "Message", priority: "default", clickUrl: "https://wineops.vercel.app" }),
      /HTTP 503/,
    );
  });
});
