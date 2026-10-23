import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

/**
 * Foreground GPS while `active` is true, calling `onUpdate` with each fix. Used by
 * the driver only: sharing starts when a ride starts and stops when it ends.
 * It does not keep running if the phone locks or the app is closed (that needs
 * background location, which needs a custom dev build rather than Expo Go).
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
  // Always call the latest callback, not the one captured when sharing started.
  const latest = useRef(onUpdate);
  latest.current = onUpdate;

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
          latest.current({ lat: loc.coords.latitude, lng: loc.coords.longitude });
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
