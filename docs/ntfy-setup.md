# ntfy push notification setup

WineOps uses the public [ntfy.sh](https://ntfy.sh) service for the initial mobile push-notification proof of concept (Issue #18). Self-hosting is not needed at this stage.

## Subscribe a phone

1. Install the **ntfy** mobile application.
2. Allow the app to send notifications.
3. Add a new subscription with a topic name unique to WineOps (see below).
4. Leave **Use another server** disabled, so the subscription uses `https://ntfy.sh`.

The first tested topic was `wineops-temperature-threshold-alert-78143`. A push notification sent from macOS Terminal was successfully received on an iPhone on October 11, 2026.

## Publish a test from Terminal

Replace `YOUR_TOPIC` with the exact topic subscribed to on the phone:

```bash
curl -fS \
  -H "Title: WineOps Temperature Alert" \
  -H "Priority: high" \
  -H "Tags: thermometer" \
  -H "Click: https://wineops.vercel.app" \
  -d "Test alert: WineOps notification channel is working." \
  "https://ntfy.sh/YOUR_TOPIC"
```

Verify that a notification appears on the phone. The `Click` header provides a route back to the WineOps dashboard; confirm this behavior separately on the target mobile device. A successful HTTP publication by itself does not prove mobile delivery.

## Topic naming convention (MVP)

Use a descriptive WineOps prefix and a random, hard-to-guess suffix, for example `wineops-temperature-<random-suffix>`. Keep the exact string identical in publisher configuration and mobile subscriptions. There is no need for a formal taxonomy yet.

**Security:** Public ntfy topics are not authenticated or private simply because the name is obscure. Someone who learns or guesses the name may be able to subscribe or publish. Do not include secrets, identifying information, or sensitive operational details in notification bodies. Use a longer cryptographically random suffix for continued use; rotate the topic and update all subscribers/publishers if it becomes exposed. For production-grade confidentiality or access control, evaluate authenticated/self-hosted ntfy later.

## Scope and next work

Issue #18 validates a push channel only; no WineOps backend integration or automated alert evaluation is included.

Next: add server-side temperature threshold evaluation for incoming sensor readings, send an initial notification and at most one follow-up if still out of range after at least 15 minutes, suppress further reminders until recovery, and link alerts to the dashboard. Sensor-health alerts and acknowledgment/muting workflows follow separately.
