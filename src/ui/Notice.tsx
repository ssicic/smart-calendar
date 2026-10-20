import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font } from "./theme";

/**
 * A warning you can wave away. "warn" is yellow (just so you know), "block"
 * is red (this will overlap something you said is fixed or kept). Neither
 * stops you: OK hides it, and you can also just carry on and save.
 */
export function Notice({ text, tone = "warn", onDismiss }: { text: string; tone?: "warn" | "block"; onDismiss: () => void }) {
  const t = tone === "warn" ? warn : block;
  return (
    <View style={[styles.box, t.box]}>
      <Text style={[styles.text, t.text]}>{text}</Text>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide this warning">
        <Text style={[styles.ok, t.text]}>OK</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: 10 },
  text: { flex: 1, lineHeight: 20 },
  ok: { fontFamily: font.heavy },
});
const warn = StyleSheet.create({ box: { backgroundColor: colors.warnSoft }, text: { color: colors.warnText } });
const block = StyleSheet.create({ box: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } });
