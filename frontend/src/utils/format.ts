export function celsiusToFahrenheit(celsius: number) {
  return (celsius * 9) / 5 + 32;
}

export function formatTemperature(celsius: number) {
  return `${celsiusToFahrenheit(celsius).toFixed(1)}°F`;
}

export function formatLocalDateTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function formatEventType(eventType: string) {
  return eventType
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
