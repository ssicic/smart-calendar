import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, font } from "./theme";
import { maxTemp, weatherLook, weatherText, type DayWeather } from "./weather";

/** A tiny "☁ 16°" for a day header. Draws nothing without a forecast for that day. */
export function WeatherTag({ w, color = colors.textMuted }: { w: DayWeather | undefined; color?: string }) {
  if (!w) return null;
  return (
    <View style={styles.row} accessible accessibilityLabel={weatherText(w)}>
      <Ionicons name={weatherLook(w.code).icon} size={12} color={color} />
      <Text style={[styles.temp, { color }]}>{maxTemp(w)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 1, marginTop: 1 },
  temp: { fontSize: 10, fontFamily: font.semibold, fontVariant: ["tabular-nums"] },
});
