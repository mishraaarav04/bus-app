// Refresh tokens: long-lived, random, stored only as a hash, and swapped for a
// new one every time they're used. If an old (already used) token shows up
// again it was probably copied, so the whole chain is revoked.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "../config.js";
import { db } from "../data/db.js";
import { users } from "../data/store.js";
import type { User } from "../types.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const GRACE_MS = 10_000; // two requests racing with the same token is not theft
// Marks a token as dead for good (sign-out, password change, theft). Only a token
// that was just swapped for a new one gets a real timestamp and the grace window.
const KILLED = 1;

interface Row {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: number;
  revoked_at: number | null;
}

export function issueRefreshToken(userId: string, familyId: string = randomUUID()): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), userId, familyId, sha(token), now, now + config.refreshTokenTtlDays * 86_400_000);
  return token;
}

/** Trade a refresh token for a new one. Null means "sign in again". */
export function rotateRefreshToken(token: string): { user: User; refreshToken: string } | null {
  const now = Date.now();
  const row = db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(sha(token)) as Row | undefined;
  if (!row || row.expires_at < now) return null;

  if (row.revoked_at !== null) {
    if (now - row.revoked_at > GRACE_MS) {
      db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL").run(
        KILLED,
        row.family_id
      );
      return null;
    }
  } else {
    db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?").run(now, row.id);
  }

  const user = users.get(row.user_id);
  if (!user) return null;
  return { user, refreshToken: issueRefreshToken(user.id, row.family_id) };
}

/** Sign out one device. */
export function revokeRefreshToken(token: string) {
  db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").run(
    KILLED,
    sha(token)
  );
}

/** Sign out everywhere (password change/reset, account deletion). */
export function revokeAllRefreshTokens(userId: string) {
  db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(KILLED, userId);
}

/** Invalidate the user's current access tokens and refresh tokens. */
export function revokeAllSessions(user: User) {
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  revokeAllRefreshTokens(user.id);
}
