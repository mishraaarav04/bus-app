// Core domain types shared across the server. The mobile app keeps a
// hand-mirrored copy in mobile/src/types.ts (no monorepo tooling for this
// rudimentary build — keep them in sync by hand).

export type Role = "student" | "parent" | "admin" | "driver";

export interface User {
  id: string;
  role: Role;
  name: string;
  // Auth is stubbed for this rudimentary build: no real SMS/email provider
  // is wired up. `contact` just needs to be unique per user for now.
  contact: string; // phone or email
  linkedStudentIds?: string[]; // parent -> student(s)
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type BoardingStatus = "pending" | "boarded" | "missed" | "skipped";

export interface Stop {
  id: string;
  name: string;
  location: GeoPoint;
  order: number; // position in the route, ascending
  studentIds: string[]; // students assigned to this stop
  radiusMeters: number; // geofence radius for boarding/arrival detection
}

export interface Route {
  id: string;
  name: string;
  direction: "to_school" | "to_home";
  schoolLocation: GeoPoint;
  stops: Stop[]; // ordered by `order`
  driverId?: string;
}

export interface StopRideState {
  stopId: string;
  status: BoardingStatus;
  studentStatuses: Record<string, BoardingStatus>; // per-student, since a stop can serve multiple students
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
  // The live, mutable plan for this ride. Starts as a copy of the route's
  // stops and shrinks/reorders as students flag themselves off and the
  // reroute logic skips stops.
  remainingStopIds: string[]; // ordered
  stopStates: Record<string, StopRideState>;
  completedStopIds: string[];
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
