import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, font } from "./theme";
import type { SavedSummary } from "./useMonthSummary";

interface Props {
  visible: boolean;
  /** "October 2026" */
  title: string;
  saved: SavedSummary | null;
  status: "idle" | "loading" | "error";
  error?: string;
  /** False for a month that hasn't started: nothing to summarise yet. */
  canWrite: boolean;
  onWrite: () => void;
  onClose: () => void;
}

/** "20.10." from "2026-10-20". */
const shortDay = (key: string) => {
  const [, m, d] = key.split("-");
  return `${Number(d)}.${Number(m)}.`;
};

/** The month at a glance: wins, patterns, what slipped, one idea for next month. */
export function MonthSummarySheet({ visible, title, saved, status, error, canWrite, onWrite, onClose }: Props) {
  const s = saved?.summary;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.heading}>Month summary</Text>
              <Text style={styles.sub}>{title}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {status === "loading" ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.note}>Looking at your month…</Text>
              </View>
            ) : s ? (
              <>
                <Text style={styles.headline}>{s.headline}</Text>
                <List title="Wins" icon="trophy-outline" color={colors.successStrong} lines={s.wins} />
                <List title="Patterns" icon="analytics-outline" color={colors.accentStrong} lines={s.patterns} />
                <List title="Slipped" icon="leaf-outline" color={colors.textSoft} lines={s.slipped} />
                {s.next_month_tip !== "" && (
                  <View style={styles.tip}>
                    <Text style={styles.tipTitle}>For next month</Text>
                    <Text style={styles.line}>{s.next_month_tip}</Text>
                  </View>
                )}
                <Text style={styles.note}>
                  Written on {shortDay(saved.writtenOn)}
                  {saved.monthWasOver ? "" : ", while the month was still running"}.
                </Text>
              </>
            ) : (
              <Text style={styles.note}>
                {canWrite
                  ? "A short look back: what went well, patterns in when things get done, and what slipped. Sends item names and numbers to the AI service."
                  : "This month hasn't started yet."}
              </Text>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
            {canWrite && status !== "loading" && (
              <Pressable onPress={onWrite} style={s ? styles.secondary : styles.primary} accessibilityRole="button">
                <Ionicons name="sparkles-outline" size={16} color={s ? colors.textSoft : colors.white} />
                <Text style={s ? styles.secondaryText : styles.primaryText}>{s ? "Write again" : "Write my summary"}</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function List(props: { title: string; icon: keyof typeof Ionicons.glyphMap; color: string; lines: string[] }) {
  if (props.lines.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Ionicons name={props.icon} size={16} color={props.color} />
        <Text style={styles.sectionTitle}>{props.title}</Text>
      </View>
      {props.lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
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
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  heading: { fontSize: 20, fontFamily: font.heavy, color: colors.text },
  sub: { marginTop: 2, color: colors.textMuted },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 16, paddingBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  headline: { fontFamily: font.regular, fontSize: 16, color: colors.text, lineHeight: 22 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 13, fontFamily: font.bold, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  line: { fontFamily: font.regular, fontSize: 15, color: colors.text, lineHeight: 21 },
  tip: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: colors.panel },
  tipTitle: { fontFamily: font.bold, fontSize: 14, color: colors.accentStrong },
  note: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  error: { fontFamily: font.semibold, fontSize: 13, color: colors.danger },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryText: { color: colors.textSoft, fontFamily: font.bold, fontSize: 15 },
});
