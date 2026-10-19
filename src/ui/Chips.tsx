import { Pressable, StyleSheet, Text, View } from "react-native";

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
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F1F5F9" },
  chipSelected: { backgroundColor: "#5B6CF0" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  chipTextSelected: { color: "#FFFFFF" },
});
