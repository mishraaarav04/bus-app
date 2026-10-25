import { io, Socket } from "socket.io-client";
import { API_URL, getAccessToken } from "./api";

let socket: Socket | null = null;

/** One live connection per signed-in session; reconnects use the current token. */
export function connectSocket(): Socket {
  socket?.disconnect();
  socket = io(API_URL, {
    auth: (cb) => cb({ token: getAccessToken() ?? "" }),
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
