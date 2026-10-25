import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { config } from "../config.js";
import { users } from "../data/store.js";
import { DEFAULT_PREFS } from "../types.js";
import type { PublicUser, Role, User } from "../types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// ---- passwords -------------------------------------------------------------

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptCost);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Compared against when the email doesn't exist, so "no such user" and "wrong
// password" take the same time and can't be told apart by timing.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", config.bcryptCost);

// ---- tokens ----------------------------------------------------------------

export function signAccessToken(user: User): string {
  return jwt.sign({ sub: user.id, use: "access", tv: user.tokenVersion ?? 0 }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.accessTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

/** Short-lived token a student's phone shows as a QR code for the driver to scan. */
export function signBoardingToken(studentId: string): string {
  return jwt.sign({ sub: studentId, use: "board" }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.boardingTokenTtlSec,
  });
}

/**
 * A narrow token that can do exactly one thing: post this ride's location.
 * The phone's background task uses it, so a stolen copy can't read anything
 * or change anything else.
 */
export function signLocationToken(driverId: string, rideId: string): string {
  return jwt.sign({ sub: driverId, rid: rideId, use: "loc" }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.locationTokenTtlSec,
  });
}

function decode(token: string, use: string, ignoreExpiration = false): jwt.JwtPayload | null {
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"], ignoreExpiration });
    if (typeof p === "string" || p.use !== use || typeof p.sub !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

/** The signed-in user for an access token, or null. Honours password-change revocation. */
export function userFromAccessToken(token: string): User | null {
  const p = decode(token, "access");
  const user = p ? users.get(p.sub as string) : undefined;
  if (!user || (p!.tv ?? 0) !== (user.tokenVersion ?? 0)) return null;
  return user;
}

/**
 * Student id from a boarding code. When the driver's phone was offline, the
 * scan time is passed in and the code only has to have been valid at that time
 * (with a little slack for clock drift), not right now.
 */
export function verifyBoardingToken(token: string, scannedAtMs?: number): string | null {
  if (scannedAtMs === undefined) return decode(token, "board")?.sub ?? null;
  const p = decode(token, "board", true);
  if (!p || typeof p.iat !== "number" || typeof p.exp !== "number") return null;
  const slack = 120_000;
  if (scannedAtMs < p.iat * 1000 - slack || scannedAtMs > p.exp * 1000 + slack) return null;
  return p.sub as string;
}

export function verifyLocationToken(token: string): { driverId: string; rideId: string } | null {
  const p = decode(token, "loc");
  return p && typeof p.rid === "string" ? { driverId: p.sub as string, rideId: p.rid } : null;
}

// ---- middleware ------------------------------------------------------------

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = token ? userFromAccessToken(token) : null;
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed for your account type." });
    }
    next();
  };
}

// ---- helpers ---------------------------------------------------------------

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    companyId: u.companyId,
    schoolId: u.schoolId,
    linkCode: u.linkCode,
    linkedStudentIds: u.linkedStudentIds,
    driverCode: u.driverCode,
    studentCode: u.studentCode,
    busSpec: u.busSpec,
    address: u.address,
    emailVerified: u.emailVerified ?? false,
    lang: u.lang ?? "en",
    notifPrefs: { ...DEFAULT_PREFS, ...(u.notifPrefs ?? {}) },
    requiresAdultPickup: u.role === "student" ? u.requiresAdultPickup ?? false : undefined,
    authorizedPickups: u.role === "student" ? u.authorizedPickups ?? [] : undefined,
  };
}

// No 0/O/1/I so codes are easy to read out loud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode(prefix: string, length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s}`;
}
