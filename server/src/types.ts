// Core domain types shared across the server. The mobile app keeps a
// hand-mirrored copy in mobile/src/types.ts - keep them in sync by hand.

// "admin" is the SCHOOL account: it only ever sees its own school's routes,
// buses and students. "company" is a bus company.
export type Role = "student" | "parent" | "driver" | "company" | "admin";

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string; // unique, lowercased
  passwordHash: string; // bcrypt - never leaves the server
  failedLogins: number;
  lockedUntil: number; // epoch ms, 0 = not locked

  // driver -> company, school(admin) -> company that created it
  companyId?: string;
  // student -> school(admin) user id
  schoolId?: string;

  // student
  linkCode?: string; // parent enters this to link their child
  tagId?: string; // static NFC card id (optional, for physical cards later)
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
}

export interface ChatConversation {
  id: string;
  kind: "parent_group" | "parent_driver" | "admin_broadcast" | "driver_admin";
  routeId?: string;
  participantIds: string[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: Role;
  body: string;
  sentAt: string;
}
