import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { StudentHomeScreen } from "../screens/student/StudentHomeScreen";
import { ParentHomeScreen } from "../screens/parent/ParentHomeScreen";
import { DriverHomeScreen } from "../screens/driver/DriverHomeScreen";
import { AdminDashboardScreen } from "../screens/admin/AdminDashboardScreen";
import { ChatScreen } from "../screens/ChatScreen";

const Stack = createNativeStackNavigator();

/**
 * Role-gated navigation: which "Home" screen you land on depends entirely
 * on `user.role`. There's no shared "everyone sees everything" screen —
 * each role only gets the actions the earlier plan scoped to it (e.g.
 * parents never see an "activate ride" button).
 */
export function RootNavigator() {
  const { user } = useAuth();
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  if (!user) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user.role === "student" && (
          <Stack.Screen name="Home" options={{ title: "Bus App" }}>
            {() => <StudentHomeScreen rideId={activeRideId} />}
          </Stack.Screen>
        )}
        {user.role === "parent" && (
          <Stack.Screen name="Home" options={{ title: "Bus App" }}>
            {() => <ParentHomeScreen rideId={activeRideId} />}
          </Stack.Screen>
        )}
        {user.role === "driver" && (
          <Stack.Screen name="Home" options={{ title: "Bus App" }}>
            {() => (
              <DriverHomeScreen
                rideId={activeRideId}
                onRideStarted={setActiveRideId}
              />
            )}
          </Stack.Screen>
        )}
        {user.role === "admin" && (
          <Stack.Screen
            name="Home"
            component={AdminDashboardScreen}
            options={{ title: "Admin" }}
          />
        )}
        <Stack.Screen name="Chat" options={{ title: "Chat" }}>
          {() => <ChatScreen conversationId="demo-conversation" />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
