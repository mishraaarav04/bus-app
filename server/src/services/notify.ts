// Alerts to people: saved to their in-app inbox, pushed live over the socket,
// and sent as a phone push notification through Expo.

import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { db } from "../data/db.js";
import { users } from "../data/store.js";
import { DEFAULT_PREFS } from "../types.js";
import type { AppNotification, NotifPrefs } from "../types.js";
import { formatClock, tr } from "./i18n.js";
import { getIo } from "./rideBroadcast.js";

/** Which preference switch controls each kind of alert. Null = always sent. */
const GROUP: Record<string, keyof NotifPrefs | null> = {
  ride_started: "approaching",
  approaching: "approaching",
  boarded: "boarding",
  missed: "boarding",
  arrived: "boarding",
  dropped: "boarding",
  delay: "delays",
  delay_forecast: "delays",
  announcement: null, // a message from the school or bus company
  breakdown: "delays",
  accident: "delays",
  other: "delays",
  resolved: "delays",
  not_riding: null, // safety-relevant: always sent
  absence_planned: null,
  off_route: null,
  stopped: null,
  assigned: null,
  removed: null,
};

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}
/** In tests, pushes are recorded here instead of being sent. */
export const pushLog: PushMessage[] = [];

export interface NotifySpec {
  kind: string; // also selects the text: "<kind>_t" / "<kind>_b" in i18n
  params?: Record<string, string | number>;
  bodyKey?: string; // use a different "<bodyKey>" instead of "<kind>_b"
  data?: Record<string, unknown>;
  // ISO time to show as {time}, formatted in each person's own language.
  at?: string;
  // Staff-written text, by language. Used instead of the built-in wording (English is the fallback).
  text?: Record<string, { title: string; body: string }> & { en: { title: string; body: string } };
}

const insert = db.prepare(
  `INSERT INTO notifications (id, user_id, kind, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const tokensFor = db.prepare("SELECT token FROM push_tokens WHERE user_id = ?");

export function notifyUsers(userIds: Iterable<string>, spec: NotifySpec): void {
  const toPush: PushMessage[] = [];
  for (const id of new Set(userIds)) {
    const user = users.get(id);
    if (!user) continue;
    const group = GROUP[spec.kind] ?? null;
    if (group && ((user.notifPrefs ?? DEFAULT_PREFS)[group] ?? true) === false) continue;

    const params: Record<string, string | number> = { ...(spec.params ?? {}) };
    if (spec.at) params.time = formatClock(spec.at, user.lang, config.timezone);
    const custom = spec.text ? (spec.text[user.lang as string] ?? spec.text.en) : null;
    const title = custom ? custom.title : tr(user.lang, `${spec.kind}_t`, params);
    const body = custom ? custom.body : tr(user.lang, spec.bodyKey ?? `${spec.kind}_b`, params);
    const data = { kind: spec.kind, ...(spec.data ?? {}) };
    const notif: AppNotification = {
      id: randomUUID(),
      kind: spec.kind,
      title,
      body,
      data,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    insert.run(notif.id, id, notif.kind, title, body, JSON.stringify(data), Date.now());
    getIo()?.to(`user:${id}`).emit("notification:new", notif);

    for (const t of tokensFor.all(id) as { token: string }[]) {
      toPush.push({ to: t.token, title, body, data });
    }
  }
  if (toPush.length) void sendPushes(toPush);
}

async function sendPushes(messages: PushMessage[]) {
  if (config.isTest) {
    pushLog.push(...messages);
    return;
  }
  // Expo accepts up to 100 per request.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(config.expoAccessToken ? { Authorization: `Bearer ${config.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((m) => ({ ...m, sound: "default", priority: "high", channelId: "default" }))
        ),
      });
      const json: any = await res.json().catch(() => null);
      // Phones that uninstalled the app: stop sending to them.
      (json?.data ?? []).forEach((ticket: any, idx: number) => {
        if (ticket?.details?.error === "DeviceNotRegistered") {
          db.prepare("DELETE FROM push_tokens WHERE token = ?").run(batch[idx].to);
        }
      });
    } catch (e: any) {
      console.error("[wheelie] push failed:", e?.message ?? e);
    }
  }
}

// ---- inbox ------------------------------------------------------------------

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: string;
  created_at: number;
  read_at: number | null;
}

export function listNotifications(userId: string, limit = 50): { items: AppNotification[]; unread: number } {
  const rows = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as Row[];
  const unread = (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId) as { n: number }).n;
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      data: JSON.parse(r.data),
      createdAt: new Date(r.created_at).toISOString(),
      readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    })),
  };
}

export function markAllRead(userId: string) {
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(Date.now(), userId);
}
