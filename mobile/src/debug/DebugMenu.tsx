import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL, api } from "../api/client";
import { AccountTab } from "../components/AccountTab";
import { BoardingPass } from "../components/BoardingPass";
import { FamilyTools } from "../components/FamilyTools";
import { Button, Card, ErrorText, Pill, Row } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { AdminDashboardScreen } from "../screens/admin/AdminDashboardScreen";
import { RosterImport } from "../screens/admin/RosterImport";
import { SchoolStudentsScreen } from "../screens/admin/SchoolStudentsScreen";
import { CompanyRoutesScreen } from "../screens/company/CompanyRoutesScreen";
import { CompanyTeamScreen } from "../screens/company/CompanyTeamScreen";
import { RouteBuilder } from "../screens/company/RouteBuilder";
import { DriverHomeScreen } from "../screens/driver/DriverHomeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { ParentHomeScreen } from "../screens/parent/ParentHomeScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { AlertsScreen } from "../screens/shared/AlertsScreen";
import { StudentHomeScreen } from "../screens/student/StudentHomeScreen";
import { colors, font, radius } from "../theme";
import type { CompanyOverview } from "../types";

/**
 * DEVELOPMENT ONLY (App.tsx renders this only when __DEV__ is true, so it is
 * never part of a production build).
 *
 * A small tab on the left edge opens a list of every screen so you can look at
 * any of them without signing in as that kind of account. It does not touch the
 * real navigation: the app's tabs and screens work exactly as before, and each
 * debug screen opens in its own overlay.
 *
 * Screens call the real server, so one opened under the wrong account will show
 * "not allowed" or empty data. Use "Sign in as" to switch to a demo account
 * (the server creates them in development; password for all is below).
 */

const DEMO_PASSWORD = "Wheelie!Demo1";
const DEMO_ACCOUNTS = [
  { label: "Student (Sam)", email: "student@wheelie.demo" },
  { label: "Student 2 (Ava)", email: "student2@wheelie.demo" },
  { label: "Parent", email: "parent@wheelie.demo" },
  { label: "Driver", email: "driver@wheelie.demo" },
  { label: "Driver 2", email: "driver2@wheelie.demo" },
  { label: "School", email: "school@wheelie.demo" },
  { label: "Company", email: "company@wheelie.demo" },
];

const Single = createBottomTabNavigator();

// Screens that need data passed in get a small wrapper that loads it.
function RouteBuilderDebug({ close }: { close: () => void }) {
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.companyOverview().then(setOverview).catch((e) => setError(e.message));
  }, []);
  if (overview) return <RouteBuilder overview={overview} onClose={close} onChanged={() => {}} />;
  return (
    <SafeAreaView style={{ flex: 1, padding: 20 }}>
      <ErrorText text={error ?? "Loading..."} />
      {error ? <Text style={font.small}>Sign in as the Company account to load this screen's data.</Text> : null}
    </SafeAreaView>
  );
}

function PlanAheadDebug({ close }: { close: () => void }) {
  const { user } = useAuth();
  const [kids, setKids] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (user?.role === "student") setKids([{ id: user.id, name: user.name }]);
    else api.parentChildren().then((c) => setKids(c.map((k) => ({ id: k.id, name: k.name })))).catch(() => {});
  }, [user]);
  return <FamilyTools visible onClose={close} kids={kids.length ? kids : [{ id: "00000000-0000-4000-8000-000000000000", name: "Sample Child" }]} />;
}

function BoardingPassDebug() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, justifyContent: "center", padding: 20 }}>
      <BoardingPass />
    </SafeAreaView>
  );
}

interface Entry {
  group: string;
  title: string;
  hint?: string;
  render: (close: () => void) => React.ReactNode;
}

const ENTRIES: Entry[] = [
  { group: "Sign in & sign up", title: "Sign in", render: () => <LoginScreen initialMode="login" /> },
  { group: "Sign in & sign up", title: "Create account (pick a role)", render: () => <LoginScreen initialMode="signup" /> },
  { group: "Sign in & sign up", title: "Forgot password", render: () => <LoginScreen initialMode="forgot" /> },

  { group: "Student", title: "Bus (map, ETA, status)", hint: "Student tab 'Bus'", render: () => <StudentHomeScreen /> },
  { group: "Student", title: "Boarding code (QR)", hint: "Needs a student account", render: () => <BoardingPassDebug /> },
  { group: "Student", title: "Plan ahead & ride history", render: (c) => <PlanAheadDebug close={c} /> },

  { group: "Parent", title: "Bus (map, ETA, status)", hint: "Parent tab 'Bus'", render: () => <ParentHomeScreen /> },
  { group: "Parent", title: "Plan ahead & ride history", render: (c) => <PlanAheadDebug close={c} /> },

  { group: "Driver", title: "Drive (routes / live ride)", render: () => <DriverHomeScreen /> },
  { group: "Driver", title: "Drive + QR scanner open", render: () => <DriverHomeScreen debugOpen="scanner" /> },
  { group: "Driver", title: "Drive + Report a problem open", render: () => <DriverHomeScreen debugOpen="problem" /> },
  { group: "Driver", title: "Drive + drop-off hand-off open", render: () => <DriverHomeScreen debugOpen="handoff" /> },

  { group: "School", title: "Buses (live dashboard)", render: () => <AdminDashboardScreen /> },
  { group: "School", title: "Students", render: () => <SchoolStudentsScreen /> },
  { group: "School", title: "Import students (CSV)", render: (c) => <RosterImport visible onClose={c} onImported={() => {}} /> },
  { group: "School", title: "Reports", render: () => <ReportsScreen /> },

  { group: "Bus company", title: "Routes", render: () => <CompanyRoutesScreen /> },
  { group: "Bus company", title: "New route builder", render: (c) => <RouteBuilderDebug close={c} /> },
  { group: "Bus company", title: "Team (schools, drivers, bus size)", render: () => <CompanyTeamScreen /> },
  { group: "Bus company", title: "Reports", render: () => <ReportsScreen /> },

  { group: "Everyone", title: "Alerts (inbox)", render: () => <AlertsScreen /> },
  { group: "Everyone", title: "Account", render: () => <AccountTab /> },
];

export function DebugMenu() {
  const insets = useSafeAreaInsets();
  const { user, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Entry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setActive(null);
  };

  async function switchTo(email: string) {
    setBusy(email);
    setError(null);
    try {
      if (user) await signOut();
      await signIn(email, DEMO_PASSWORD);
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const groups = [...new Set(ENTRIES.map((e) => e.group))];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open debug menu"
        style={{
          position: "absolute",
          left: 0,
          top: "42%",
          width: 30,
          height: 46,
          borderTopRightRadius: radius.md,
          borderBottomRightRadius: radius.md,
          backgroundColor: "rgba(35,26,20,0.55)",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
      >
        <Ionicons name="bug" size={18} color="#fff" />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => (active ? setActive(null) : close())}>
        {active ? (
          <View style={{ flex: 1, backgroundColor: colors.white }}>
            <View
              style={{
                paddingTop: insets.top + 4,
                paddingBottom: 8,
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.ink,
              }}
            >
              <Pressable onPress={() => setActive(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to debug menu">
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
              <Text style={{ color: "#fff", fontWeight: "800", flex: 1 }} numberOfLines={1}>
                {active.group}: {active.title}
              </Text>
              <Pill text={user ? user.role : "signed out"} tone="orange" />
            </View>
            {/* Its own navigation context, so screens that use navigation hooks work here
                without touching the app's real navigator. */}
            <View style={{ flex: 1 }}>
              <NavigationContainer>
                <Single.Navigator screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
                  <Single.Screen name="DebugScreen">{() => <>{active.render(() => setActive(null))}</>}</Single.Screen>
                </Single.Navigator>
              </NavigationContainer>
            </View>
          </View>
        ) : (
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={font.title}>Debug menu</Text>
                <Button title="Close" variant="soft" onPress={close} style={{ minHeight: 40 }} />
              </Row>
              <Text style={font.small}>
                Development builds only. Screens use the real server, so pick the matching account first.
              </Text>

              <Card>
                <Text style={font.small}>Server: {API_BASE_URL}</Text>
                <Text style={font.h3}>{user ? `Signed in: ${user.name} (${user.role})` : "Not signed in"}</Text>
                <Text style={font.small}>Sign in as a demo account (password {DEMO_PASSWORD}):</Text>
                <Row style={{ flexWrap: "wrap", gap: 8 }}>
                  {DEMO_ACCOUNTS.map((a) => (
                    <Pressable key={a.email} onPress={() => switchTo(a.email)} disabled={!!busy} accessibilityRole="button">
                      <Pill text={busy === a.email ? "..." : a.label} tone={user?.email === a.email ? "green" : "gray"} />
                    </Pressable>
                  ))}
                </Row>
                {user ? <Button title="Sign out" variant="outline" onPress={() => void signOut()} /> : null}
                <ErrorText text={error} />
              </Card>

              {groups.map((g) => (
                <View key={g} style={{ gap: 8 }}>
                  <Text style={[font.h3, { marginTop: 6 }]}>{g}</Text>
                  {ENTRIES.filter((e) => e.group === g).map((e) => (
                    <Pressable key={`${g}-${e.title}`} onPress={() => setActive(e)} accessibilityRole="button">
                      <Card style={{ paddingVertical: 12 }}>
                        <Row>
                          <View style={{ flex: 1 }}>
                            <Text style={font.body}>{e.title}</Text>
                            {e.hint ? <Text style={font.small}>{e.hint}</Text> : null}
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                        </Row>
                      </Card>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </>
  );
}
