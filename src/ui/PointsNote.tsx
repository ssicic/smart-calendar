import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius } from "./theme";
import type { PointsNote as Note } from "./usePoints";

/** "+10 · That's the hard part done." Shows for a few seconds after earning points; tap to hide. */
export function PointsNote({ note, onDone }: { note?: Note; onDone: () => void }) {
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [note, onDone]);

  if (!note) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={onDone} style={styles.note} accessibilityRole="button" accessibilityLiveRegion="polite">
        <Ionicons name="star" size={16} color={colors.white} />
        <Text style={styles.points}>+{note.points}</Text>
        <Text style={styles.line} numberOfLines={2}>
          {note.line}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, bottom: 96, alignItems: "center" },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 420,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.accentStrong,
  },
  points: { fontFamily: font.heavy, fontSize: 15, color: colors.white },
  line: { fontFamily: font.semibold, fontSize: 14, color: colors.white, flexShrink: 1 },
});
