// Mirrors server/src/types.ts by hand. This is a rudimentary build with no
// shared workspace package yet — if you add one later, delete this file and
// import from the shared package instead.

export type Role = "student" | "parent" | "admin" | "driver";

export interface User {
  id: string;
  role: Role;
  name: string;
  contact: string;
  linkedStudentIds?: string[];
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
  order: number;
  studentIds: string[];
  radiusMeters: number;
}

export interface Route {
  id: string;
  name: string;
  direction: "to_school" | "to_home";
  schoolLocation: GeoPoint;
  stops: Stop[];
  driverId?: string;
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
  remainingStopIds: string[];
  stopStates: Record<string, StopRideState>;
  completedStopIds: string[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: Role;
  body: string;
  sentAt: string;
}
