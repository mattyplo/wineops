import { describe, expect, it } from "vitest";
import {
  celsiusToFahrenheit,
  formatEventType,
  formatTemperature,
} from "./format";

describe("temperature formatting", () => {
  it("converts Celsius to Fahrenheit without mutating the source value", () => {
    const reading = { temperature_c: 20 };

    expect(celsiusToFahrenheit(reading.temperature_c)).toBe(68);
    expect(formatTemperature(reading.temperature_c)).toBe("68.0°F");
    expect(reading.temperature_c).toBe(20);
  });

  it("formats API event type identifiers as readable labels", () => {
    expect(formatEventType("ice_added")).toBe("Ice Added");
  });
});
