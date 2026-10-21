import { describe, expect, it } from "vitest";
import { maxTemp, needsRefresh, parseForecast, roundCoord, weatherLook, weatherText } from "./weather";

// The shape Open-Meteo really returns (trimmed), from a request for Zagreb.
const SAMPLE = {
  daily: {
    time: ["2026-10-21", "2026-10-22", "2026-10-23"],
    weather_code: [80, 63, null],
    temperature_2m_max: [16.5, 14.8, 12.6],
    temperature_2m_min: [8.9, 8.1, 4.1],
    precipitation_probability_max: [95, null, 0],
  },
};

describe("parseForecast", () => {
  it("turns the column lists into one entry per date and skips incomplete days", () => {
    expect(parseForecast(SAMPLE)).toEqual({
      "2026-10-21": { code: 80, max: 16.5, min: 8.9, rainPct: 95 },
      "2026-10-22": { code: 63, max: 14.8, min: 8.1, rainPct: null },
    });
  });
  it("copes with an empty answer", () => {
    expect(parseForecast({})).toEqual({});
  });
});

describe("needsRefresh", () => {
  const here = { lat: 45.8168, lon: 15.9868 };
  const cache = { fetchedAt: 0, lat: 45.8, lon: 16, days: {} };
  const hour = 60 * 60 * 1000;

  it("fetches with no cache, after 3 hours, or after moving", () => {
    expect(needsRefresh(null, 0, here)).toBe(true);
    expect(needsRefresh(cache, 2 * hour, here)).toBe(false);
    expect(needsRefresh(cache, 4 * hour, here)).toBe(true);
    expect(needsRefresh(cache, hour, { lat: 43.5, lon: 16.44 })).toBe(true); // Split
  });
  it("rounds coordinates to about 11 km", () => {
    expect([roundCoord(45.8168), roundCoord(15.9868)]).toEqual([45.8, 16]);
  });
});

describe("weatherLook and text", () => {
  it("maps WMO codes to icons", () => {
    expect([0, 2, 3, 45, 53, 63, 75, 81, 96].map((c) => weatherLook(c).label)).toEqual([
      "Clear",
      "Partly cloudy",
      "Cloudy",
      "Fog",
      "Drizzle",
      "Rain",
      "Snow",
      "Showers",
      "Thunderstorm",
    ]);
  });
  it("reads naturally, mentioning rain only when likely", () => {
    expect(weatherText({ code: 80, max: 16.5, min: 8.9, rainPct: 95 })).toBe("Showers, 17° / 9°, 95% rain");
    expect(weatherText({ code: 0, max: 20, min: 10, rainPct: 5 })).toBe("Clear, 20° / 10°");
    expect(maxTemp({ code: 0, max: -0.4, min: -5, rainPct: null })).toBe("0°");
  });
});
