import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { config } from "../config.js";
import { users } from "../data/store.js";
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
  return jwt.sign({ sub: user.id, use: "access" }, config.jwtSecret, {
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

function verifyToken(token: string, use: "access" | "board"): string | null {
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof p === "string" || p.use !== use || typeof p.sub !== "string") return null;
    return p.sub;
  } catch {
    return null;
  }
}

export const verifyAccessToken = (t: string) => verifyToken(t, "access");
export const verifyBoardingToken = (t: string) => verifyToken(t, "board");

// ---- middleware ------------------------------------------------------------

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = token ? verifyAccessToken(token) : null;
  const user = userId ? users.get(userId) : undefined;
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
  };
}

// No 0/O/1/I so codes are easy to read out loud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode(prefix: string, length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s}`;
}
