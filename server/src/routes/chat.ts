import { Router } from "express";
import { randomUUID } from "node:crypto";
import { conversations, messages, routes as routeStore, users } from "../data/store.js";
import { requireAuth } from "../security/auth.js";
import { createConversationSchema, sendMessageSchema } from "../schemas.js";
import { canViewRoute } from "../services/access.js";
import { getIo } from "../services/rideBroadcast.js";
import type { ChatConversation, ChatMessage } from "../types.js";

export const chatRouter = Router();
chatRouter.use("/chat", requireAuth);

const isMember = (c: ChatConversation, userId: string) => c.participantIds.includes(userId);

/**
 * Conversations are scoped to a route: everyone in one has to be allowed to see
 * that route. (Student-to-student chat was cut and is not offered.)
 */
chatRouter.post("/chat/conversations", (req, res) => {
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.routeId) {
    return res.status(400).json({ error: "A conversation needs a route." });
  }
  const route = routeStore.get(parsed.data.routeId);
  if (!route || !canViewRoute(req.user!, route)) return res.status(404).json({ error: "Route not found." });

  const ids = new Set([req.user!.id, ...parsed.data.participantIds]);
  for (const id of ids) {
    const u = users.get(id);
    if (!u || !canViewRoute(u, route)) return res.status(400).json({ error: "Invalid participant." });
    // No student-to-student chat.
    if (u.role === "student" && req.user!.role === "student" && id !== req.user!.id) {
      return res.status(400).json({ error: "Invalid participant." });
    }
  }
  const convo: ChatConversation = {
    id: randomUUID(),
    kind: parsed.data.kind,
    routeId: route.id,
    participantIds: [...ids],
  };
  conversations.set(convo.id, convo);
  messages.set(convo.id, []);
  res.status(201).json(convo);
});

chatRouter.get("/chat/conversations/:id/messages", (req, res) => {
  const c = conversations.get(req.params.id);
  if (!c || !isMember(c, req.user!.id)) return res.status(404).json({ error: "Conversation not found." });
  res.json(messages.get(c.id) ?? []);
});

chatRouter.post("/chat/conversations/:id/messages", (req, res) => {
  const c = conversations.get(req.params.id);
  if (!c || !isMember(c, req.user!.id)) return res.status(404).json({ error: "Conversation not found." });
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Message can't be empty or over 2000 characters." });

  const msg: ChatMessage = {
    id: randomUUID(),
    conversationId: c.id,
    senderId: req.user!.id, // always the signed-in user, never taken from the request
    senderRole: req.user!.role,
    body: parsed.data.body,
    sentAt: new Date().toISOString(),
  };
  const list = messages.get(c.id) ?? [];
  list.push(msg);
  messages.set(c.id, list);
  for (const pid of c.participantIds) getIo()?.to(`user:${pid}`).emit("chat:message", msg);
  res.status(201).json(msg);
});
