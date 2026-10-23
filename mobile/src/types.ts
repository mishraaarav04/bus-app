// Mirrors server/src/types.ts (views the server sends). Kept by hand.

export type Role = "student" | "parent" | "driver" | "company" | "admin";

export interface User {
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
  schoolId?: string;
  status?: "draft" | "sent";
  vehicle?: BusSpec;
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
  boardedAt?: Record<string, string>;
}

export interface StaffRideView {
  kind: "staff";
  session: RideSession;
  route: Route;
  routeName: string;
  names: Record<string, string>;
  progress: {
    total: number;
    completed: number;
    skipped: number;
    remaining: number;
    etaToSchoolSec: number | null;
  };
  boardedCount: number;
  riderCount: number;
}

export interface FamilyRideView {
  kind: "family";
  id: string;
  routeId: string;
  routeName: string;
  direction: "to_school" | "to_home";
  startedAt: string;
  endedAt: string | null;
  busLocation: GeoPoint | null;
  schoolLocation: GeoPoint;
  geometry?: [number, number][];
  mine: {
    studentId: string;
    name: string;
    status: BoardingStatus;
    stopId: string;
    stopName: string;
    stopLocation: GeoPoint;
    etaSeconds: number | null;
    boardedAt: string | null;
  }[];
}

export type RideView = StaffRideView | FamilyRideView;
export const rideIdOf = (v: RideView) => (v.kind === "staff" ? v.session.id : v.id);
export const routeIdOf = (v: RideView) => (v.kind === "staff" ? v.session.routeId : v.routeId);

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface CompanyOverview {
  driverCode: string;
  busSpec?: BusSpec;
  drivers: { id: string; name: string; email: string }[];
  schools: {
    id: string;
    name: string;
    email: string;
    address?: string;
    location?: GeoPoint;
    studentCode: string;
  }[];
}

export interface SchoolStudent {
  id: string;
  name: string;
  email: string;
  assignments: { routeId: string; routeName: string; stopId: string; stopName: string }[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: Role;
  body: string;
  sentAt: string;
}
