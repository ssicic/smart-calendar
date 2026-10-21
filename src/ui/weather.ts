// Weather for the calendar's day headers, from Open-Meteo (free, no key, no
// account). Pure: parsing, icons and cache rules. No React, no network.
import type { Ionicons } from "@expo/vector-icons";

export interface DayWeather {
  /** WMO weather code (0 = clear sky … 99 = thunderstorm with hail). */
  code: number;
  max: number;
  min: number;
  /** Highest chance of rain that day, 0-100, if known. */
  rainPct: number | null;
}

/** By date, "YYYY-MM-DD". */
export type Forecast = Record<string, DayWeather>;

export interface WeatherCache {
  fetchedAt: number; // ms since 1970
  lat: number;
  lon: number;
  days: Forecast;
}

/** About 11 km. Enough for weather, and the exact location is never stored or sent. */
export const roundCoord = (x: number) => Math.round(x * 10) / 10;

const REFRESH_MS = 3 * 60 * 60 * 1000; // forecasts change slowly; 3 hours is plenty

export function forecastUrl(lat: number, lon: number): string {
  const daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${daily}&timezone=auto&forecast_days=16`;
}

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

/** Open-Meteo's column lists -> one entry per date. Days with missing values are skipped. */
export function parseForecast(json: OpenMeteoDaily): Forecast {
  const d = json.daily;
  const out: Forecast = {};
  (d?.time ?? []).forEach((date, i) => {
    const code = d?.weather_code?.[i];
    const max = d?.temperature_2m_max?.[i];
    const min = d?.temperature_2m_min?.[i];
    if (code == null || max == null || min == null) return;
    out[date] = { code, max, min, rainPct: d?.precipitation_probability_max?.[i] ?? null };
  });
  return out;
}

/** Fetch again when there's no cache, it's 3 hours old, or you've moved (another rounded spot). */
export function needsRefresh(cache: WeatherCache | null, nowMs: number, here: { lat: number; lon: number }): boolean {
  if (!cache) return true;
  if (nowMs - cache.fetchedAt > REFRESH_MS) return true;
  return cache.lat !== roundCoord(here.lat) || cache.lon !== roundCoord(here.lon);
}

type IconName = keyof typeof Ionicons.glyphMap;

/** An icon and a word for a WMO weather code. */
export function weatherLook(code: number): { icon: IconName; label: string } {
  if (code === 0) return { icon: "sunny-outline", label: "Clear" };
  if (code <= 2) return { icon: "partly-sunny-outline", label: "Partly cloudy" };
  if (code === 3) return { icon: "cloudy-outline", label: "Cloudy" };
  if (code === 45 || code === 48) return { icon: "cloudy-outline", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "rainy-outline", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "rainy-outline", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "snow-outline", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "rainy-outline", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "snow-outline", label: "Snow showers" };
  if (code >= 95) return { icon: "thunderstorm-outline", label: "Thunderstorm" };
  return { icon: "cloudy-outline", label: "Cloudy" };
}

/** "16°" */
export const maxTemp = (w: DayWeather) => `${Math.round(w.max)}°`;

/** "Showers, 17° / 9°, 95% rain" for the list view and screen readers. */
export function weatherText(w: DayWeather): string {
  const rain = w.rainPct !== null && w.rainPct >= 30 ? `, ${w.rainPct}% rain` : "";
  return `${weatherLook(w.code).label}, ${Math.round(w.max)}° / ${Math.round(w.min)}°${rain}`;
}
