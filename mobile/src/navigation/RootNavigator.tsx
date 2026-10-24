import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { StudentHomeScreen } from "../screens/student/StudentHomeScreen";
import { ParentHomeScreen } from "../screens/parent/ParentHomeScreen";
import { DriverHomeScreen } from "../screens/driver/DriverHomeScreen";
import { AdminDashboardScreen } from "../screens/admin/AdminDashboardScreen";
import { SchoolStudentsScreen } from "../screens/admin/SchoolStudentsScreen";
import { CompanyRoutesScreen } from "../screens/company/CompanyRoutesScreen";
import { CompanyTeamScreen } from "../screens/company/CompanyTeamScreen";
import { AccountTab } from "../components/AccountTab";
import { useAlertsBadge } from "../context/AlertsContext";
import { useT, type Key } from "../i18n";
import { AlertsScreen } from "../screens/shared/AlertsScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { Logo } from "../components/Logo";
import { colors } from "../theme";
import type { Role } from "../types";

const Tab = createBottomTabNavigator();

type Icon = keyof typeof Ionicons.glyphMap;
interface TabDef {
  name: string;
  label: Key;
  component: React.ComponentType;
  icon: Icon;
}

const ALERTS: TabDef = { name: "Alerts", label: "tab.alerts", component: AlertsScreen, icon: "notifications" };
const ACCOUNT: TabDef = { name: "Account", label: "tab.account", component: AccountTab, icon: "person-circle" };
const REPORTS: TabDef = { name: "Reports", label: "tab.reports", component: ReportsScreen, icon: "stats-chart" };

// Each account type gets only its own screens - no shared "see everything" view.
const TABS: Record<Role, TabDef[]> = {
  student: [{ name: "Bus", label: "tab.bus", component: StudentHomeScreen, icon: "bus" }, ALERTS, ACCOUNT],
  parent: [{ name: "Bus", label: "tab.bus", component: ParentHomeScreen, icon: "location" }, ALERTS, ACCOUNT],
  driver: [{ name: "Drive", label: "tab.drive", component: DriverHomeScreen, icon: "bus" }, ALERTS, ACCOUNT],
  admin: [
    { name: "Buses", label: "tab.buses", component: AdminDashboardScreen, icon: "radio" },
    { name: "Students", label: "tab.students", component: SchoolStudentsScreen, icon: "people" },
    REPORTS,
    ALERTS,
    ACCOUNT,
  ],
  company: [
    { name: "Routes", label: "tab.routes", component: CompanyRoutesScreen, icon: "git-network" },
    { name: "Team", label: "tab.team", component: CompanyTeamScreen, icon: "business" },
    REPORTS,
    ALERTS,
    ACCOUNT,
  ],
};

export function RootNavigator() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const { unread } = useAlertsBadge();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white }}>
        <Logo />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }
  if (!user) return <LoginScreen />;

  const tabs = TABS[user.role];
  return (
    <NavigationContainer>
      <Tab.Navigator
        // Remount per account so nothing carries over between sign-ins.
        key={user.id}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: "#A89A8E",
          tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
          tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.white, height: 64, paddingBottom: 8, paddingTop: 6 },
          tabBarIcon: ({ color, size }) => {
            const def = tabs.find((d) => d.name === route.name);
            return <Ionicons name={def?.icon ?? "ellipse"} size={size} color={color} />;
          },
        })}
      >
        {tabs.map((def) => (
          <Tab.Screen
            key={def.name}
            name={def.name}
            component={def.component}
            options={{
              title: t(def.label),
              tabBarAccessibilityLabel: t(def.label),
              tabBarBadge: def.name === "Alerts" && unread > 0 ? unread : undefined,
            }}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
