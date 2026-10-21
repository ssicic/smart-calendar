// The forecast for the next 16 days where you are. Shows the saved forecast
// straight away, then fetches a fresh one when it's old or you've moved.
// Location is asked for once (the system remembers the answer on Android;
// a browser may ask again). Only a rounded position (~11 km) is used.
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { loadSetting, saveSetting, type Db } from "../db/weekStore";
import { forecastUrl, needsRefresh, parseForecast, roundCoord, type Forecast, type WeatherCache } from "./weather";

const KEY = "weather";

export type WeatherStatus = "loading" | "ready" | "no-permission" | "offline";

async function currentPlace(): Promise<{ lat: number; lon: number } | null> {
  let { granted } = await Location.getForegroundPermissionsAsync();
  if (!granted) ({ granted } = await Location.requestForegroundPermissionsAsync());
  if (!granted) return null;
  // A recent known position is instant; otherwise ask for a rough fix (fast, low battery).
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 60 * 60 * 1000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  return { lat: pos.coords.latitude, lon: pos.coords.longitude };
}

export function useWeather(db: Db) {
  const [forecast, setForecast] = useState<Forecast>({});
  const [status, setStatus] = useState<WeatherStatus>("loading");

  useEffect(() => {
    let cancelled = false; // the screen closed before we finished: don't set state
    (async () => {
      const cache = await loadSetting<WeatherCache>(db, KEY);
      if (cache && !cancelled) setForecast(cache.days);

      const place = await currentPlace().catch(() => null);
      if (!place) {
        if (!cancelled) setStatus(cache ? "ready" : "no-permission");
        return;
      }
      if (!needsRefresh(cache, Date.now(), place)) {
        if (!cancelled) setStatus("ready");
        return;
      }
      const lat = roundCoord(place.lat);
      const lon = roundCoord(place.lon);
      try {
        const res = await fetch(forecastUrl(lat, lon));
        if (!res.ok) throw new Error(String(res.status));
        const days = parseForecast(await res.json());
        await saveSetting(db, KEY, { fetchedAt: Date.now(), lat, lon, days } satisfies WeatherCache);
        if (!cancelled) {
          setForecast(days);
          setStatus("ready");
        }
      } catch {
        // No internet: keep showing the saved forecast, if any.
        if (!cancelled) setStatus(cache ? "ready" : "offline");
      }
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [db]);

  return { forecast, status };
}
