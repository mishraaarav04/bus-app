// Plain in-memory store for this rudimentary build. Swap for Postgres/
// Prisma later — nothing else in the codebase should need to change since
// all reads/writes go through these functions.

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
export const studentLocations = new Map<string, { lat: number; lng: number }>();
