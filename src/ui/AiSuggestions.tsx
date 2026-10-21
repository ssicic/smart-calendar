import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { AiSuggestion } from "./aiReview";
import { colors, font } from "./theme";
import type { AiState } from "./useAiReview";

interface Props {
  state: AiState;
  onAsk: () => void;
  onAccept: (s: AiSuggestion) => Promise<string | undefined>;
}

/** "Suggestions" in the week review: the AI proposes, the user taps to accept. */
export function AiSuggestions({ state, onAsk, onAccept }: Props) {
  if (state.status === "idle" || state.status === "error") {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Suggestions</Text>
        <Text style={styles.note}>
          Looks at your last few weeks and suggests up to 3 small changes. You decide what to keep. Sends item names
          and numbers to the AI service.
        </Text>
        {state.status === "error" && <Text style={styles.error}>{state.message}</Text>}
        <Pressable onPress={onAsk} style={styles.ask} accessibilityRole="button">
          <Ionicons name="sparkles-outline" size={16} color={colors.white} />
          <Text style={styles.askText}>{state.status === "error" ? "Try again" : "Suggest changes"}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status === "loading") {
    return (
      <View style={[styles.box, styles.row]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.note}>Looking at your weeks…</Text>
      </View>
    );
  }

  const { summary, suggestions } = state.review;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Suggestions</Text>
      <Text style={styles.summary}>{summary}</Text>
      {suggestions.length === 0 && <Text style={styles.note}>No changes needed. Keep going as you are.</Text>}
      {suggestions.map((s, i) => (
        <SuggestionCard key={i} s={s} onAccept={onAccept} />
      ))}
    </View>
  );
}

function SuggestionCard({ s, onAccept }: { s: AiSuggestion; onAccept: Props["onAccept"] }) {
  // Each card keeps its own little state: open, saving, accepted or dismissed.
  const [status, setStatus] = useState<"open" | "saving" | "accepted" | "dismissed">("open");
  const [error, setError] = useState<string>();
  if (status === "dismissed") return null;
  const isTip = s.action.type === "none";

  const accept = async () => {
    setStatus("saving");
    const err = await onAccept(s);
    if (err) {
      setError(err);
      setStatus("open");
    } else setStatus("accepted");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{s.title}</Text>
      <Text style={styles.reason}>{s.reason}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {status === "accepted" ? (
        <View style={styles.row}>
          <Ionicons name="checkmark-circle" size={18} color={colors.successStrong} />
          <Text style={styles.accepted}>{isTip ? "Noted" : "Changed. Your week is re-planned."}</Text>
        </View>
      ) : (
        <View style={styles.buttons}>
          <Pressable onPress={() => setStatus("dismissed")} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
          <Pressable onPress={accept} disabled={status === "saving"} style={styles.primary} accessibilityRole="button">
            <Text style={styles.primaryText}>{isTip ? "OK" : "Accept"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.panel },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 13, fontFamily: font.bold, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  summary: { fontFamily: font.regular, fontSize: 15, color: colors.text, lineHeight: 21 },
  note: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  error: { fontFamily: font.semibold, fontSize: 13, color: colors.danger },
  ask: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
  },
  askText: { color: colors.white, fontFamily: font.bold, fontSize: 15 },
  card: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.white },
  cardTitle: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  reason: { fontFamily: font.regular, fontSize: 14, color: colors.textSoft, lineHeight: 19 },
  accepted: { fontFamily: font.semibold, fontSize: 14, color: colors.successStrong },
  buttons: { flexDirection: "row", gap: 8, marginTop: 4 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontFamily: font.bold, fontSize: 14, color: colors.textSoft },
  primary: { flex: 2, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: colors.accent },
  primaryText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
});
