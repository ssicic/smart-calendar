import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DatabaseGate } from "./src/db/DatabaseGate";
import { migrate } from "./src/db/weekStore";
import { WeekScreen } from "./src/ui/WeekScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Opens (or creates) the database file, runs migrations, then renders
          the children. Any screen inside can get the db with useSQLiteContext(). */}
      {/* On web, waits until no other tab holds the database, and shows open
          errors on screen instead of a blank page. */}
      <DatabaseGate>
        <SQLiteProvider databaseName="smart-calendar.db" onInit={migrate}>
          <WeekScreen />
        </SQLiteProvider>
      </DatabaseGate>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
