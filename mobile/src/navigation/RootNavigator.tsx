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
import { Logo } from "../components/Logo";
import { colors } from "../theme";
import type { Role } from "../types";

const Tab = createBottomTabNavigator();

type Icon = keyof typeof Ionicons.glyphMap;
interface TabDef {
  name: string;
  component: React.ComponentType;
  icon: Icon;
}

// Each account type gets only its own screens - no shared "see everything" view.
const TABS: Record<Role, TabDef[]> = {
  student: [
    { name: "Bus", component: StudentHomeScreen, icon: "bus" },
    { name: "Account", component: AccountTab, icon: "person-circle" },
  ],
  parent: [
    { name: "Bus", component: ParentHomeScreen, icon: "location" },
    { name: "Account", component: AccountTab, icon: "person-circle" },
  ],
  driver: [
    { name: "Drive", component: DriverHomeScreen, icon: "bus" },
    { name: "Account", component: AccountTab, icon: "person-circle" },
  ],
  admin: [
    { name: "Buses", component: AdminDashboardScreen, icon: "radio" },
    { name: "Students", component: SchoolStudentsScreen, icon: "people" },
    { name: "Account", component: AccountTab, icon: "person-circle" },
  ],
  company: [
    { name: "Routes", component: CompanyRoutesScreen, icon: "git-network" },
    { name: "Team", component: CompanyTeamScreen, icon: "business" },
    { name: "Account", component: AccountTab, icon: "person-circle" },
  ],
};

export function RootNavigator() {
  const { user, loading } = useAuth();

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
          tabBarLabelStyle: { fontWeight: "700", fontSize: 12 },
          tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.white, height: 64, paddingBottom: 8, paddingTop: 6 },
          tabBarIcon: ({ color, size }) => {
            const def = tabs.find((t) => t.name === route.name);
            return <Ionicons name={def?.icon ?? "ellipse"} size={size} color={color} />;
          },
        })}
      >
        {tabs.map((t) => (
          <Tab.Screen key={t.name} name={t.name} component={t.component} />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
