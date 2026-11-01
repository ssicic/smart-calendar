import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { postJson } from "../ai/aiClient";
import type { PlanRequest, PlanResult, Proposal } from "./planAgent";
import { colors, font, radius } from "./theme";
import { Backdrop } from "./keyboard";

interface Props {
  visible: boolean;
  buildRequest: (wish: string) => PlanRequest | undefined;
  /** Applies one proposal with the app's own checks. Returns an error message, or undefined. */
  onAccept: (p: Proposal) => Promise<string | undefined>;
  onClose: () => void;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: PlanResult };

/** "Plan my week": the agent looks at the week (and an optional wish) and proposes moves; you accept or dismiss each. */
export function PlanAgentSheet({ visible, buildRequest, onAccept, onClose }: Props) {
  const [wish, setWish] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  // Per proposal (by index): "accepted", "dismissed" or an error message.
  const [outcome, setOutcome] = useState<Record<number, string>>({});
  // Full screen: swipe the top up (or start typing, so the keyboard covers nothing); down = back, then closed.
  const [full, setFull] = useState(false);
  const insets = useSafeAreaInsets();
  const latest = useRef({ full, onClose });
  latest.current = { full, onClose };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -30) setFull(true);
        else if (g.dy > 30) {
          if (latest.current.full) setFull(false);
          else latest.current.onClose();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) {
      setState({ status: "idle" });
      setOutcome({});
      setFull(false);
    }
  }, [visible]);

  const ask = async () => {
    const request = buildRequest(wish);
    if (!request) return;
    setState({ status: "loading" });
    setOutcome({});
    try {
      setState({ status: "ready", result: await postJson<PlanResult>("/plan-week", request) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  const accept = async (p: Proposal, i: number) => {
    const err = await onAccept(p);
    setOutcome((o) => ({ ...o, [i]: err ?? "accepted" }));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Backdrop style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, full && [styles.fullSheet, { paddingTop: insets.top + 4 }]]} onPress={() => {}}>
          <View {...swipe.panHandlers}>
            <Pressable
              onPress={() => setFull(!full)}
              style={styles.grabber}
              accessibilityRole="button"
              accessibilityLabel={full ? "Make the panel smaller" : "Make the panel full screen"}
            >
              <View style={styles.grabBar} />
            </Pressable>
            <View style={styles.header}>
              <Text style={styles.heading}>Plan my week</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.note}>
              The assistant looks at this week and proposes moving or skipping flexible sessions, or adds what you ask
              for ("Add Study Mon-Fri 9-13"). Fixed events never move, and nothing changes until you accept.
            </Text>
            <TextInput
              style={styles.input}
              value={wish}
              onChangeText={setWish}
              onFocus={() => setFull(true)}
              placeholder="Optional: Keep Friday evening free…"
              maxLength={300}
              multiline
            />
            <Pressable
              onPress={ask}
              disabled={state.status === "loading"}
              style={styles.ask}
              accessibilityRole="button"
            >
              {state.status === "loading" ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons name="sparkles-outline" size={16} color={colors.white} />
              )}
              <Text style={styles.askText}>
                {state.status === "loading" ? "Looking at your week…" : state.status === "ready" ? "Ask again" : "Plan my week"}
              </Text>
            </Pressable>

            {state.status === "error" && <Text style={styles.error}>{state.message}</Text>}

            {state.status === "ready" && (
              <>
                <Text style={styles.summary}>{state.result.summary}</Text>
                {state.result.proposals.map((p, i) => {
                  const done = outcome[i];
                  return (
                    <View key={i} style={[styles.card, done === "dismissed" && styles.cardOff]}>
                      <Text style={styles.cardTitle}>
                        {p.type === "add" ? `Add ${p.title}` : p.type === "move" ? `Move ${p.title}` : `Skip ${p.title} this week`}
                      </Text>
                      <Text style={styles.when}>
                        {p.type === "add"
                          ? `${p.to_label ?? ""}${p.group ? ` · ${p.group}` : ""}`
                          : `${p.from_label}${p.to_label ? `  →  ${p.to_label}` : "  →  next week"}`}
                      </Text>
                      <Text style={styles.reason}>{p.reason}</Text>
                      {p.warning ? <Text style={styles.warning}>{p.warning}</Text> : null}
                      {done === "accepted" ? (
                        <Text style={styles.ok}>Done</Text>
                      ) : done === "dismissed" ? (
                        <Text style={styles.muted}>Dismissed</Text>
                      ) : (
                        <>
                          {done && <Text style={styles.error}>{done}</Text>}
                          <View style={styles.row}>
                            <Pressable
                              onPress={() => setOutcome((o) => ({ ...o, [i]: "dismissed" }))}
                              style={styles.secondary}
                              accessibilityRole="button"
                            >
                              <Text style={styles.secondaryText}>No thanks</Text>
                            </Pressable>
                            <Pressable onPress={() => accept(p, i)} style={styles.primary} accessibilityRole="button">
                              <Text style={styles.primaryText}>Accept</Text>
                            </Pressable>
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Backdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 24,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 8,
  },
  fullSheet: { height: "100%", maxHeight: "100%", borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  grabber: { alignItems: "center", paddingBottom: 8 },
  grabBar: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heading: { fontSize: 20, fontFamily: font.heavy, color: colors.text },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 12, paddingBottom: 16 },
  note: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 48,
  },
  ask: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  askText: { fontFamily: font.bold, fontSize: 15, color: colors.white },
  summary: { fontFamily: font.regular, fontSize: 15, color: colors.text, lineHeight: 21 },
  card: { gap: 6, padding: 12, borderRadius: radius.lg, backgroundColor: colors.panel },
  cardOff: { opacity: 0.5 },
  cardTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  when: { fontFamily: font.semibold, fontSize: 14, color: colors.accentStrong },
  reason: { fontFamily: font.regular, fontSize: 14, color: colors.textSoft, lineHeight: 20 },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surfaceAlt },
  secondaryText: { fontFamily: font.bold, fontSize: 14, color: colors.textSoft },
  primary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: colors.accent },
  primaryText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
  ok: { fontFamily: font.semibold, fontSize: 14, color: colors.successStrong },
  muted: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  error: { fontFamily: font.semibold, fontSize: 14, color: colors.danger },
  warning: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
});
