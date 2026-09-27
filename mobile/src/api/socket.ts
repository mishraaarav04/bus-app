import { io } from "socket.io-client";
import { API_BASE_URL } from "./client";

// Single shared socket for the app session. Connect once, near the root
// (see App.tsx), and reuse everywhere via this export.
export const socket = io(API_BASE_URL, { autoConnect: false });
