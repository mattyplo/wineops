export interface Notification {
  title: string;
  message: string;
  priority: "default" | "high";
  clickUrl: string;
}

export interface NotificationPublisher {
  publish(notification: Notification): Promise<void>;
}

export interface NtfyConfig {
  server: string;
  topic: string;
}

export function createNtfyPublisher(
  config: NtfyConfig,
  fetchImpl: typeof fetch = fetch,
): NotificationPublisher {
  const endpoint = `${config.server.replace(/\/$/, "")}/${encodeURIComponent(config.topic)}`;

  return {
    async publish(notification) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Title": notification.title,
          "Priority": notification.priority,
          "Click": notification.clickUrl,
        },
        body: notification.message,
      });

      if (!response.ok) {
        throw new Error(`ntfy publish failed with HTTP ${response.status}`);
      }
    },
  };
}
