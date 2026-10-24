import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api/client";
import { store } from "./storage";

// Remote push needs a real device. On Android it also needs a development build:
// Expo Go no longer supports remote push there. In those cases we quietly skip it
// (the in-app Alerts tab still works over the live connection).

const TOKEN_KEY = "wheelie.pushToken";

function notificationsModule(): typeof import("expo-notifications") | null {
  if (Platform.OS === "android" && Constants.appOwnership === "expo") return null;
  try {
    // Loaded lazily so a missing/unsupported native module can't crash the app at start.
    return require("expo-notifications");
  } catch {
    return null;
  }
}

let handlerSet = false;

/** Ask permission, get this phone's Expo push token, and tell the server about it. */
export async function registerForPush(): Promise<"ok" | "denied" | "unsupported"> {
  const N = notificationsModule();
  if (!N) return "unsupported";
  try {
    if (!handlerSet) {
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("default", {
        name: "Bus updates",
        importance: N.AndroidImportance.HIGH,
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== "granted") status = (await N.requestPermissionsAsync()).status;
    if (status !== "granted") return "denied";

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.registerPush(data, Platform.OS === "ios" ? "ios" : "android");
    await store.set(TOKEN_KEY, data);
    return "ok";
  } catch {
    return "unsupported";
  }
}

/** Stop pushes to this phone (called on sign-out, before the session ends). */
export async function unregisterPush(): Promise<void> {
  const token = await store.get(TOKEN_KEY);
  if (!token) return;
  try {
    await api.unregisterPush(token);
  } catch {
    /* offline: the server drops dead tokens on its own */
  }
  await store.del(TOKEN_KEY);
}
