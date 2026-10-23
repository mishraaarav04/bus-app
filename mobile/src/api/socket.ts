import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "./client";

let socket: Socket | null = null;

/** One authenticated socket per signed-in session. */
export function connectSocket(token: string): Socket {
  socket?.disconnect();
  socket = io(API_BASE_URL, { auth: { token }, transports: ["websocket"], reconnection: true });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
