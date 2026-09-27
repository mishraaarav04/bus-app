import { Router } from "express";
import { randomUUID } from "node:crypto";
import { conversations, messages } from "../data/store.js";
import type { ChatConversation, ChatMessage, Role } from "../types.js";

export const chatRouter = Router();

/**
 * Conversations are scoped by relationship, not open messaging — matches
 * the earlier plan (parent<->parent, parent<->driver, driver/parent<->admin).
 * Student<->student chat was deliberately cut.
 */
chatRouter.post("/chat/conversations", (req, res) => {
  const body = req.body as Omit<ChatConversation, "id">;
  const convo: ChatConversation = { id: randomUUID(), ...body };
  conversations.set(convo.id, convo);
  messages.set(convo.id, []);
  res.json(convo);
});

chatRouter.get("/chat/conversations/:id/messages", (req, res) => {
  res.json(messages.get(req.params.id) ?? []);
});

chatRouter.post("/chat/conversations/:id/messages", (req, res) => {
  const { senderId, senderRole, body } = req.body as {
    senderId: string;
    senderRole: Role;
    body: string;
  };
  const msg: ChatMessage = {
    id: randomUUID(),
    conversationId: req.params.id,
    senderId,
    senderRole,
    body,
    sentAt: new Date().toISOString(),
  };
  const list = messages.get(req.params.id) ?? [];
  list.push(msg);
  messages.set(req.params.id, list);
  res.json(msg);
});
