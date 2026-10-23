import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { findByCode, findUserByEmail, users } from "../data/store.js";
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
import { changePasswordSchema, linkChildSchema, loginSchema, signupSchema } from "../schemas.js";
import type { User } from "../types.js";

export const authRouter = Router();

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes." },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-ups from this network. Try again later." },
});
// Code guessing is the one way to get into someone's data without credentials.
const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code attempts. Please wait a few minutes." },
});

const BAD_CODE = "That code wasn't recognized. Check it with your school or bus company.";

authRouter.post("/auth/signup", signupLimiter, codeLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid details." });
  }
  const data = parsed.data;
  if (findUserByEmail(data.email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const base = {
    id: randomUUID(),
    name: data.name,
    email: data.email,
    passwordHash: await hashPassword(data.password),
    failedLogins: 0,
    lockedUntil: 0,
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

  users.set(user.id, user);
  res.status(201).json({ token: signAccessToken(user), user: toPublicUser(user) });
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

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      user.failedLogins += 1;
      if (user.failedLogins >= MAX_FAILED) {
        user.lockedUntil = now + LOCK_MS;
        user.failedLogins = 0;
      }
    }
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  user.failedLogins = 0;
  user.lockedUntil = 0;
  res.json({ token: signAccessToken(user), user: toPublicUser(user) });
});

authRouter.get("/auth/me", requireAuth, (req, res) => {
  res.json(toPublicUser(req.user!));
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
  res.json({ ok: true });
});

// ---- parents: link more children -------------------------------------------

authRouter.get("/parent/children", requireAuth, requireRole("parent"), (req, res) => {
  const kids = (req.user!.linkedStudentIds ?? [])
    .map((id) => users.get(id))
    .filter((u): u is User => Boolean(u))
    .map((u) => ({ id: u.id, name: u.name }));
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
    res.json({ id: child.id, name: child.name });
  }
);

// A student can replace their code if it was shared with someone it shouldn't have been.
// Existing links stay; only new links need the new code.
authRouter.post("/students/me/link-code/rotate", requireAuth, requireRole("student"), (req, res) => {
  const student = req.user!;
  student.linkCode = makeCode("KID");
  res.json({ linkCode: student.linkCode });
});
