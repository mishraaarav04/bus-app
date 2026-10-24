// Who did what, kept so a company or school can answer "who changed this?".

import type { Request } from "express";
import { db } from "../data/db.js";
import type { User } from "../types.js";

export interface AuditEntry {
  action: string; // e.g. "route.send", "roster.import"
  targetType?: string;
  targetId?: string;
  companyId?: string | null;
  schoolId?: string | null;
  meta?: Record<string, unknown>;
}

const insert = db.prepare(
  `INSERT INTO audit_log (ts, actor_id, actor_role, actor_name, action, target_type, target_id, company_id, school_id, meta, ip)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

/** Record an action by `actor`. `req` is optional and only used for the IP address. */
export function audit(actor: User | null, entry: AuditEntry, req?: Request) {
  // Staff scope: a company sees entries tagged with its id, a school with its id.
  const companyId = entry.companyId ?? (actor?.role === "company" ? actor.id : actor?.companyId) ?? null;
  const schoolId = entry.schoolId ?? (actor?.role === "admin" ? actor.id : actor?.role === "student" ? actor.schoolId : null) ?? null;
  insert.run(
    Date.now(),
    actor?.id ?? null,
    actor?.role ?? null,
    actor?.name ?? null,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    companyId,
    schoolId,
    entry.meta ? JSON.stringify(entry.meta) : null,
    req?.ip ?? null
  );
}

export interface AuditRow {
  id: number;
  at: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
}

export function listAudit(scope: { companyId?: string; schoolId?: string }, limit = 100, before?: number): AuditRow[] {
  const where = scope.companyId ? "company_id = ?" : "school_id = ?";
  const rows = db
    .prepare(
      `SELECT * FROM audit_log WHERE ${where} ${before ? "AND id < ?" : ""} ORDER BY id DESC LIMIT ?`
    )
    .all(...[scope.companyId ?? scope.schoolId, ...(before ? [before] : []), limit]) as any[];
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.ts).toISOString(),
    actorName: r.actor_name,
    actorRole: r.actor_role,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    meta: r.meta ? JSON.parse(r.meta) : null,
  }));
}
