// School roster import: a CSV of students (and optionally their stop, parent
// email and NFC card). Students are created without a password; they (or their
// parents, using the child code) can follow the bus right away, and the student
// sets a password later with "Forgot password".

import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { findStudentByTag, findUserByEmail, routes, users } from "../data/store.js";
import { makeCode } from "../security/auth.js";
import { DEFAULT_PREFS } from "../types.js";
import type { Route, User } from "../types.js";
import { activeRideFor } from "./access.js";
import { parseCsv } from "./csv.js";
import { sendEmail } from "./email.js";
import { tr } from "./i18n.js";

export const MAX_ROSTER_ROWS = 500;

// Nobody knows the secret behind this hash, so it can never match a password.
const UNUSABLE_HASH = bcrypt.hashSync(randomBytes(32).toString("hex"), 4);
const emailOk = z.string().trim().toLowerCase().email().max(254);

const HEADERS: Record<string, string> = {
  name: "name",
  studentname: "name",
  fullname: "name",
  student: "name",
  email: "email",
  studentemail: "email",
  parentemail: "parentEmail",
  guardianemail: "parentEmail",
  parent: "parentEmail",
  route: "route",
  routename: "route",
  stop: "stop",
  stopname: "stop",
  tagid: "tagId",
  tag: "tagId",
  nfc: "tagId",
  cardid: "tagId",
  card: "tagId",
};

export interface RosterRowResult {
  line: number;
  name: string;
  status: "created" | "updated" | "error";
  message?: string;
  linkCode?: string;
  warnings: string[];
}

export interface RosterReport {
  dryRun: boolean;
  created: number;
  updated: number;
  errors: number;
  invitesSent: number;
  rows: RosterRowResult[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function findStop(route: Route, ref: string) {
  const r = ref.trim().toLowerCase();
  const byName = route.stops.find((s) => s.name.toLowerCase() === r);
  if (byName) return byName;
  if (/^\d+$/.test(r)) return route.stops.find((s) => s.order + 1 === Number(r));
  return undefined;
}

export async function importRoster(
  school: User,
  csv: string,
  opts: { dryRun: boolean; sendInvites: boolean }
): Promise<RosterReport> {
  const table = parseCsv(csv);
  if (table.length < 2) throw new RosterError("The file needs a header row and at least one student.");
  if (table.length - 1 > MAX_ROSTER_ROWS) throw new RosterError(`Please import ${MAX_ROSTER_ROWS} students or fewer at a time.`);

  const cols: Record<string, number> = {};
  table[0].forEach((h, i) => {
    const key = HEADERS[norm(h)];
    if (key && cols[key] === undefined) cols[key] = i;
  });
  if (cols.name === undefined) throw new RosterError("There's no 'name' column in the first row.");
  const get = (row: string[], key: string) => (cols[key] === undefined ? "" : (row[cols[key]] ?? "").trim());

  const schoolRoutes = [...routes.values()].filter((r) => r.schoolId === school.id && r.status === "sent");
  const report: RosterReport = { dryRun: opts.dryRun, created: 0, updated: 0, errors: 0, invitesSent: 0, rows: [] };
  const seenEmails = new Set<string>();
  const seenTags = new Set<string>();
  const invites: { to: string; subject: string; text: string }[] = [];

  for (let i = 1; i < table.length; i++) {
    const row = table[i];
    const line = i + 1;
    const name = get(row, "name").slice(0, 80);
    const result: RosterRowResult = { line, name, status: "error", warnings: [] };
    report.rows.push(result);

    if (!name) {
      result.message = "Missing name.";
      report.errors++;
      continue;
    }

    // --- email -----------------------------------------------------------------
    const rawEmail = get(row, "email");
    let email: string | null = null;
    if (rawEmail) {
      const parsed = emailOk.safeParse(rawEmail);
      if (!parsed.success) {
        result.message = `"${rawEmail}" isn't a valid email.`;
        report.errors++;
        continue;
      }
      email = parsed.data;
      if (seenEmails.has(email)) {
        result.message = "This email appears twice in the file.";
        report.errors++;
        continue;
      }
      seenEmails.add(email);
    }

    // --- which student is this? ----------------------------------------------------
    let student: User | undefined;
    if (email) {
      const existing = findUserByEmail(email);
      if (existing && !(existing.role === "student" && existing.schoolId === school.id)) {
        result.message = "That email belongs to a different account.";
        report.errors++;
        continue;
      }
      student = existing;
    } else {
      // No email: re-importing the same list shouldn't create duplicates.
      student = [...users.values()].find(
        (u) => u.role === "student" && u.schoolId === school.id && u.claimed === false && u.name.toLowerCase() === name.toLowerCase()
      );
    }

    // --- NFC card ----------------------------------------------------------------------
    let tagId = get(row, "tagId") || undefined;
    if (tagId) {
      const owner = findStudentByTag(tagId);
      if ((owner && owner.id !== student?.id) || seenTags.has(tagId)) {
        result.warnings.push(`Card ${tagId} is already used by someone else, so it wasn't set.`);
        tagId = undefined;
      } else seenTags.add(tagId);
    }

    // --- create or update -----------------------------------------------------------------
    const isNew = !student;
    if (!student) {
      student = {
        id: randomUUID(),
        role: "student",
        name,
        email: email ?? `roster-${randomUUID()}@no-login.invalid`,
        passwordHash: UNUSABLE_HASH,
        failedLogins: 0,
        lockedUntil: 0,
        createdAt: new Date().toISOString(),
        tokenVersion: 0,
        emailVerified: false,
        claimed: false,
        lang: "en",
        notifPrefs: { ...DEFAULT_PREFS },
        schoolId: school.id,
        companyId: school.companyId,
        linkCode: makeCode("KID"),
      };
    }
    result.linkCode = student.linkCode;

    // --- stop assignment ----------------------------------------------------------------------
    const routeRef = get(row, "route");
    const stopRef = get(row, "stop");
    let assignTo: { route: Route; stopId: string } | null = null;
    if (routeRef || stopRef) {
      const route =
        schoolRoutes.find((r) => r.name.toLowerCase() === routeRef.toLowerCase()) ??
        (!routeRef && schoolRoutes.length === 1 ? schoolRoutes[0] : undefined);
      const stop = route && stopRef ? findStop(route, stopRef) : undefined;
      if (!route) result.warnings.push(`Route "${routeRef}" wasn't found among your sent routes.`);
      else if (!stop) result.warnings.push(`Stop "${stopRef}" wasn't found on ${route.name}.`);
      else if (activeRideFor(route.id)) result.warnings.push(`${route.name} is running right now, so the stop wasn't changed.`);
      else assignTo = { route, stopId: stop.id };
    }

    // --- parent -----------------------------------------------------------------------------------
    const parentEmailRaw = get(row, "parentEmail");
    let parentToInvite: string | null = null;
    let parentToLink: User | null = null;
    if (parentEmailRaw) {
      const p = emailOk.safeParse(parentEmailRaw);
      if (!p.success) result.warnings.push(`Parent email "${parentEmailRaw}" isn't valid.`);
      else {
        const existing = findUserByEmail(p.data);
        if (existing?.role === "parent") parentToLink = existing;
        else if (existing) result.warnings.push("That parent email belongs to a different kind of account.");
        else parentToInvite = p.data;
      }
    }

    // --- apply ------------------------------------------------------------------------------------------
    if (!opts.dryRun) {
      student.name = name;
      if (tagId) student.tagId = tagId;
      if (isNew) users.set(student.id, student);
      if (assignTo) {
        for (const s of assignTo.route.stops) {
          s.studentIds = s.studentIds.filter((id) => id !== student!.id);
          if (s.id === assignTo.stopId) s.studentIds.push(student.id);
        }
      }
      if (parentToLink) {
        const linked = new Set(parentToLink.linkedStudentIds ?? []);
        linked.add(student.id);
        parentToLink.linkedStudentIds = [...linked];
      }
    }

    if (opts.sendInvites) {
      if (isNew && email) {
        invites.push({
          to: email,
          subject: tr("en", "invite_student_subject"),
          text: tr("en", "invite_student_body", { school: school.name }),
        });
      }
      if (parentToInvite) {
        invites.push({
          to: parentToInvite,
          subject: tr("en", "invite_parent_subject", { name }),
          text: tr("en", "invite_parent_body", { school: school.name, name, code: student.linkCode ?? "" }),
        });
      }
    }

    result.status = isNew ? "created" : "updated";
    if (isNew) report.created++;
    else report.updated++;
  }

  if (!opts.dryRun) {
    for (const mail of invites) await sendEmail(mail);
    report.invitesSent = invites.length;
  } else {
    report.invitesSent = invites.length; // how many *would* go out
  }
  return report;
}

export class RosterError extends Error {}
