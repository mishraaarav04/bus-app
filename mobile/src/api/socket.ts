import { io, Socket } from "socket.io-client";
import { API_BASE_URL, getAuthToken } from "./client";

let socket: Socket | null = null;

/**
 * One authenticated socket per signed-in session. `auth` is a function so every
 * reconnect presents the current (possibly refreshed) access token.
 */
export function connectSocket(): Socket {
  socket?.disconnect();
  socket = io(API_BASE_URL, {
    auth: (cb) => cb({ token: getAuthToken() ?? "" }),
    transports: ["websocket"],
    reconnection: true,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
