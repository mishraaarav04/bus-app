import Constants from "expo-constants";
import type {
  CompanyOverview,
  PlaceResult,
  RideView,
  Route,
  SchoolStudent,
  User,
  ChatMessage,
} from "../types";

// The server address is figured out automatically from the Expo dev server, so
// you don't have to edit this when your computer's IP changes. Override with
// EXPO_PUBLIC_API_URL, or edit MANUAL_API_URL if you use `--tunnel`.
const MANUAL_API_URL = "http://10.0.0.79:4000";

function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  const isLanHost = host && /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  return isLanHost ? `http://${host}:4000` : MANUAL_API_URL;
}

export const API_BASE_URL = resolveBaseUrl();

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setAuthToken = (t: string | null) => {
  authToken = t;
};
export const getAuthToken = () => authToken;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the Wheelie server. Is it running and on the same Wi-Fi?", 0);
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status);
  }
  return json as T;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", { body: { email, password } }),
  signup: (body: Record<string, string>) =>
    request<{ token: string; user: User }>("/auth/signup", { body }),
  me: () => request<User>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request("/auth/change-password", { body: { currentPassword, newPassword } }),
  parentChildren: () => request<{ id: string; name: string }[]>("/parent/children"),
  linkChild: (childCode: string) =>
    request<{ id: string; name: string }>("/parent/children", { body: { childCode } }),
  rotateLinkCode: () =>
    request<{ linkCode: string }>("/students/me/link-code/rotate", { body: {} }),

  // maps
  mapConfig: () => request<{ enabled: boolean; token: string | null }>("/map/config"),
  search: (q: string, near?: { lat: number; lng: number }) =>
    request<PlaceResult[]>(
      `/geo/search?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lng=${near.lng}` : ""}`
    ),

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
    stops: { name: string; location: { lat: number; lng: number } }[];
  }) => request<Route>("/routes", { body }),
  sendRoute: (id: string) => request<Route>(`/routes/${id}/send`, { body: {} }),
  assignDriver: (id: string, driverId: string | null) =>
    request<Route>(`/routes/${id}/driver`, { method: "PUT", body: { driverId } }),
  deleteRoute: (id: string) => request(`/routes/${id}`, { method: "DELETE" }),

  // school
  schoolStudents: () =>
    request<{ studentCode: string; students: SchoolStudent[] }>("/school/students"),
  assignStudent: (routeId: string, studentId: string, stopId: string | null) =>
    request("/school/assignments", { body: { routeId, studentId, stopId } }),

  // rides
  activeRides: () => request<RideView[]>("/rides/active"),
  startRide: (routeId: string) => request<RideView>("/rides/start", { body: { routeId } }),
  pushLocation: (rideId: string, lat: number, lng: number) =>
    request(`/rides/${rideId}/location`, { body: { lat, lng } }),
  endRide: (rideId: string) => request<RideView>(`/rides/${rideId}/end`, { body: {} }),
  departStop: (rideId: string, stopId: string) =>
    request<RideView>(`/rides/${rideId}/depart-stop`, { body: { stopId } }),
  markNotRiding: (rideId: string, studentId: string) =>
    request<{ rerouted: boolean }>(`/rides/${rideId}/not-riding`, { body: { studentId } }),
  boardingToken: () =>
    request<{ token: string; expiresInSec: number }>("/students/me/boarding-token"),
  checkin: (rideId: string, token: string) =>
    request<{ name: string; alreadyBoarded: boolean }>(`/rides/${rideId}/checkin`, {
      body: { token },
    }),

  // chat
  getMessages: (conversationId: string) =>
    request<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, body: string) =>
    request<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { body: { body } }),
};
