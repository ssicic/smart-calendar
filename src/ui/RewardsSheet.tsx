import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PointsSummary, Reward } from "../db/pointsStore";
import { POINTS, SIZE_LABELS, SIZE_PRICES, priceLabel, type RewardSize } from "./points";
import { colors, font, radius } from "./theme";

type Result = Promise<string | undefined>;

interface Props {
  visible: boolean;
  summary: PointsSummary;
  onAdd: (title: string, price: number) => Result;
  onRemove: (id: string) => Result;
  onSpend: (r: Reward) => Result;
  onUndoSpend: (id: string) => Result;
  onClose: () => void;
}

const SIZES: RewardSize[] = ["small", "medium", "big", "huge"];

const HOW = [
  ["To-do", POINTS.todo],
  ["Habit session or exercise", POINTS.session],
  ["Work and other done blocks", `1 per ${POINTS.minutesPerPoint} min`],
  ["Enough of something this week (gym 3 of 3)", `+${POINTS.weeklyTarget}`],
  ["Week goal", POINTS.weekGoal],
  ["Month goal", POINTS.monthGoal],
  ["Year goal", POINTS.yearGoal],
  ["Journey step up", POINTS.stepUp],
] as const;

/** Points and the user's own rewards: spend points on them, add new ones. */
export function RewardsSheet({ visible, summary, onAdd, onRemove, onSpend, onUndoSpend, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<RewardSize>("small");
  const [price, setPrice] = useState(String(SIZE_PRICES.small));
  const [error, setError] = useState<string>();
  const [confirmSpend, setConfirmSpend] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState<string>();
  const [enjoy, setEnjoy] = useState<string>();
  const [showHow, setShowHow] = useState(false);
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
      setError(undefined);
      setConfirmSpend(undefined);
      setConfirmRemove(undefined);
      setEnjoy(undefined);
      setFull(false);
    }
  }, [visible]);

  const pickSize = (s: RewardSize) => {
    setSize(s);
    setPrice(String(SIZE_PRICES[s]));
  };

  const add = async () => {
    const err = await onAdd(title, Number(price));
    if (err) return setError(err);
    setError(undefined);
    setTitle("");
    pickSize("small");
  };

  const spend = async (r: Reward) => {
    if (confirmSpend !== r.id) return setConfirmSpend(r.id);
    setConfirmSpend(undefined);
    const err = await onSpend(r);
    if (err) return setError(err);
    setError(undefined);
    setEnjoy(`Enjoy ${r.title.toLowerCase()}. You earned it.`);
  };

  const remove = async (id: string) => {
    if (confirmRemove !== id) return setConfirmRemove(id);
    setConfirmRemove(undefined);
    const err = await onRemove(id);
    if (err) setError(err);
  };

  const priceNumber = Number(price);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
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
              <Text style={styles.heading}>Rewards</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.balance}>
              <Ionicons name="star" size={22} color={colors.accentStrong} />
              <Text style={styles.balanceText}>{summary.balance} points</Text>
              <Text style={styles.muted}>+{summary.week} this week</Text>
            </View>
            {enjoy && <Text style={styles.ok}>{enjoy}</Text>}
            {error && <Text style={styles.error}>{error}</Text>}

            <Text style={styles.section}>Your rewards</Text>
            {summary.rewards.length === 0 && (
              <Text style={styles.muted}>Add things you'd enjoy, small and big. Points from done things pay for them.</Text>
            )}
            {summary.rewards.map((r) => {
              const short = r.price - summary.balance;
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{r.title}</Text>
                    <Text style={styles.muted}>
                      {r.price} points · {priceLabel(r.price)}
                    </Text>
                  </View>
                  {short > 0 ? (
                    <Text style={styles.toGo}>{short} to go</Text>
                  ) : (
                    <Pressable onPress={() => spend(r)} style={styles.primary} accessibilityRole="button">
                      <Text style={styles.primaryText}>{confirmSpend === r.id ? `Spend ${r.price}?` : "Spend"}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => remove(r.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete ${r.title}`}>
                    {confirmRemove === r.id ? (
                      <Text style={styles.danger}>Delete?</Text>
                    ) : (
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    )}
                  </Pressable>
                </View>
              );
            })}

            <Text style={styles.section}>Add a reward</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              onFocus={() => setFull(true)}
              placeholder="e.g. Coffee out, new book, concert"
              maxLength={60}
            />
            <View style={styles.row}>
              {SIZES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => pickSize(s)}
                  style={[styles.chip, size === s && styles.chipOn]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, size === s && styles.chipTextOn]}>{SIZE_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={price}
                onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ""))}
                onFocus={() => setFull(true)}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={[styles.muted, styles.flex]}>
                points{priceNumber > 0 ? ` · ${priceLabel(priceNumber)}` : ""}
              </Text>
              <Pressable onPress={add} style={styles.primary} accessibilityRole="button">
                <Text style={styles.primaryText}>Add</Text>
              </Pressable>
            </View>

            {summary.spends.length > 0 && (
              <>
                <Text style={styles.section}>Spent</Text>
                {summary.spends.slice(0, 5).map((s, i) => (
                  <View key={s.id} style={styles.spendRow}>
                    <Text style={[styles.reason, styles.flex]}>
                      {s.title} · {s.price}
                    </Text>
                    {i === 0 && (
                      <Pressable onPress={() => onUndoSpend(s.id)} hitSlop={10} accessibilityRole="button">
                        <Text style={styles.link}>Undo</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}

            <Pressable onPress={() => setShowHow(!showHow)} accessibilityRole="button">
              <Text style={styles.link}>{showHow ? "Hide how points work" : "How points work ›"}</Text>
            </Pressable>
            {showHow && (
              <View style={styles.how}>
                {HOW.map(([what, pts]) => (
                  <View key={what} style={styles.spendRow}>
                    <Text style={[styles.reason, styles.flex]}>{what}</Text>
                    <Text style={styles.cardTitle}>{pts}</Text>
                  </View>
                ))}
                <Text style={styles.muted}>
                  In Manage groups, a group can be ×2 (Work, Learning, Health to start): double for its sessions, blocks
                  and weekly targets. Or Flat (Social, Rest, Travel): {POINTS.flat} per done block, however long. Now
                  and then something gives a surprise bonus. Missing things never costs points. A good week is about
                  300-400 points.
                </Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
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
  link: { fontSize: 15, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 10, paddingBottom: 16 },
  balance: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: radius.lg, backgroundColor: colors.panel },
  balanceText: { fontFamily: font.heavy, fontSize: 22, color: colors.text, flex: 1 },
  section: { fontFamily: font.bold, fontSize: 16, color: colors.text, marginTop: 6 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.panel },
  flex: { flex: 1 },
  cardTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  toGo: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  reason: { fontFamily: font.regular, fontSize: 14, color: colors.textSoft },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
  },
  priceInput: { width: 90 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  chipOn: { backgroundColor: colors.accent },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: colors.textSoft },
  chipTextOn: { color: colors.white },
  primary: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.accent },
  primaryText: { fontFamily: font.bold, fontSize: 14, color: colors.white },
  spendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  how: { gap: 6, padding: 12, borderRadius: radius.lg, backgroundColor: colors.panel },
  ok: { fontFamily: font.semibold, fontSize: 14, color: colors.successStrong },
  danger: { fontFamily: font.semibold, fontSize: 13, color: colors.danger },
  error: { fontFamily: font.semibold, fontSize: 14, color: colors.danger },
});
