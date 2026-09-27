import { Router } from "express";
import { randomUUID } from "node:crypto";
import { users } from "../data/store.js";
import type { Role, User } from "../types.js";

export const authRouter = Router();

/**
 * STUBBED ON PURPOSE. No SMS/email/OTP provider is wired up — this just
 * creates-or-fetches a user by contact info so the rest of the app has
 * someone to be. Plug in real phone/email verification (and admin-issued
 * credentials for admin/driver, per the earlier plan) when you get to it.
 */
authRouter.post("/auth/login", (req, res) => {
  const { contact, name, role } = req.body as {
    contact: string;
    name: string;
    role: Role;
  };

  let user = [...users.values()].find((u) => u.contact === contact);
  if (!user) {
    user = { id: randomUUID(), contact, name, role };
    users.set(user.id, user);
  }
  res.json(user);
});

authRouter.post("/auth/link-parent", (req, res) => {
  const { parentId, studentId } = req.body as {
    parentId: string;
    studentId: string;
  };
  const parent = users.get(parentId);
  if (!parent) return res.status(404).json({ error: "parent not found" });
  parent.linkedStudentIds = [...(parent.linkedStudentIds ?? []), studentId];
  res.json(parent);
});
