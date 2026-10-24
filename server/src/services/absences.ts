// Planned absences ("Sam isn't riding on Friday"). On the day, they're applied
// when the ride starts, using the same skip logic as tapping "Not riding today".

import { db } from "../data/db.js";
import type { Absence, Route } from "../types.js";
import { addDays, todayLocal } from "./time.js";

export type AbsenceDirection = Absence["direction"];

export function addAbsence(studentId: string, date: string, direction: AbsenceDirection, createdBy: string) {
  db.prepare(
    `INSERT OR IGNORE INTO absences (student_id, date, direction, created_by, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(studentId, date, direction, createdBy, Date.now());
}

export function removeAbsence(studentId: string, date: string, direction: AbsenceDirection) {
  db.prepare("DELETE FROM absences WHERE student_id = ? AND date = ? AND direction = ?").run(studentId, date, direction);
}

/** Today's and future absences for these students. */
export function upcomingAbsences(studentIds: string[]): Absence[] {
  if (studentIds.length === 0) return [];
  const marks = studentIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT student_id AS studentId, date, direction FROM absences
       WHERE student_id IN (${marks}) AND date >= ? ORDER BY date, student_id`
    )
    .all(...studentIds, todayLocal()) as Absence[];
}

/** Students on this route who have today's run marked as an absence. */
export function absentTodayOnRoute(route: Route): string[] {
  const ids = route.stops.flatMap((s) => s.studentIds);
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT DISTINCT student_id AS id FROM absences
       WHERE date = ? AND direction IN ('both', ?) AND student_id IN (${marks})`
    )
    .all(todayLocal(), route.direction, ...ids) as { id: string }[];
  return rows.map((r) => r.id);
}

export const MAX_DAYS_AHEAD = 60;
export const lastAllowedDate = () => addDays(todayLocal(), MAX_DAYS_AHEAD);
