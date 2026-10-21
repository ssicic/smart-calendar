// Talks to the Python AI service (ai-service/). The API key lives there, never in the app.
import Constants from "expo-constants";
import { Platform } from "react-native";

const PORT = 8787;

/**
 * Where the AI service runs. During development it's the same computer that
 * runs Expo: on the phone that's the Mac's address from the QR code, on web
 * the page's own host. EXPO_PUBLIC_AI_URL overrides both (e.g. once deployed).
 */
export function aiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_AI_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") return `http://${window.location.hostname}:${PORT}`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:${PORT}`;
}

/** POST JSON and get JSON back. Throws an Error with a message that's fine to show. */
export async function postJson<T>(path: string, body: unknown, timeoutMs = 90_000): Promise<T> {
  // AbortController: cancels the request if the service takes too long.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${aiBaseUrl()}${path}`, {
      method: "POST",
      // The app token from .env (EXPO_PUBLIC_AI_TOKEN); see check_token in ai-service/app/main.py.
      headers: { "Content-Type": "application/json", "X-App-Token": process.env.EXPO_PUBLIC_AI_TOKEN ?? "" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      controller.signal.aborted
        ? "The AI service took too long. Try again."
        : "Can't reach the AI service. Is it running on your Mac (ai-service, port 8787)?",
    );
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : `The AI service said no (${res.status}).`);
  return data as T;
}
