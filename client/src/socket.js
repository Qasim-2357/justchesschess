import { io } from "socket.io-client";

// autoConnect is off — we only connect once we have a login token to send.
export const socket = io(
  import.meta.env.VITE_SERVER_URL || "http://localhost:3001",
  { autoConnect: false },
);