// Users, routes and live rides: held in memory (fast, simple code) and written
// through to SQLite so nothing is lost on restart.
//
// Callers keep using them like plain Maps and mutate objects in place. Saving
// works by noticing changes: shortly after any request or socket event (and at
// least every few seconds) every record is compared to what was last written
// and only the changed ones are saved, all inside one transaction.
// Everything else (history, tokens, alerts...) is plain SQL in repo.ts.

import type { Statement } from "better-sqlite3";
import { db } from "./db.js";
import type { RideSession, Route, User } from "../types.js";

class Table<T extends { id: string }> extends Map<string, T> {
  private saved = new Map<string, string>(); // id -> JSON last written
  private upsert: Statement;
  private remove: Statement;

  constructor(
    private name: string,
    // Extra columns written alongside the JSON document (e.g. users.email).
    private extra: (v: T) => unknown[] = () => [],
    private extraCols: string[] = []
  ) {
    super();
    const cols = ["id", ...extraCols, "data"];
    const updates = [...extraCols, "data"].map((c) => `${c} = excluded.${c}`).join(", ");
    this.upsert = db.prepare(
      `INSERT INTO ${name} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
       ON CONFLICT(id) DO UPDATE SET ${updates}`
    );
    this.remove = db.prepare(`DELETE FROM ${name} WHERE id = ?`);

    for (const row of db.prepare(`SELECT id, data FROM ${name}`).all() as { id: string; data: string }[]) {
      super.set(row.id, JSON.parse(row.data) as T);
      this.saved.set(row.id, row.data);
    }
  }

  /** Write every changed record, and delete rows whose record is gone. */
  flush() {
    for (const [id, value] of this) {
      const json = JSON.stringify(value);
      if (this.saved.get(id) === json) continue;
      this.upsert.run(id, ...this.extra(value), json);
      this.saved.set(id, json);
    }
    for (const id of [...this.saved.keys()]) {
      if (!this.has(id)) {
        this.remove.run(id);
        this.saved.delete(id);
      }
    }
  }
}

export const users = new Table<User>("users", (u) => [u.email], ["email"]);
export const routes = new Table<Route>("routes");
// Only live and just-finished rides are kept here. A finished ride's permanent
// record is written to the ride_history / boarding_events tables.
export const rideSessions = new Table<RideSession>("ride_sessions");

const tables = [users, routes, rideSessions];

export function flushNow() {
  try {
    db.transaction(() => {
      for (const t of tables) t.flush();
    })();
  } catch (e: any) {
    console.error("[wheelie] couldn't save to the database:", e?.message ?? e);
  }
}

let timer: NodeJS.Timeout | null = null;
/** Save soon (debounced). Called after every request and socket event. */
export function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushNow();
  }, 250);
  timer.unref?.();
}

const interval = setInterval(flushNow, 5000);
interval.unref?.();

export function findUserByEmail(email: string): User | undefined {
  const e = email.trim().toLowerCase();
  for (const u of users.values()) if (u.email === e) return u;
  return undefined;
}

export function findByCode(
  field: "driverCode" | "studentCode" | "linkCode",
  code: string
): User | undefined {
  const c = code.trim().toUpperCase();
  for (const u of users.values()) if (u[field]?.toUpperCase() === c) return u;
  return undefined;
}

export function findStudentByTag(tagId: string): User | undefined {
  for (const u of users.values()) {
    if (u.role === "student" && u.tagId && u.tagId === tagId) return u;
  }
  return undefined;
}
