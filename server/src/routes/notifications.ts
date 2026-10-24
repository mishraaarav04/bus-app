import { Router } from "express";
import { config } from "../config.js";
import { db } from "../data/db.js";
import { requireAuth } from "../security/auth.js";
import { pushRegisterSchema, pushUnregisterSchema } from "../schemas.js";
import { listNotifications, markAllRead } from "../services/notify.js";

export const notificationsRouter = Router();

// Public: the app shows these links on the sign-up screen.
notificationsRouter.get("/legal", (_req, res) => {
  res.json({ termsVersion: config.termsVersion, privacyUrl: config.privacyUrl, termsUrl: config.termsUrl });
});

notificationsRouter.use(["/push", "/notifications"], requireAuth);

// The phone registers its Expo push token after sign-in.
notificationsRouter.post("/push/register", (req, res) => {
  const parsed = pushRegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid push token." });
  // A phone belongs to whoever signed in last.
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, platform, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform`
  ).run(parsed.data.token, req.user!.id, parsed.data.platform, Date.now());
  res.json({ ok: true });
});

notificationsRouter.delete("/push/register", (req, res) => {
  const parsed = pushUnregisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid push token." });
  db.prepare("DELETE FROM push_tokens WHERE token = ? AND user_id = ?").run(parsed.data.token, req.user!.id);
  res.json({ ok: true });
});

notificationsRouter.get("/notifications", (req, res) => {
  res.json(listNotifications(req.user!.id, 50));
});

notificationsRouter.post("/notifications/read", (req, res) => {
  markAllRead(req.user!.id);
  res.json({ ok: true });
});
