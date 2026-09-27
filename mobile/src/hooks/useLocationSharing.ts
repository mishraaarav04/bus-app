import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

/**
 * Starts/stops foreground location polling while `active` is true and calls
 * `onUpdate` with each fix. This is what backs "activate my ride" for both
 * students and drivers — real GPS, no mocking. Background tracking (so it
 * keeps sharing if the phone is locked) needs expo-task-manager and is left
 * as a follow-up, since that setup is more involved than this rudimentary
 * pass needs.
 */
export function useLocationSharing(
  active: boolean,
  onUpdate: (loc: { lat: number; lng: number }) => void,
  intervalMs = 5000
) {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null
  );
  const subscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermissionGranted(status === "granted");
      if (status !== "granted" || !active) return;

      subscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: 10 },
        (loc) => {
          onUpdate({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      );
    }

    if (active) {
      start();
    }

    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { permissionGranted };
}
