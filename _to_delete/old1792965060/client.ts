import Constants from "expo-constants";
import type {
  Absence,
  AppNotification,
  AuditRow,
  Child,
  CheckinResult,
  CompanyOverview,
  HistoryEvent,
  Incident,
  IncidentType,
  Lang,
  NotifPrefs,
  PlaceResult,
  ReportSummary,
  RideView,
  RosterReport,
  Route,
  SchoolStudent,
  User,
} from "../types";

// The server address is figured out automatically from the Expo dev server, so
// you don't have to edit this when your computer's IP changes. Override with
// EXPO_PUBLIC_API_URL (set it to your https:// address in production), or edit
// MANUAL_API_URL if you use `--tunnel`.
const MANUAL_API_URL = "http://10.0.0.79:4000";

function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  const isLanHost = host && /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  return isLanHost ? `http://${host}:4000` : MANUAL_API_URL;
}

export const API_BASE_URL = resolveBaseUrl();

export interface Session {
  token: string;
  refreshToken: string;
  user: User;
}

// ---- session state -------------------------------------------------------------------------

let authToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let onRefreshed: ((s: Session) => void) | null = null;

export const setAuthToken = (t: string | null) => {
  authToken = t;
};
export const getAuthToken = () => authToken;
export const setRefreshToken = (t: string | null) => {
  refreshToken = t;
};
export const getRefreshToken = () => refreshToken;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};
/** Called after a silent token refresh so the app can store the new tokens and reconnect. */
export const setRefreshedHandler = (fn: ((s: Session) => void) | null) => {
  onRefreshed = fn;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** The raw JSON body, for errors that carry extra fields (e.g. `code`, `students`). */
    public body: any = null
  ) {
    super(message);
  }
  get code(): string | undefined {
    return this.body?.code;
  }
}

// ---- refresh (single flight: many requests failing at once trigger one refresh) ------------

let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false);
  if (refreshing) return refreshing;
  const used = refreshToken;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ refreshToken: used }),
      });
      if (res.status === 401 || res.status === 400) return false; // refresh token is dead
      if (!res.ok) return authToken !== null; // server hiccup: keep the session
      const s = (await res.json()) as Session;
      authToken = s.token;
      refreshToken = s.refreshToken;
      onRefreshed?.(s);
      return true;
    } catch {
      return authToken !== null; // offline: keep the session, try again later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---- request helpers -----------------------------------------------------------------------

interface Options {
  method?: string;
  body?: unknown;
  /** Skip the refresh-and-retry dance (used for the auth calls themselves). */
  noRetry?: boolean;
}

async function send(path: string, options: Options): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the RouteIQ server. Check your connection and try again.", 0);
  }
}

async function withRefresh(path: string, options: Options): Promise<Response> {
  let res = await send(path, options);
  if (res.status === 401 && authToken && !options.noRetry) {
    const before = authToken;
    const ok = await refreshSession();
    if (ok && authToken && authToken !== before) {
      res = await send(path, options);
    } else if (!ok) {
      onUnauthorized?.();
    }
    if (res.status === 401 && authToken && !refreshToken) onUnauthorized?.();
  }
  return res;
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const res = await withRefresh(path, options);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status, json);
  }
  return json as T;
}

async function requestText(path: string): Promise<string> {
  const res = await withRefresh(path, {});
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = (await res.json())?.error ?? msg;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status);
  }
  return res.text();
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

// ---- endpoints -----------------------------------------------------------------------------

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<Session>("/auth/login", { body: { email, password }, noRetry: true }),
  signup: (body: Record<string, unknown>) => request<Session>("/auth/signup", { body, noRetry: true }),
  logout: (token: string | null) => request("/auth/logout", { body: { refreshToken: token ?? undefined }, noRetry: true }),
  me: () => request<User>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<Session & { ok: boolean }>("/auth/change-password", { body: { currentPassword, newPassword } }),
  forgotPassword: (email: string) => request("/auth/forgot", { body: { email }, noRetry: true }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    request("/auth/reset", { body: { email, code, newPassword }, noRetry: true }),
  verifyEmail: (code: string) => request("/auth/verify-email", { body: { code } }),
  resendVerification: () => request("/auth/resend-verification", { body: {} }),
  savePreferences: (p: { lang?: Lang; notifPrefs?: Partial<NotifPrefs> }) =>
    request<User>("/auth/me/preferences", { method: "PUT", body: p }),
  exportMyData: () => requestText("/auth/me/export"),
  deleteAccount: (password: string) => request("/auth/me", { method: "DELETE", body: { password } }),
  legal: () => request<{ termsVersion: string; privacyUrl: string | null; termsUrl: string | null }>("/legal"),

  // parent / student
  parentChildren: () => request<Child[]>("/parent/children"),
  linkChild: (childCode: string) => request<Child>("/parent/children", { body: { childCode } }),
  unlinkChild: (id: string) => request(`/parent/children/${id}`, { method: "DELETE" }),
  childSettings: (id: string, s: { requiresAdultPickup?: boolean; authorizedPickups?: string[] }) =>
    request<Child>(`/parent/children/${id}/settings`, { method: "PUT", body: s }),
  rotateLinkCode: () => request<{ linkCode: string }>("/students/me/link-code/rotate", { body: {} }),
  history: (studentId: string, days = 30) =>
    request<{ studentName: string; events: HistoryEvent[] }>(`/students/${studentId}/history?days=${days}`),

  // absences ("not riding" planned ahead)
  absences: () => request<Absence[]>("/absences"),
  addAbsence: (a: { studentId: string; date: string; direction: "to_school" | "to_home" | "both" }) =>
    request("/absences", { body: a }),
  removeAbsence: (a: { studentId: string; date: string; direction: "to_school" | "to_home" | "both" }) =>
    request("/absences", { method: "DELETE", body: a }),

  // notifications
  registerPush: (token: string, platform: "ios" | "android") =>
    request("/push/register", { body: { token, platform } }),
  unregisterPush: (token: string) => request("/push/register", { method: "DELETE", body: { token } }),
  notifications: () => request<{ items: AppNotification[]; unread: number }>("/notifications"),
  markNotificationsRead: () => request("/notifications/read", { body: {} }),

  // maps
  mapConfig: () => request<{ enabled: boolean; token: string | null }>("/map/config"),
  search: (q: string, near?: { lat: number; lng: number }) =>
    request<PlaceResult[]>(`/geo/search${qs({ q, lat: near?.lat, lng: near?.lng })}`),

  // company
  companyOverview: () => request<CompanyOverview>("/company/overview"),
  createSchool: (body: {
    name: string;
    email: string;
    password: string;
    address: string;
    location: { lat: number; lng: number };
  }) => request("/company/schools", { body }),
  setBusSpec: (spec: { heightM: number; widthM: number; weightT: number }) =>
    request("/company/bus-spec", { method: "PUT", body: spec }),

  // routes
  listRoutes: () => request<Route[]>("/routes"),
  createRoute: (body: {
    name: string;
    schoolId: string;
    direction: "to_school" | "to_home";
    vehicle?: { heightM: number; widthM: number; weightT: number };
    startTime?: string;
    stops: { name: string; location: { lat: number; lng: number } }[];
  }) => request<Route>("/routes", { body }),
  sendRoute: (id: string) => request<Route>(`/routes/${id}/send`, { body: {} }),
  setSchedule: (id: string, startTime: string | null) =>
    request<Route>(`/routes/${id}/schedule`, { method: "PUT", body: { startTime } }),
  assignDriver: (id: string, driverId: string | null) =>
    request<Route>(`/routes/${id}/driver`, { method: "PUT", body: { driverId } }),
  deleteRoute: (id: string) => request(`/routes/${id}`, { method: "DELETE" }),

  // school
  schoolStudents: () => request<{ studentCode: string; students: SchoolStudent[] }>("/school/students"),
  assignStudent: (routeId: string, studentId: string, stopId: string | null) =>
    request("/school/assignments", { body: { routeId, studentId, stopId } }),
  rosterPreview: (csv: string) => request<RosterReport>("/school/roster/preview", { body: { csv } }),
  rosterImport: (csv: string, sendInvites: boolean) =>
    request<RosterReport>("/school/roster/import", { body: { csv, sendInvites } }),

  // reports (company + school)
  reportSummary: (from?: string, to?: string) => request<ReportSummary>(`/reports/summary${qs({ from, to })}`),
  ridesCsv: (from?: string, to?: string) => requestText(`/reports/rides.csv${qs({ from, to })}`),
  boardingsCsv: (from?: string, to?: string) => requestText(`/reports/boardings.csv${qs({ from, to })}`),
  audit: (before?: number) => request<AuditRow[]>(`/audit${qs({ before })}`),

  // rides
  activeRides: () => request<RideView[]>("/rides/active"),
  startRide: (routeId: string) =>
    request<RideView & { locationToken?: string }>("/rides/start", { body: { routeId } }),
  locationToken: (rideId: string) =>
    request<{ locationToken: string }>(`/rides/${rideId}/location-token`, { body: {} }),
  pushLocation: (rideId: string, lat: number, lng: number) =>
    request(`/rides/${rideId}/location`, { body: { lat, lng } }),
  endRide: (rideId: string, force = false) =>
    request<RideView>(`/rides/${rideId}/end`, { body: force ? { force: true } : {} }),
  departStop: (rideId: string, stopId: string) =>
    request<RideView>(`/rides/${rideId}/depart-stop`, { body: { stopId } }),
  markNotRiding: (rideId: string, studentId: string) =>
    request<{ rerouted: boolean }>(`/rides/${rideId}/not-riding`, { body: { studentId } }),
  reportIncident: (rideId: string, i: { type: Exclude<IncidentType, "off_route" | "stopped">; delayMinutes?: number; note?: string }) =>
    request<Incident>(`/rides/${rideId}/incidents`, { body: i }),
  resolveIncident: (rideId: string, incidentId: string) =>
    request(`/rides/${rideId}/incidents/${incidentId}/resolve`, { body: {} }),
  dropoff: (rideId: string, studentId: string, handedTo?: string) =>
    request<{ ok: boolean; warning?: { code: string } }>(`/rides/${rideId}/dropoff`, {
      body: { studentId, handedTo },
    }),
  boardingToken: () => request<{ token: string; expiresInSec: number }>("/students/me/boarding-token"),
  checkin: (rideId: string, body: { token?: string; tagId?: string; studentId?: string; scanId?: string; scannedAt?: string }) =>
    request<CheckinResult>(`/rides/${rideId}/checkin`, { body }),
};
