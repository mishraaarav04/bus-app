import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
// Registers the background-location task. Must be imported at the top level so it
// exists even when the OS wakes the app in the background.
import "./src/background/locationTask";
import { AlertsProvider } from "./src/context/AlertsContext";
import { AuthProvider } from "./src/context/AuthContext";
import { DebugMenu } from "./src/debug/DebugMenu";
import { I18nProvider } from "./src/i18n";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <I18nProvider>
          <AlertsProvider>
            <StatusBar style="dark" />
            <RootNavigator />
            {/* Development builds only: a shortcut to every screen for testing. */}
            {__DEV__ ? <DebugMenu /> : null}
          </AlertsProvider>
        </I18nProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
