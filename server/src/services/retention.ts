// Housekeeping: delete data we no longer need. How long ride history is kept is
// RETENTION_DAYS (default 365).

import { config } from "../config.js";
import { db } from "../data/db.js";
import { addDays, todayLocal } from "./time.js";

const DAY = 86_400_000;

export function purgeOld(now = Date.now()) {
  const keep = now - config.retentionDays * DAY;
  const run = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args).changes;

  const removed = {
    history: run("DELETE FROM ride_history WHERE ended_at < ?", keep),
    boardings: run("DELETE FROM boarding_events WHERE ended_at < ?", keep),
    incidents: run("DELETE FROM incidents WHERE created_at < ?", keep),
    // The audit log is kept twice as long as ride data.
    audit: run("DELETE FROM audit_log WHERE ts < ?", now - config.retentionDays * 2 * DAY),
    notifications: run("DELETE FROM notifications WHERE created_at < ?", now - 90 * DAY),
    scans: run("DELETE FROM scans WHERE created_at < ?", now - 7 * DAY),
    absences: run("DELETE FROM absences WHERE date < ?", addDays(todayLocal(), -7)),
    tokens: run(
      "DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)",
      now - 7 * DAY,
      now - 7 * DAY
    ),
    codes: run("DELETE FROM email_codes WHERE expires_at < ?", now - DAY),
  };
  return removed;
}

export function startRetentionJob() {
  purgeOld();
  const t = setInterval(() => {
    try {
      purgeOld();
    } catch (e: any) {
      console.error("[wheelie] cleanup failed:", e?.message ?? e);
    }
  }, 6 * 3600_000);
  t.unref?.();
}
