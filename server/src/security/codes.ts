// Six-digit codes emailed to a person (password reset, email verification).
// Stored only as a keyed hash, expire after 15 minutes, and lock after 5 wrong tries.

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { db } from "../data/db.js";

export type CodePurpose = "reset" | "verify";
const TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

const hash = (email: string, purpose: string, code: string) =>
  createHmac("sha256", config.jwtSecret).update(`${purpose}:${email}:${code}`).digest("hex");

export function createCode(email: string, purpose: CodePurpose): string {
  const e = email.toLowerCase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = Date.now();
  // Only the newest code works.
  db.prepare("UPDATE email_codes SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL").run(now, e, purpose);
  db.prepare(
    `INSERT INTO email_codes (id, email, purpose, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), e, purpose, hash(e, purpose, code), now, now + TTL_MS);
  return code;
}

/** True once, if the code is right, fresh and not locked. */
export function consumeCode(email: string, purpose: CodePurpose, code: string): boolean {
  const e = email.toLowerCase();
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT id, code_hash, attempts FROM email_codes
       WHERE email = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(e, purpose, now) as { id: string; code_hash: string; attempts: number } | undefined;
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  const given = Buffer.from(hash(e, purpose, code.trim()));
  const want = Buffer.from(row.code_hash);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return false;
  }
  db.prepare("UPDATE email_codes SET used_at = ? WHERE id = ?").run(now, row.id);
  return true;
}
