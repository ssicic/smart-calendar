import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius } from "./theme";

/**
 * A row of tappable pills; the selected ones are filled. Generic over the
 * value type T, so the same component works for strings, numbers, etc.
 */
export function Chips<T extends string | number>(props: {
  options: { value: T; label: string }[];
  isSelected: (value: T) => boolean;
  onPress: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {props.options.map((o) => {
        const selected = props.isSelected(o.value);
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => props.onPress(o.value)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { fontSize: 14, fontFamily: font.semibold, color: colors.textSoft },
  chipTextSelected: { color: colors.white },
});
