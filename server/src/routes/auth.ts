import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { db } from "../data/db.js";
import { findByCode, findUserByEmail, rideSessions, routes, users } from "../data/store.js";
import {
  DUMMY_HASH,
  hashPassword,
  makeCode,
  requireAuth,
  requireRole,
  signAccessToken,
  toPublicUser,
  verifyPassword,
} from "../security/auth.js";
import { consumeCode, createCode } from "../security/codes.js";
import {
  issueRefreshToken,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../security/sessions.js";
import {
  changePasswordSchema,
  childSettingsSchema,
  deleteAccountSchema,
  forgotSchema,
  linkChildSchema,
  loginSchema,
  logoutSchema,
  prefsSchema,
  refreshSchema,
  resetSchema,
  signupSchema,
  verifyEmailSchema,
} from "../schemas.js";
import { audit } from "../services/audit.js";
import { sendEmail } from "../services/email.js";
import { tr } from "../services/i18n.js";
import { listNotifications } from "../services/notify.js";
import { DEFAULT_PREFS } from "../types.js";
import type { User } from "../types.js";

export const authRouter = Router();

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message } });

const loginLimiter = limiter(15 * 60 * 1000, 30, "Too many attempts. Please wait a few minutes.");
const signupLimiter = limiter(60 * 60 * 1000, 30, "Too many sign-ups from this network. Try again later.");
// Code guessing is the one way to get into someone's data without credentials.
const codeLimiter = limiter(15 * 60 * 1000, 20, "Too many code attempts. Please wait a few minutes.");
const mailLimiter = limiter(60 * 60 * 1000, 10, "Too many emails requested. Try again later.");
const refreshLimiter = limiter(60 * 1000, 60, "Too many requests. Slow down.");

const BAD_CODE = "That code wasn't recognized. Check it with your school or bus company.";

/** What every sign-in/sign-up/refresh response looks like. */
function sessionFor(user: User, familyId?: string) {
  return {
    token: signAccessToken(user),
    refreshToken: issueRefreshToken(user.id, familyId),
    user: toPublicUser(user),
  };
}

async function sendVerification(user: User) {
  const code = createCode(user.email, "verify");
  await sendEmail({
    to: user.email,
    subject: tr(user.lang, "verify_subject"),
    text: tr(user.lang, "verify_body", { code }),
  });
}

authRouter.post("/auth/signup", signupLimiter, codeLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid details." });
  }
  const data = parsed.data;
  if (findUserByEmail(data.email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const now = new Date().toISOString();
  const base = {
    id: randomUUID(),
    name: data.name,
    email: data.email,
    passwordHash: await hashPassword(data.password),
    failedLogins: 0,
    lockedUntil: 0,
    createdAt: now,
    tokenVersion: 0,
    emailVerified: false,
    claimed: true,
    lang: data.lang ?? "en",
    notifPrefs: { ...DEFAULT_PREFS },
    consent: { termsVersion: config.termsVersion, acceptedAt: now },
  };
  let user: User;

  if (data.role === "student") {
    const school = findByCode("studentCode", data.schoolCode);
    if (!school || school.role !== "admin") return res.status(400).json({ error: BAD_CODE });
    user = {
      ...base,
      role: "student",
      schoolId: school.id,
      companyId: school.companyId,
      linkCode: makeCode("KID"),
    };
  } else if (data.role === "parent") {
    const child = findByCode("linkCode", data.childCode);
    if (!child || child.role !== "student") return res.status(400).json({ error: BAD_CODE });
    user = { ...base, role: "parent", linkedStudentIds: [child.id] };
  } else {
    const company = findByCode("driverCode", data.companyCode);
    if (!company || company.role !== "company") return res.status(400).json({ error: BAD_CODE });
    user = { ...base, role: "driver", companyId: company.id };
  }

  // Hashing took a moment; someone may have taken the email meanwhile.
  if (findUserByEmail(data.email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  users.set(user.id, user);
  void sendVerification(user);
  res.status(201).json(sessionFor(user));
});

authRouter.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your email and password." });

  const { email, password } = parsed.data;
  const user = findUserByEmail(email);
  const now = Date.now();

  if (user && user.lockedUntil > now) {
    await verifyPassword(password, DUMMY_HASH); // keep timing similar
    return res.status(429).json({ error: "Too many failed attempts. Try again in a few minutes." });
  }

  // Roster students who haven't chosen a password can't sign in yet.
  const usable = user && user.claimed !== false;
  const ok = await verifyPassword(password, usable ? user!.passwordHash : DUMMY_HASH);
  if (!user || !usable || !ok) {
    if (user && usable) {
      user.failedLogins += 1;
      if (user.failedLogins >= MAX_FAILED) {
        user.lockedUntil = now + LOCK_MS;
        user.failedLogins = 0;
        audit(user, { action: "auth.locked" }, req);
      }
    }
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  user.failedLogins = 0;
  user.lockedUntil = 0;
  if (user.role === "company" || user.role === "admin") audit(user, { action: "auth.login" }, req);
  res.json(sessionFor(user));
});

// Swap a refresh token for a fresh access token (and a new refresh token).
authRouter.post("/auth/refresh", refreshLimiter, (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Missing refresh token." });
  const rotated = rotateRefreshToken(parsed.data.refreshToken);
  if (!rotated || rotated.user.claimed === false) {
    return res.status(401).json({ error: "Please sign in again." });
  }
  res.json({
    token: signAccessToken(rotated.user),
    refreshToken: rotated.refreshToken,
    user: toPublicUser(rotated.user),
  });
});

authRouter.post("/auth/logout", (req, res) => {
  const parsed = logoutSchema.safeParse(req.body);
  if (parsed.success && parsed.data.refreshToken) revokeRefreshToken(parsed.data.refreshToken);
  res.json({ ok: true });
});

authRouter.get("/auth/me", requireAuth, (req, res) => {
  res.json(toPublicUser(req.user!));
});

authRouter.put("/auth/me/preferences", requireAuth, (req, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid settings." });
  const user = req.user!;
  if (parsed.data.lang) user.lang = parsed.data.lang;
  if (parsed.data.notifPrefs) {
    user.notifPrefs = { ...DEFAULT_PREFS, ...(user.notifPrefs ?? {}), ...parsed.data.notifPrefs };
  }
  res.json(toPublicUser(user));
});

authRouter.post("/auth/change-password", requireAuth, loginLimiter, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid password." });
  }
  const user = req.user!;
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "Your current password is incorrect." });
  }
  user.passwordHash = await hashPassword(parsed.data.newPassword);
  revokeAllSessions(user); // every other device must sign in again
  audit(user, { action: "auth.password_change" }, req);
  // This device keeps working with a fresh session.
  res.json({ ok: true, ...sessionFor(user) });
});

// ---- forgot / reset password -----------------------------------------------

authRouter.post("/auth/forgot", mailLimiter, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  // Always the same answer, so this can't be used to find out who has an account.
  const reply = () => res.json({ ok: true });
  if (!parsed.success) return reply();

  const user = findUserByEmail(parsed.data.email);
  if (user) {
    const recent = (
      db
        .prepare("SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND purpose = 'reset' AND created_at > ?")
        .get(user.email, Date.now() - 3_600_000) as { n: number }
    ).n;
    if (recent < 5) {
      const code = createCode(user.email, "reset");
      await sendEmail({
        to: user.email,
        subject: tr(user.lang, "reset_subject"),
        text: tr(user.lang, "reset_body", { code }),
      });
    }
  }
  reply();
});

authRouter.post("/auth/reset", codeLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the code and password." });
  }
  const { email, code, newPassword } = parsed.data;
  const user = findUserByEmail(email);
  if (!user || !consumeCode(email, "reset", code)) {
    return res.status(400).json({ error: "That code didn't work. Ask for a new one." });
  }
  user.passwordHash = await hashPassword(newPassword);
  user.failedLogins = 0;
  user.lockedUntil = 0;
  user.claimed = true; // roster students become real accounts here
  user.emailVerified = true; // they just proved they own the inbox
  revokeAllSessions(user);
  audit(user, { action: "auth.password_reset" }, req);
  res.json({ ok: true });
});

// ---- email verification ----------------------------------------------------

authRouter.post("/auth/verify-email", requireAuth, codeLimiter, (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the 6-digit code." });
  const user = req.user!;
  if (user.emailVerified) return res.json({ ok: true });
  if (!consumeCode(user.email, "verify", parsed.data.code)) {
    return res.status(400).json({ error: "That code didn't work. Ask for a new one." });
  }
  user.emailVerified = true;
  res.json({ ok: true });
});

authRouter.post("/auth/resend-verification", requireAuth, mailLimiter, async (req, res) => {
  const user = req.user!;
  if (!user.emailVerified) await sendVerification(user);
  res.json({ ok: true });
});

// ---- privacy: export and delete my data ------------------------------------

authRouter.get("/auth/me/export", requireAuth, (req, res) => {
  const user = req.user!;
  const kidIds = user.role === "parent" ? user.linkedStudentIds ?? [] : user.role === "student" ? [user.id] : [];
  const history = kidIds.length
    ? (db
        .prepare(
          `SELECT student_name, route_name, direction, local_date, stop_name, status, boarded_at, dropped_at
           FROM boarding_events WHERE student_id IN (${kidIds.map(() => "?").join(",")}) ORDER BY ended_at DESC LIMIT 2000`
        )
        .all(...kidIds) as unknown[])
    : [];
  const absences = kidIds.length
    ? db.prepare(`SELECT * FROM absences WHERE student_id IN (${kidIds.map(() => "?").join(",")})`).all(...kidIds)
    : [];
  res.setHeader("Content-Disposition", 'attachment; filename="wheelie-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    account: { ...toPublicUser(user), createdAt: user.createdAt, consent: user.consent },
    notifications: listNotifications(user.id, 200).items,
    rideHistory: history,
    plannedAbsences: absences,
  });
});

authRouter.delete("/auth/me", requireAuth, loginLimiter, async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your password to confirm." });
  const user = req.user!;
  if (user.role === "company" || user.role === "admin") {
    return res
      .status(403)
      .json({ error: "Bus company and school accounts are removed by Wheelie. Contact support." });
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "That password is incorrect." });
  }
  if (user.role === "driver") {
    for (const r of rideSessions.values()) {
      if (r.driverId === user.id && !r.endedAt) {
        return res.status(409).json({ error: "End your current ride before deleting your account." });
      }
    }
  }

  audit(user, { action: "account.delete", targetType: "user", targetId: user.id });
  if (user.role === "driver") {
    for (const r of routes.values()) if (r.driverId === user.id) r.driverId = undefined;
    db.prepare("UPDATE ride_history SET driver_name = NULL WHERE driver_id = ?").run(user.id);
  }
  if (user.role === "student") {
    for (const r of routes.values()) for (const s of r.stops) s.studentIds = s.studentIds.filter((id) => id !== user.id);
    for (const u of users.values()) {
      if (u.linkedStudentIds?.includes(user.id)) u.linkedStudentIds = u.linkedStudentIds.filter((id) => id !== user.id);
    }
    db.prepare("DELETE FROM absences WHERE student_id = ?").run(user.id);
    db.prepare("UPDATE boarding_events SET student_name = 'Former student' WHERE student_id = ?").run(user.id);
  }
  revokeAllSessions(user);
  db.prepare("DELETE FROM push_tokens WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM notifications WHERE user_id = ?").run(user.id);
  db.prepare("DELETE FROM email_codes WHERE email = ?").run(user.email);
  users.delete(user.id);
  res.json({ ok: true });
});

// ---- parents: link more children -------------------------------------------

const childView = (u: User) => ({
  id: u.id,
  name: u.name,
  requiresAdultPickup: u.requiresAdultPickup ?? false,
  authorizedPickups: u.authorizedPickups ?? [],
});

authRouter.get("/parent/children", requireAuth, requireRole("parent"), (req, res) => {
  const kids = (req.user!.linkedStudentIds ?? [])
    .map((id) => users.get(id))
    .filter((u): u is User => Boolean(u))
    .map(childView);
  res.json(kids);
});

authRouter.post(
  "/parent/children",
  requireAuth,
  requireRole("parent"),
  codeLimiter,
  (req, res) => {
    const parsed = linkChildSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter your child's code." });
    const child = findByCode("linkCode", parsed.data.childCode);
    if (!child || child.role !== "student") return res.status(400).json({ error: BAD_CODE });
    const parent = req.user!;
    const linked = new Set(parent.linkedStudentIds ?? []);
    linked.add(child.id);
    parent.linkedStudentIds = [...linked];
    res.json(childView(child));
  }
);

authRouter.delete("/parent/children/:id", requireAuth, requireRole("parent"), (req, res) => {
  const parent = req.user!;
  if (!parent.linkedStudentIds?.includes(req.params.id)) return res.status(404).json({ error: "Child not found." });
  parent.linkedStudentIds = parent.linkedStudentIds.filter((id) => id !== req.params.id);
  res.json({ ok: true });
});

// Drop-off rules a parent can set for their child: the driver must hand them to a named adult.
authRouter.put("/parent/children/:id/settings", requireAuth, requireRole("parent"), (req: Request, res: Response) => {
  const parent = req.user!;
  const child = users.get(req.params.id);
  if (!child || !parent.linkedStudentIds?.includes(child.id)) return res.status(404).json({ error: "Child not found." });
  const parsed = childSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the names (up to 5)." });
  if (parsed.data.requiresAdultPickup !== undefined) child.requiresAdultPickup = parsed.data.requiresAdultPickup;
  if (parsed.data.authorizedPickups) child.authorizedPickups = parsed.data.authorizedPickups;
  res.json(childView(child));
});

// A student can replace their code if it was shared with someone it shouldn't have been.
// Existing links stay; only new links need the new code.
authRouter.post("/students/me/link-code/rotate", requireAuth, requireRole("student"), (req, res) => {
  const student = req.user!;
  student.linkCode = makeCode("KID");
  res.json({ linkCode: student.linkCode });
});
