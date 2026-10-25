import type {
  AppNotification,
  AuditRow,
  CompanyOverview,
  PlaceResult,
  ReportSummary,
  RideView,
  Answer,
  Draft,
  Insights,
  LangText,
  RosterReport,
  Route,
  SchoolStudent,
  User,
} from "./types";

// Blank or missing VITE_API_URL falls back to the local server. A blank value would otherwise
// send requests to the website itself, which answers sign-in with a 405.
export const API_URL: string = ((import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:4000").trim().replace(/\/+$/, "");
// ngrok's free plan shows a warning page to browsers unless this header is sent.
const TUNNEL = { "ngrok-skip-browser-warning": "true" };

export interface Session {
  token: string;
  refreshToken: string;
  user: User;
}

const REFRESH_KEY = "routeiq.refresh";
let accessToken: string | null = null;
let refreshToken: string | null = safeGet(REFRESH_KEY);
let onSignedOut: (() => void) | null = null;
let onSession: ((s: Session) => void) | null = null;

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage blocked: the session just won't survive a reload */
  }
}

export const getAccessToken = () => accessToken;
export const hasSavedSession = () => Boolean(refreshToken);
export const setSignedOutHandler = (fn: (() => void) | null) => (onSignedOut = fn);
export const setSessionHandler = (fn: ((s: Session) => void) | null) => (onSession = fn);

export function adopt(s: { token: string; refreshToken: string }) {
  accessToken = s.token;
  refreshToken = s.refreshToken;
  safeSet(REFRESH_KEY, s.refreshToken);
}
export function forget() {
  accessToken = null;
  refreshToken = null;
  safeSet(REFRESH_KEY, null);
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any = null) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
/** Trade the saved refresh token for a new access token. False means "sign in again". */
export function refreshSession(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false);
  if (refreshing) return refreshing;
  const used = refreshToken;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...TUNNEL },
        body: JSON.stringify({ refreshToken: used }),
      });
      if (res.status === 400 || res.status === 401) return false;
      if (!res.ok) return accessToken !== null;
      const s = (await res.json()) as Session;
      adopt(s);
      onSession?.(s);
      return true;
    } catch {
      return accessToken !== null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
  noRetry?: boolean;
}

async function send(path: string, o: Options): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: o.method ?? (o.body !== undefined ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...TUNNEL,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the RouteIQ server. Check your connection and try again.", 0);
  }
}

async function go(path: string, o: Options): Promise<Response> {
  let res = await send(path, o);
  if (res.status === 401 && accessToken && !o.noRetry) {
    const before = accessToken;
    const ok = await refreshSession();
    if (ok && accessToken !== before) res = await send(path, o);
    else if (!ok) {
      forget();
      onSignedOut?.();
    }
  }
  return res;
}

async function request<T>(path: string, o: Options = {}): Promise<T> {
  const res = await go(path, o);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status, json);
  return json as T;
}

async function text(path: string): Promise<string> {
  const res = await go(path, {});
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

export const api = {
  login: (email: string, password: string) =>
    request<Session>("/auth/login", { body: { email, password }, noRetry: true }),
  logout: () => request("/auth/logout", { body: { refreshToken: refreshToken ?? undefined }, noRetry: true }),
  me: () => request<User>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<Session & { ok: boolean }>("/auth/change-password", { body: { currentPassword, newPassword } }),

  mapConfig: () => request<{ enabled: boolean; token: string | null }>("/map/config"),
  search: (q: string, near?: { lat: number; lng: number }) =>
    request<PlaceResult[]>(`/geo/search${qs({ q, lat: near?.lat, lng: near?.lng })}`),

  companyOverview: () => request<CompanyOverview>("/company/overview"),
  createSchool: (body: { name: string; email: string; password: string; address: string; location: { lat: number; lng: number } }) =>
    request("/company/schools", { body }),
  setBusSpec: (spec: { heightM: number; widthM: number; weightT: number }) =>
    request("/company/bus-spec", { method: "PUT", body: spec }),

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

  schoolStudents: () => request<{ studentCode: string; students: SchoolStudent[] }>("/school/students"),
  assignStudent: (routeId: string, studentId: string, stopId: string | null) =>
    request("/school/assignments", { body: { routeId, studentId, stopId } }),
  rosterPreview: (csv: string) => request<RosterReport>("/school/roster/preview", { body: { csv } }),
  rosterImport: (csv: string, sendInvites: boolean) =>
    request<RosterReport>("/school/roster/import", { body: { csv, sendInvites } }),

  activeRides: () => request<RideView[]>("/rides/active"),

  reportSummary: (from?: string, to?: string) => request<ReportSummary>(`/reports/summary${qs({ from, to })}`),
  ridesCsv: (from?: string, to?: string) => text(`/reports/rides.csv${qs({ from, to })}`),
  boardingsCsv: (from?: string, to?: string) => text(`/reports/boardings.csv${qs({ from, to })}`),
  audit: (before?: number) => request<AuditRow[]>(`/audit${qs({ before })}`),

  insights: (date?: string) => request<Insights>(`/ai/insights${qs({ date })}`),
  ask: (question: string) => request<Answer>("/ai/ask", { body: { question } }),
  draftAlert: (note: string, routeId?: string) => request<Draft>("/ai/draft-alert", { body: { note, routeId } }),
  announce: (routeId: string, text: { en: LangText; es?: LangText; pt?: LangText }) =>
    request<{ sent: number; routes: number }>("/announcements", { body: { routeId, text } }),

  notifications: () => request<{ items: AppNotification[]; unread: number }>("/notifications"),
  markNotificationsRead: () => request("/notifications/read", { body: {} }),
};
