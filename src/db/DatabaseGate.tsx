// Guards the database on web, where expo-sqlite keeps the file open in a
// background worker and only ONE tab (or window) can
// hold it at a time. A second tab used to fail with "NoModificationAllowedError
// … another open Access Handle" and show a blank page. Now it waits its turn
// with a message, and any open error shows a screen instead of nothing.
import { Component, useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

const LOCK_NAME = "smart-calendar-db";

interface LockManagerLike {
  request(name: string, callback: () => Promise<void>): Promise<void>;
}

/**
 * Resolves once this page holds the database lock, which it then keeps until
 * the page closes (the browser releases it then, so a waiting tab continues by
 * itself). Kept on globalThis so a hot reload of this file doesn't ask again
 * and wait for itself forever.
 */
function acquireLock(): Promise<void> {
  const g = globalThis as { __smartCalendarDbLock?: Promise<void> };
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  if (Platform.OS !== "web" || !locks) return Promise.resolve();
  g.__smartCalendarDbLock ??= new Promise<void>((resolve) => {
    void locks.request(LOCK_NAME, () => {
      resolve();
      return new Promise<void>(() => {}); // never settles: hold the lock
    });
  });
  return g.__smartCalendarDbLock;
}

export function DatabaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"waiting" | "busy" | "ready">("waiting");
  useEffect(() => {
    let cancelled = false;
    // Only say "open elsewhere" if the lock doesn't come almost at once.
    const timer = setTimeout(() => !cancelled && setState((s) => (s === "waiting" ? "busy" : s)), 800);
    void acquireLock().then(() => !cancelled && setState("ready"));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (state === "ready") return <DbErrorBoundary>{children}</DbErrorBoundary>;
  if (state === "waiting") return null;
  return (
    <Message
      title="Smart Calendar is open in another tab"
      body="Close the other tab or window. This page continues by itself as soon as it's free."
    />
  );
}

/** Catches errors thrown while opening the database (SQLiteProvider throws them). */
class DbErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Message
        title="Couldn't open your calendar"
        body={
          "Your data is still saved; nothing was deleted. Close any other tab or window " +
          "with Smart Calendar, then reload. Don't clear the site's data: that would delete it."
        }
        detail={error.message}
        onReload={Platform.OS === "web" ? () => window.location.reload() : undefined}
      />
    );
  }
}

function Message(props: { title: string; body: string; detail?: string; onReload?: () => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.body}>{props.body}</Text>
      {props.onReload && (
        <Pressable style={styles.button} onPress={props.onReload}>
          <Text style={styles.buttonText}>Reload</Text>
        </Pressable>
      )}
      {props.detail && <Text style={styles.detail}>{props.detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#FFFFFF" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827", textAlign: "center" },
  body: { fontSize: 15, color: "#374151", textAlign: "center", maxWidth: 420 },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: "#5B6CF0" },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  detail: { fontSize: 12, color: "#9CA3AF", textAlign: "center", maxWidth: 420 },
});
