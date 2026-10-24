import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { startBackgroundSharing, stopBackgroundSharing } from "../background/locationTask";

interface Background {
  rideId: string;
  /** Fetches a location-only token for this ride. */
  getToken: () => Promise<string | null>;
  notification: { title: string; body: string };
}

/**
 * GPS while `active` is true, calling `onUpdate` with each fix (the driver only:
 * sharing starts when a ride starts and stops when it ends).
 *
 * The foreground watch always runs. When `background` is given it also tries to
 * keep sharing while the phone is locked or the app is in the background. That
 * needs a development build; in Expo Go it quietly falls back to foreground only
 * and `background` comes back false.
 */
export function useLocationSharing(
  active: boolean,
  onUpdate: (loc: { lat: number; lng: number }) => void,
  background?: Background,
  intervalMs = 5000
) {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [backgroundOn, setBackgroundOn] = useState(false);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  // Always call the latest callback, not the one captured when sharing started.
  const latest = useRef(onUpdate);
  latest.current = onUpdate;
  const bg = useRef(background);
  bg.current = background;
  const rideId = background?.rideId;

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setPermissionGranted(status === "granted");
      if (status !== "granted") return;

      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: 10 },
        (loc) => latest.current({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      );
      if (cancelled) {
        sub.remove();
        return;
      }
      subscription.current = sub;

      const b = bg.current;
      if (b) {
        const token = await b.getToken().catch(() => null);
        if (token && !cancelled) {
          const ok = await startBackgroundSharing(b.rideId, token, b.notification);
          if (!cancelled) setBackgroundOn(ok);
        }
      }
    }

    if (active) void start();

    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
      setBackgroundOn(false);
      void stopBackgroundSharing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rideId]);

  return { permissionGranted, background: backgroundOn };
}
