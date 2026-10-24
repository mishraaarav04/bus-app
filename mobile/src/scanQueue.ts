import { api, ApiError } from "./api/client";
import { store } from "./storage";
import type { CheckinResult } from "./types";

// Boarding scans survive a dead zone: if the phone can't reach the server, the
// scan is saved (with the time it happened and a unique id) and sent later. The
// server counts a scan once even if it arrives twice, and accepts it as long as
// the QR code was valid at the moment it was scanned.

const INDEX_KEY = "wheelie.scanq";
const itemKey = (id: string) => `wheelie.scan.${id}`;

interface Queued {
  scanId: string;
  rideId: string;
  token?: string;
  tagId?: string;
  scannedAt: string;
}

export type ScanOutcome = { kind: "sent"; result: CheckinResult } | { kind: "queued" };

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

async function index(): Promise<string[]> {
  return (await store.getJson<string[]>(INDEX_KEY)) ?? [];
}

async function enqueue(item: Queued) {
  await store.setJson(itemKey(item.scanId), item);
  await store.setJson(INDEX_KEY, [...(await index()), item.scanId]);
}

async function remove(id: string) {
  await store.del(itemKey(id));
  await store.setJson(INDEX_KEY, (await index()).filter((x) => x !== id));
}

/** Send a scan now, or queue it when there is no connection. Throws if the server rejects it. */
export async function submitScan(rideId: string, input: { token?: string; tagId?: string }): Promise<ScanOutcome> {
  const item: Queued = { scanId: newId(), rideId, scannedAt: new Date().toISOString(), ...input };
  try {
    const result = await api.checkin(rideId, {
      token: item.token,
      tagId: item.tagId,
      scanId: item.scanId,
      scannedAt: item.scannedAt,
    });
    return { kind: "sent", result };
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      await enqueue(item);
      return { kind: "queued" };
    }
    throw e;
  }
}

export async function pendingScans(): Promise<number> {
  return (await index()).length;
}

/** Try to send everything that was saved offline. Returns how many went through. */
export async function flushScans(): Promise<number> {
  let sent = 0;
  for (const id of await index()) {
    const item = await store.getJson<Queued>(itemKey(id));
    if (!item) {
      await remove(id);
      continue;
    }
    try {
      await api.checkin(item.rideId, {
        token: item.token,
        tagId: item.tagId,
        scanId: item.scanId,
        scannedAt: item.scannedAt,
      });
      sent++;
      await remove(id);
    } catch (e) {
      // Still offline or a server error: keep it and stop. Anything the server
      // rejected outright (ride ended, code expired) will never succeed: drop it.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) {
        await remove(id);
      } else {
        break;
      }
    }
  }
  return sent;
}
