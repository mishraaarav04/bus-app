// Plain in-memory store. Swap for Postgres/Prisma later - everything reads and
// writes through these exports, so callers shouldn't need to change.

import type {
  User,
  Route,
  RideSession,
  ChatConversation,
  ChatMessage,
} from "../types.js";

export const users = new Map<string, User>();
export const routes = new Map<string, Route>();
export const rideSessions = new Map<string, RideSession>();
export const conversations = new Map<string, ChatConversation>();
export const messages = new Map<string, ChatMessage[]>(); // conversationId -> messages

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
