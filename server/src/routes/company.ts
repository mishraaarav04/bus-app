import { Router } from "express";
import { randomUUID } from "node:crypto";
import { findUserByEmail, users } from "../data/store.js";
import { hashPassword, makeCode, requireAuth, requireRole, toPublicUser } from "../security/auth.js";
import { busSpecSchema, createSchoolSchema } from "../schemas.js";
import type { User } from "../types.js";

export const companyRouter = Router();
companyRouter.use("/company", requireAuth, requireRole("company"));

companyRouter.get("/company/overview", (req, res) => {
  const company = req.user!;
  const drivers = [...users.values()]
    .filter((u) => u.role === "driver" && u.companyId === company.id)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));
  const schools = [...users.values()]
    .filter((u) => u.role === "admin" && u.companyId === company.id)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      address: u.address,
      location: u.location,
      studentCode: u.studentCode,
    }));
  res.json({
    driverCode: company.driverCode,
    busSpec: company.busSpec,
    drivers,
    schools,
  });
});

// The company creates the school's account and hands over the sign-in details.
companyRouter.post("/company/schools", async (req, res) => {
  const parsed = createSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid details." });
  }
  const d = parsed.data;
  if (findUserByEmail(d.email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  const school: User = {
    id: randomUUID(),
    role: "admin",
    name: d.name,
    email: d.email,
    passwordHash: await hashPassword(d.password),
    failedLogins: 0,
    lockedUntil: 0,
    companyId: req.user!.id,
    address: d.address,
    location: d.location,
    studentCode: makeCode("SCH"),
  };
  users.set(school.id, school);
  res.status(201).json({ ...toPublicUser(school), location: school.location });
});

companyRouter.put("/company/bus-spec", (req, res) => {
  const parsed = busSpecSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the bus dimensions." });
  req.user!.busSpec = parsed.data;
  res.json(parsed.data);
});
