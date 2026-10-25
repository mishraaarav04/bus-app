// Mirrors server/src/types.ts (views the server sends). Kept by hand.

export type Role = "student" | "parent" | "driver" | "company" | "admin";
export type Lang = "en" | "es" | "pt";

export interface NotifPrefs {
  approaching: boolean;
  boarding: boolean;
  delays: boolean;
}

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
  emailVerified: boolean;
  lang: Lang;
  notifPrefs: NotifPrefs;
  requiresAdultPickup?: boolean;
  authorizedPickups?: string[];
}

export interface Child {
  id: string;
  name: string;
  requiresAdultPickup: boolean;
  authorizedPickups: string[];
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
  startTime?: string;
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

export interface DropOff {
  at: string;
  stopId: string | null;
  handedTo?: string;
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
  droppedAt?: Record<string, DropOff>;
  delayForecastMin?: number;
}

export type IncidentType = "delay" | "breakdown" | "accident" | "other" | "off_route" | "stopped";

export interface Incident {
  id: string;
  rideId: string;
  routeId: string;
  type: IncidentType;
  source: "driver" | "system";
  delayMinutes: number | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface FamilyIncident {
  type: IncidentType;
  delayMinutes: number | null;
  createdAt: string;
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
  incident: Incident | null;
  alerts: Incident[];
  studentFlags: Record<string, { requiresAdultPickup: boolean; authorizedPickups: string[] }>;
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
  incident: FamilyIncident | null;
  mine: {
    studentId: string;
    name: string;
    status: BoardingStatus;
    stopId: string;
    stopName: string;
    stopLocation: GeoPoint;
    etaSeconds: number | null;
    boardedAt: string | null;
    droppedAt: string | null;
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
  claimed: boolean;
  linkCode?: string;
  tagId?: string;
  assignments: { routeId: string; routeName: string; stopId: string; stopName: string }[];
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
  studentName: string;
  date: string;
  direction: "to_school" | "to_home" | "both";
}

export interface CheckinResult {
  name: string;
  alreadyBoarded: boolean;
  duplicate?: boolean;
  warning?: { code: string; message: string };
}

export interface ReportTotals {
  rides: number;
  riders: number;
  boarded: number;
  missed: number;
  skipped: number;
  dropped: number;
  incidents: number;
  boardedPct: number | null;
  scheduledRides: number;
  onTimeRides: number;
  avgLateMin: number | null;
}

export interface ReportSummary {
  from: string;
  to: string;
  totals: ReportTotals;
  routes: (ReportTotals & { routeId: string; routeName: string })[];
  rides: {
    rideId: string;
    routeName: string;
    direction: "to_school" | "to_home";
    driverName: string | null;
    date: string;
    startedAt: string;
    endedAt: string;
    lateMin: number | null;
    riders: number;
    boarded: number;
    missed: number;
    skipped: number;
    incidents: number;
  }[];
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

export interface HistoryEvent {
  date: string;
  routeName: string;
  direction: "to_school" | "to_home";
  stopName: string | null;
  status: BoardingStatus;
  boardedAt: string | null;
  droppedAt: string | null;
}

export interface RouteForecast {
  routeId: string;
  routeName: string;
  direction: "to_school" | "to_home";
  startTime: string | null;
  assigned: number;
  expected: number;
  plannedAbsences: number;
  unlikely: number;
  basedOnRides: number;
}

export interface Anomaly {
  id: string;
  kind: "slow_ride" | "late_trend" | "stopped_riding" | "incident_cluster";
  routeId: string;
  routeName: string;
  title: string;
  detail: string;
}

export interface Suggestion {
  id: string;
  kind: "merge_stops" | "overlap" | "consolidate" | "overloaded";
  routeIds: string[];
  title: string;
  detail: string;
}

export interface Insights {
  date: string;
  tomorrow: string;
  llm: boolean;
  forecast: RouteForecast[];
  anomalies: Anomaly[];
  suggestions: Suggestion[];
  etaAccuracy: { samples: number; learnedErrorSec: number | null; baselineErrorSec: number | null; improvementPct: number | null };
}

export interface Answer {
  answer: string;
  mode: "ai" | "basic";
  note?: string;
}

export type LangText = { title: string; body: string };
export interface Draft {
  draft: { en: LangText; es?: LangText; pt?: LangText };
  mode: "ai" | "basic";
  note?: string;
}
