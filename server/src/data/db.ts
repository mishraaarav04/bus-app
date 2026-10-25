// SQLite database (better-sqlite3). One file, no server to run.
//
// How data is stored:
//  - users, routes and live ride sessions are kept in memory for speed and
//    written through to the `users` / `routes` / `ride_sessions` tables as JSON
//    documents (see store.ts). They are loaded back when the server starts.
//  - everything that grows over time or needs querying (history, alerts,
//    tokens, audit log, absences...) lives in real relational tables below.
//
// To add a column or table later, append a new entry to MIGRATIONS. Never edit
// an old one: databases that already ran it won't run it again.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
  CREATE TABLE routes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE ride_sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);

  CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
  CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);

  CREATE TABLE email_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at INTEGER
  );
  CREATE INDEX idx_codes_email ON email_codes(email, purpose);

  CREATE TABLE push_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_push_user ON push_tokens(user_id);

  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER
  );
  CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

  CREATE TABLE incidents (
    id TEXT PRIMARY KEY,
    ride_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    company_id TEXT,
    school_id TEXT,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    delay_minutes INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
  CREATE INDEX idx_incidents_ride ON incidents(ride_id);

  CREATE TABLE absences (
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    direction TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (student_id, date, direction)
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    actor_id TEXT,
    actor_role TEXT,
    actor_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    company_id TEXT,
    school_id TEXT,
    meta TEXT,
    ip TEXT
  );
  CREATE INDEX idx_audit_company ON audit_log(company_id, ts DESC);
  CREATE INDEX idx_audit_school ON audit_log(school_id, ts DESC);

  CREATE TABLE ride_history (
    ride_id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    route_name TEXT NOT NULL,
    school_id TEXT,
    company_id TEXT,
    driver_id TEXT,
    driver_name TEXT,
    direction TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    scheduled_start TEXT,
    late_start_min INTEGER,
    stops_total INTEGER NOT NULL,
    stops_skipped INTEGER NOT NULL,
    riders INTEGER NOT NULL,
    boarded INTEGER NOT NULL,
    missed INTEGER NOT NULL,
    skipped INTEGER NOT NULL,
    dropped INTEGER NOT NULL,
    incidents INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_hist_company ON ride_history(company_id, ended_at DESC);
  CREATE INDEX idx_hist_school ON ride_history(school_id, ended_at DESC);

  CREATE TABLE boarding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ride_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    route_id TEXT NOT NULL,
    route_name TEXT NOT NULL,
    school_id TEXT,
    company_id TEXT,
    direction TEXT NOT NULL,
    local_date TEXT NOT NULL,
    stop_name TEXT,
    status TEXT NOT NULL,
    boarded_at INTEGER,
    dropped_at INTEGER,
    handed_to TEXT,
    ended_at INTEGER NOT NULL
  );
  CREATE INDEX idx_board_ride ON boarding_events(ride_id);
  CREATE INDEX idx_board_student ON boarding_events(student_id, ended_at DESC);
  CREATE INDEX idx_board_school ON boarding_events(school_id, ended_at DESC);
  CREATE INDEX idx_board_company ON boarding_events(company_id, ended_at DESC);

  CREATE TABLE scans (
    ride_id TEXT NOT NULL,
    scan_id TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (ride_id, scan_id)
  );
  `,
  // 2: what the buses actually do (learned ETAs) and how good the predictions were
  `
  CREATE TABLE stop_times (
    ride_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    from_stop_id TEXT NOT NULL,
    to_stop_id TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    local_date TEXT NOT NULL,
    leg_sec INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (ride_id, to_stop_id)
  );
  CREATE INDEX idx_stoptimes_leg ON stop_times(route_id, from_stop_id, to_stop_id, created_at DESC);

  CREATE TABLE eta_probes (
    ride_id TEXT NOT NULL,
    stop_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    company_id TEXT,
    school_id TEXT,
    predicted_sec INTEGER NOT NULL,
    baseline_sec INTEGER NOT NULL,
    actual_sec INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (ride_id, stop_id)
  );
  CREATE INDEX idx_probes_company ON eta_probes(company_id, created_at DESC);
  CREATE INDEX idx_probes_school ON eta_probes(school_id, created_at DESC);
  `,
];

function open(): Database.Database {
  if (config.dbPath !== ":memory:") mkdirSync(dirname(config.dbPath), { recursive: true });
  const d = new Database(config.dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
  d.pragma("busy_timeout = 5000");

  const current = d.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    d.transaction(() => {
      d.exec(MIGRATIONS[v]);
      d.pragma(`user_version = ${v + 1}`);
    })();
  }
  return d;
}

export const db = open();

export function getMeta(key: string): string | undefined {
  return (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}
export function setMeta(key: string, value: string) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value
  );
}

// Dev convenience: keep one generated JWT secret in the database so everyone
// stays signed in across restarts. Production must set JWT_SECRET itself.
if (!config.jwtSecretIsExplicit && !config.isProd && !config.isTest) {
  const saved = getMeta("dev_jwt_secret");
  if (saved) config.jwtSecret = saved;
  else setMeta("dev_jwt_secret", config.jwtSecret);
} else if (!config.jwtSecretIsExplicit && !config.isTest) {
  console.warn("[wheelie] JWT_SECRET not set - using a random one for this run.");
}

export function closeDb() {
  db.close();
}