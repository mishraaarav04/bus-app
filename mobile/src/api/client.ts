// Thin fetch wrapper around the local server (see ../../server). No
// third-party API integration lives here on purpose — maps/SMS/push
// providers are left as TODOs for you to wire up later.

// Point this at your server's LAN address when testing on a real device
// (localhost won't resolve from a phone). Expo Go: use your machine's IP.
export const API_BASE_URL = "http://10.0.0.6:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (body: { contact: string; name: string; role: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  listRoutes: () => request("/routes"),

  startRide: (body: { routeId: string; driverId: string }) =>
    request("/rides/start", { method: "POST", body: JSON.stringify(body) }),

  getRide: (rideId: string) => request(`/rides/${rideId}`),

  pushBusLocation: (rideId: string, lat: number, lng: number) =>
    request(`/rides/${rideId}/location`, {
      method: "POST",
      body: JSON.stringify({ lat, lng }),
    }),

  pushStudentLocation: (studentId: string, lat: number, lng: number) =>
    request(`/students/${studentId}/location`, {
      method: "POST",
      body: JSON.stringify({ lat, lng }),
    }),

  markNotRiding: (rideId: string, studentId: string) =>
    request(`/rides/${rideId}/not-riding`, {
      method: "POST",
      body: JSON.stringify({ studentId }),
    }),

  departStop: (rideId: string, stopId: string) =>
    request(`/rides/${rideId}/depart-stop`, {
      method: "POST",
      body: JSON.stringify({ stopId }),
    }),

  getMessages: (conversationId: string) =>
    request(`/chat/conversations/${conversationId}/messages`),

  sendMessage: (
    conversationId: string,
    body: { senderId: string; senderRole: string; body: string }
  ) =>
    request(`/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
