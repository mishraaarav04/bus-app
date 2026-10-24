// Core domain types shared across the server. The mobile app keeps a
// hand-mirrored copy in mobile/src/types.ts - keep them in sync by hand.

// "admin" is the SCHOOL account: it only ever sees its own school's routes,
// buses and students. "company" is a bus company.
export type Role = "student" | "parent" | "driver" | "company" | "admin";

export type Lang = "en" | "es" | "pt";

/** Which push/inbox alerts a family member wants. Staff alerts are always on. */
export interface NotifPrefs {
  approaching: boolean; // "bus is on its way", "arrives in 5 min"
  boarding: boolean; // boarded, missed, dropped off, arrived at school
  delays: boolean; // late, breakdown, accident
}

export const DEFAULT_PREFS: NotifPrefs = { approaching: true, boarding: true, delays: true };

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string; // unique, lowercased
  passwordHash: string; // bcrypt - never leaves the server
  failedLogins: number;
  lockedUntil: number; // epoch ms, 0 = not locked

  createdAt?: string;
  // Bumped on password change/reset/delete: access tokens carrying an older
  // value stop working immediately.
  tokenVersion?: number;
  emailVerified?: boolean;
  // false for students a school pre-loaded from a roster who haven't set a
  // password yet. They can't sign in until they do ("Forgot password").
  claimed?: boolean;
  lang?: Lang;
  notifPrefs?: NotifPrefs;
  consent?: { termsVersion: string; acceptedAt: string };

  // driver -> company, school(admin) -> company that created it
  companyId?: string;
  // student -> school(admin) user id
  schoolId?: string;

  // student
  linkCode?: string; // parent enters this to link their child
  tagId?: string; // static NFC card id (optional, for physical cards later)
  // Set by a parent: the driver must hand this child to a named adult.
  requiresAdultPickup?: boolean;
  authorizedPickups?: string[];
  // parent
  linkedStudentIds?: string[];

  // company: code drivers use to join
  driverCode?: string;
  busSpec?: BusSpec;
  // school(admin): code students use to join, plus where the school is
  studentCode?: string;
  address?: string;
  location?: GeoPoint;
}

// What the client is allowed to see about a user.
export interface PublicUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  companyId?: string;
  schoolId?: string;
  linkCode?: string;
  linkedStudentIds?: string[];
  driverCode?: string;
  studentCode?: string;
  busSpec?: BusSpec;
  address?: string;
  emailVerified: boolean;
  lang: Lang;
  notifPrefs: NotifPrefs;
  requiresAdultPickup?: boolean;
  authorizedPickups?: string[];
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Bus dimensions used for clearance-aware routing (metres / metric tons). */
export interface BusSpec {
  heightM: number;
  widthM: number;
  weightT: number;
}

export type BoardingStatus = "pending" | "boarded" | "missed" | "skipped";

export interface Stop {
  id: string;
  name: string;
  location: GeoPoint;
  order: number; // position in the route, ascending
  studentIds: string[]; // students assigned to this stop
  radiusMeters: number; // geofence radius for arrival detection
}

export interface Route {
  id: string;
  name: string;
  direction: "to_school" | "to_home";
  schoolLocation: GeoPoint;
  stops: Stop[]; // ordered by `order`
  driverId?: string;

  companyId?: string;
  schoolId?: string; // the school (admin user) this route belongs to
  status?: "draft" | "sent";
  vehicle?: BusSpec;
  // Scheduled start of the run, "HH:MM" in the school's timezone. Optional;
  // when set, reports show how late each run started.
  startTime?: string;
  // Road geometry from Mapbox Directions (GeoJSON [lng, lat] pairs). Absent
  // for hand-built/demo routes, in which case clients draw straight lines.
  geometry?: [number, number][];
  totalDurationSec?: number;
  totalDistanceM?: number;
  clearanceChecked?: boolean;
}

export interface StopRideState {
  stopId: string;
  status: BoardingStatus;
  studentStatuses: Record<string, BoardingStatus>;
  etaSeconds: number | null;
  skippedReason?: "no_riders" | "manual_skip";
}

export interface DropOff {
  at: string; // ISO time
  stopId: string | null; // null = dropped at school
  handedTo?: string; // adult the child was handed to, when required
}

export interface RideSession {
  id: string;
  routeId: string;
  driverId: string;
  direction: "to_school" | "to_home";
  startedAt: string;
  endedAt: string | null;
  busLocation: GeoPoint | null;
  // Average speed used for ETAs, calibrated from the Mapbox route when we have one.
  avgSpeedMps?: number;
  remainingStopIds: string[]; // ordered
  stopStates: Record<string, StopRideState>;
  completedStopIds: string[];
  // studentId -> ISO time they were checked in on the bus
  boardedAt?: Record<string, string>;
  // studentId -> where/when they got off (to-home runs) or arrived (to-school)
  droppedAt?: Record<string, DropOff>;
  // Stops we've already sent an "arriving soon" alert for.
  approachNotified?: string[];
}

export type IncidentType = "delay" | "breakdown" | "accident" | "other" | "off_route" | "stopped";

/** Something that happened on a ride: reported by the driver, or detected by the server. */
export interface Incident {
  id: string;
  rideId: string;
  routeId: string;
  type: IncidentType;
  source: "driver" | "system";
  delayMinutes: number | null;
  note: string | null; // staff only
  createdAt: string;
  resolvedAt: string | null;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface Absence {
  studentId: string;
  date: string; // YYYY-MM-DD in the school timezone
  direction: "to_school" | "to_home" | "both";
}
