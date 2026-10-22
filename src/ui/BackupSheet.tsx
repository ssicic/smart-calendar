import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { backupFileName, checkBackup, exportBackup, importBackup, type Backup } from "../db/backup";
import type { Db } from "../db/weekStore";
import { pickBackupText, saveBackupFile } from "./backupFiles";
import { colors, font } from "./theme";

interface Props {
  visible: boolean;
  db: Db;
  /** After an import: reload everything on screen from the new data. */
  onImported: () => void;
  onClose: () => void;
}

/** Export the whole calendar to a file, or replace it from one. */
export function BackupSheet({ visible, db, onImported, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  // A checked backup waiting for the second tap ("Replace my calendar").
  const [pending, setPending] = useState<{ backup: Backup; rows: number }>();

  useEffect(() => {
    if (!visible) {
      setMessage(undefined);
      setPending(undefined);
    }
  }, [visible]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await work();
    } catch (e) {
      console.error(e);
      setMessage({ text: "Something went wrong. Nothing was changed.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const doExport = () =>
    run(async () => {
      const now = new Date();
      await saveBackupFile(backupFileName(now), JSON.stringify(await exportBackup(db, now)));
      setMessage({ text: "Backup made. Keep the file somewhere you can reach from the other app.", ok: true });
    });

  const chooseFile = () =>
    run(async () => {
      const text = await pickBackupText();
      if (text === null) return; // cancelled
      const checked = await checkBackup(db, text);
      if (!checked.ok) return setMessage({ text: checked.error, ok: false });
      setPending({ backup: checked.backup, rows: checked.rows });
    });

  const doImport = () =>
    run(async () => {
      if (!pending) return;
      await importBackup(db, pending.backup);
      setPending(undefined);
      setMessage({ text: "Your calendar is back.", ok: true });
      onImported();
    });

  const madeOn = pending ? new Date(pending.backup.exportedAt).toLocaleString() : "";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.heading}>Backup</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.note}>
            Your calendar lives only on this device. A backup is one file with everything in it: events, routines,
            sessions, to-dos, goals and settings.
          </Text>

          <Pressable onPress={doExport} disabled={busy} style={styles.primary} accessibilityRole="button">
            <Ionicons name="download-outline" size={18} color={colors.white} />
            <Text style={styles.primaryText}>Export a backup</Text>
          </Pressable>

          {pending ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                This backup is from {madeOn} ({pending.rows} entries). Importing replaces everything in this app with
                it.
              </Text>
              <View style={styles.row}>
                <Pressable onPress={() => setPending(undefined)} style={styles.secondary} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={doImport} disabled={busy} style={styles.danger} accessibilityRole="button">
                  <Text style={styles.primaryText}>Replace my calendar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={chooseFile} disabled={busy} style={styles.secondaryWide} accessibilityRole="button">
              <Ionicons name="folder-open-outline" size={18} color={colors.textSoft} />
              <Text style={styles.secondaryText}>Import a backup…</Text>
            </Pressable>
          )}

          {busy && <ActivityIndicator color={colors.accent} />}
          {message && <Text style={message.ok ? styles.ok : styles.error}>{message.text}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const button = { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 } as const;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    gap: 14,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 20, fontFamily: font.heavy, color: colors.text },
  link: { fontSize: 16, color: colors.accent, fontFamily: font.semibold },
  note: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  primary: { ...button, backgroundColor: colors.accent },
  primaryText: { color: colors.white, fontFamily: font.bold, fontSize: 16 },
  secondaryWide: { ...button, backgroundColor: colors.surfaceAlt },
  secondary: { ...button, flex: 1, backgroundColor: colors.surfaceAlt },
  secondaryText: { color: colors.textSoft, fontFamily: font.bold, fontSize: 16 },
  danger: { ...button, flex: 2, backgroundColor: colors.danger },
  confirm: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft },
  confirmText: { fontFamily: font.regular, fontSize: 14, color: colors.text, lineHeight: 20 },
  row: { flexDirection: "row", gap: 8 },
  ok: { fontFamily: font.semibold, fontSize: 14, color: colors.successStrong },
  error: { fontFamily: font.semibold, fontSize: 14, color: colors.danger },
});
