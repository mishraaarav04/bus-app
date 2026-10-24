import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { AppState } from "react-native";
import { API_BASE_URL } from "../api/client";
import { store } from "../storage";

// Background GPS for the driver. This file must be imported once at app start
// (see App.tsx) so the task is registered even when the app is relaunched in the
// background by the OS.
//
// It posts with a narrow, short-lived "location token" that can do exactly one
// thing: update this one ride's position. The normal sign-in token isn't used
// here, because refreshing it from a headless task could sign the driver out.

export const LOCATION_TASK = "wheelie-bus-location";
const CONFIG_KEY = "wheelie.locTask";

interface TaskConfig {
  rideId: string;
  token: string;
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
  if (error || !data?.locations?.length) return;
  // While the app is on screen the normal foreground path already reports the position.
  if (AppState.currentState === "active") return;
  const cfg = await store.getJson<TaskConfig>(CONFIG_KEY);
  if (!cfg) return;
  const last = data.locations[data.locations.length - 1];
  try {
    const res = await fetch(`${API_BASE_URL}/rides/${cfg.rideId}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ lat: last.coords.latitude, lng: last.coords.longitude }),
    });
    // 401/403: token expired or ride over. 409: ride has ended. Either way, stop.
    if (res.status === 401 || res.status === 403 || res.status === 409) {
      await stopBackgroundSharing();
    }
  } catch {
    /* no signal: the next fix will try again */
  }
});

/**
 * Start sharing while the phone is locked or the app is in the background.
 * Returns false when it can't (permission refused, or running in Expo Go, which
 * doesn't support background location). The caller keeps the foreground watch.
 */
export async function startBackgroundSharing(
  rideId: string,
  token: string,
  notification: { title: string; body: string }
): Promise<boolean> {
  try {
    const perm = await Location.requestBackgroundPermissionsAsync();
    if (perm.status !== "granted") return false;
    await store.setJson(CONFIG_KEY, { rideId, token } satisfies TaskConfig);
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: notification.title,
        notificationBody: notification.body,
        notificationColor: "#FF7A1A",
      },
    });
    return true;
  } catch {
    await store.del(CONFIG_KEY);
    return false;
  }
}

export async function stopBackgroundSharing(): Promise<void> {
  await store.del(CONFIG_KEY);
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    /* not running */
  }
}
