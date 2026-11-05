import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { LaterEntry } from "../db/laterStore";
import type { Db } from "../db/weekStore";
import { ReviewSheet } from "./ReviewSheet";
import { colors, font, radius } from "./theme";
import { useAskWeeks } from "./useAskWeeks";
import { loadWeekLog, type WeekLog } from "./useHistory";
import { addWeeks, weekRange } from "./weekDate";
import type { RagDoc } from "./weekDocs";
import type { Groups } from "./WeekView";

interface Props {
  db: Db;
  visible: boolean;
  thisWeek: string;
  todayKey: string;
  groups: Groups;
  later: LaterEntry[];
  /** A month chip: show that month ("2026-10"). */
  onOpenMonth: (month: string) => void;
  onClose: () => void;
}

const EXAMPLES = ["When did I last go to the gym before work?", "Which week did I get the most done?", "How did my habits go last month?"];

/** "Ask your past weeks": a question, a short answer, and the weeks it comes from. */
export function AskWeeksSheet({ db, visible, thisWeek, todayKey, groups, later, onOpenMonth, onClose }: Props) {
  const { state, ask } = useAskWeeks(db, visible, thisWeek, todayKey, groups);
  const [question, setQuestion] = useState("");
  const [review, setReview] = useState<WeekLog>();
  const working = state.status === "working";

  // A fresh start every time the sheet opens.
  useEffect(() => {
    if (visible) setQuestion("");
  }, [visible]);

  const send = () => {
    if (!working && question.trim()) ask(question).catch(console.error);
  };
  const openDoc = (doc: RagDoc) => {
    if (doc.kind === "month") onOpenMonth(doc.key);
    else loadWeekLog(db, doc.key, todayKey, groups).then(setReview).catch(console.error);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.heading}>Ask your past weeks</Text>
              <Text style={styles.sub}>Answers come only from your own weeks.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.askRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={question}
                onChangeText={setQuestion}
                placeholder="When did I last…"
                placeholderTextColor={colors.textFaint}
                returnKeyType="search"
                onSubmitEditing={send}
                maxLength={300}
                accessibilityLabel="Your question"
              />
              <Pressable
                onPress={send}
                disabled={working || !question.trim()}
                style={[styles.askButton, (working || !question.trim()) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Ask"
              >
                <Ionicons name="arrow-up" size={20} color={colors.white} />
              </Pressable>
            </View>

            {state.status === "idle" && (
              <View style={styles.examples}>
                {EXAMPLES.map((e) => (
                  <Pressable key={e} onPress={() => setQuestion(e)} style={styles.example} accessibilityRole="button">
                    <Text style={styles.exampleText}>{e}</Text>
                  </Pressable>
                ))}
                <Text style={styles.note}>
                  Search runs on your phone. Only the question and the 5 weeks that fit it best go to the AI service.
                </Text>
              </View>
            )}

            {state.status === "working" && (
              <View style={styles.row}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.note}>{state.step}</Text>
              </View>
            )}

            {state.status === "error" && <Text style={styles.error}>{state.message}</Text>}

            {state.status === "ready" && (
              <View style={styles.answerBox}>
                <Text style={styles.answerQuestion}>{state.result.question}</Text>
                <Text style={styles.answer}>{state.result.answer}</Text>
                {state.result.cited.length > 0 && (
                  <View style={styles.chips}>
                    {state.result.cited.map((doc) => (
                      <Pressable
                        key={doc.id}
                        onPress={() => openDoc(doc)}
                        style={styles.chip}
                        accessibilityRole="button"
                        accessibilityLabel={doc.kind === "week" ? `${doc.title}, open its review` : `${doc.title}, open the month`}
                      >
                        <Ionicons name="calendar-outline" size={14} color={colors.accentStrong} />
                        <Text style={styles.chipText}>{doc.title}</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
                      </Pressable>
                    ))}
                  </View>
                )}
                {state.result.mode === "keyword" && (
                  <Text style={styles.note}>Searched by words only (meaning search isn't set up on the AI service).</Text>
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      {review && (
        <ReviewSheet
          visible
          weekLabel={weekRange(review.weekStart)}
          nextWeekStart={addWeeks(review.weekStart, 1)}
          stats={review.stats}
          routines={review.routines}
          items={review.items}
          movedOn={review.movedOn}
          later={later}
          onClose={() => setReview(undefined)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 16,
    paddingBottom: 24,
    maxHeight: "92%",
    minHeight: "60%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flex: { flex: 1 },
  heading: { fontSize: 20, fontFamily: font.display, color: colors.text },
  sub: { marginTop: 2, color: colors.textMuted, fontFamily: font.regular },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  body: { gap: 16, paddingTop: 8, paddingBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  askRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 48,
  },
  askButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  examples: { gap: 8 },
  example: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.panel },
  exampleText: { fontFamily: font.medium, fontSize: 14, color: colors.textSoft },
  answerBox: { gap: 12 },
  answerQuestion: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  answer: { fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: colors.accentSoft,
  },
  chipText: { fontFamily: font.bold, fontSize: 14, color: colors.accentStrong },
  note: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  error: { fontFamily: font.semibold, fontSize: 13, color: colors.danger },
});
