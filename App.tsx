import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/nunito";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";
import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DatabaseGate } from "./src/db/DatabaseGate";
import { migrate } from "./src/db/weekStore";
import { colors } from "./src/ui/theme";
import { WeekScreen } from "./src/ui/WeekScreen";

export default function App() {
  // Bumped after importing a backup: a new key makes React build the whole
  // screen again, so every view reloads from the replaced database.
  const [generation, setGeneration] = useState(0);
  // The app's font (Nunito). Until it's loaded, show the background only, so
  // text doesn't flash in another font first. If loading fails, carry on
  // with the system font.
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      {/* Opens (or creates) the database file, runs migrations, then renders
          the children. Any screen inside can get the db with useSQLiteContext(). */}
      {/* On web, waits until no other tab holds the database, and shows open
          errors on screen instead of a blank page. */}
      <DatabaseGate>
        <SQLiteProvider databaseName="smart-calendar.db" onInit={migrate}>
          <WeekScreen key={generation} onDataReplaced={() => setGeneration((g) => g + 1)} />
        </SQLiteProvider>
      </DatabaseGate>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
