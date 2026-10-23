// Over-the-air updates (EAS Update). The app looks for a new version when it
// opens and whenever it comes back to the front; once one has downloaded, a
// banner offers "Restart now" so it never waits for a cold start.
import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius } from "./theme";

/** Checks for an update and downloads it. Quiet on errors (offline is normal). */
async function fetchIfNew() {
  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // No internet, or updates are off (Expo Go, web, dev): try again later.
  }
}

/** "Version 24 Oct, 14:05" for the running update, or "Version from the install". */
export function versionLabel(): string {
  if (Platform.OS === "web" || !Updates.isEnabled) return "Development version";
  const at = Updates.createdAt;
  if (Updates.isEmbeddedLaunch || !at) return "Version from the install";
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `Version ${day}, ${time}`;
}

export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS === "web" || !Updates.isEnabled) return;
    fetchIfNew();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") fetchIfNew();
    });
    return () => sub.remove();
  }, []);

  if (!isUpdatePending) return null;
  return (
    <View style={[styles.banner, { bottom: insets.bottom + 12 }]}>
      <Ionicons name="sparkles-outline" size={18} color={colors.accentStrong} />
      <Text style={styles.text}>A new version is ready</Text>
      <Pressable
        onPress={() => Updates.reloadAsync().catch(console.error)}
        style={styles.button}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Restart now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    paddingLeft: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  text: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: colors.accentStrong },
  button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.accent },
  buttonText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
});
