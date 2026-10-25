import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { users } from "../data/store.js";
import { requireAuth, requireRole } from "../security/auth.js";
import { aiEnabled, askData, draftAlert } from "../services/ai.js";
import { audit } from "../services/audit.js";
import { etaAccuracy, findAnomalies, forecastRidership, routesInScope, scopeOf, suggestRoutes } from "../services/insights.js";
import { notifyUsers } from "../services/notify.js";
import { familyOf } from "../services/rideBroadcast.js";
import { addDays, isValidDate, todayLocal } from "../services/time.js";

export const aiRouter = Router();
aiRouter.use(["/ai", "/announcements"], requireAuth, requireRole("company", "admin"));

const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Slow down a little and try again in a minute." } });

// Everything the Insights page shows, in one request.
aiRouter.get("/ai/insights", (req, res) => {
  const scope = scopeOf(req.user!);
  const date = typeof req.query.date === "string" && isValidDate(req.query.date) ? req.query.date : todayLocal();
  const anomalies = findAnomalies(scope).map(({ studentId: _s, ...rest }) => rest);
  res.json({
    date,
    llm: aiEnabled(),
    forecast: forecastRidership(scope, date),
    anomalies,
    suggestions: suggestRoutes(scope),
    etaAccuracy: etaAccuracy(scope),
    tomorrow: addDays(todayLocal(), 1),
  });
});

const askSchema = z.object({ question: z.string().trim().min(3, "Ask a question.").max(500, "Keep the question under 500 characters.") });
aiRouter.post("/ai/ask", limiter, async (req, res, next) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ask a question." });
  try {
    res.json(await askData(req.user!, parsed.data.question));
  } catch (e) {
    next(e);
  }
});

const draftSchema = z.object({
  note: z.string().trim().min(3, "Write a few words about what happened.").max(600, "Keep it under 600 characters."),
  routeId: z.string().uuid().optional(),
});
aiRouter.post("/ai/draft-alert", limiter, async (req, res, next) => {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
  const route = parsed.data.routeId ? routesInScope(scopeOf(req.user!)).find((r) => r.id === parsed.data.routeId) : undefined;
  try {
    res.json(await draftAlert(req.user!, parsed.data.note, route?.name));
  } catch (e) {
    next(e);
  }
});

// A person reviews a draft and then sends it. Nothing here is sent automatically.
const textSchema = z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(400) });
const announceSchema = z.object({
  routeId: z.union([z.string().uuid(), z.literal("all")]),
  text: z.object({ en: textSchema, es: textSchema.optional(), pt: textSchema.optional() }),
});
aiRouter.post("/announcements", (req, res) => {
  const parsed = announceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Write a title and a message." });
  const { routeId, text } = parsed.data;

  const mine = routesInScope(scopeOf(req.user!));
  const targets = routeId === "all" ? mine : mine.filter((r) => r.id === routeId);
  if (!targets.length) return res.status(404).json({ error: "Route not found." });

  const people = new Set<string>();
  for (const r of targets) for (const s of r.stops) for (const sid of s.studentIds) for (const id of familyOf(sid)) if (users.has(id)) people.add(id);
  if (!people.size) return res.status(400).json({ error: "No families are assigned to that route yet." });

  notifyUsers(people, { kind: "announcement", text, data: { routeIds: targets.map((r) => r.id) } });
  audit(req.user!, {
    action: "announcement.send",
    targetType: "route",
    targetId: routeId === "all" ? undefined : routeId,
    meta: { routes: targets.map((r) => r.name).join(", "), recipients: people.size, title: text.en.title },
  }, req);
  res.json({ sent: people.size, routes: targets.length });
});
