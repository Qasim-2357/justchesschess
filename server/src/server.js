import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { initDb } from "./db.js";
import { registerSocketHandlers } from "./socket.js";
import authRouter from "./routes/auth.js";

// Builds the app/http server/socket server without starting to listen.
// Used by both the real entrypoint and by tests.
export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

  app.use(cors({ origin: clientUrl }));
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/auth", authRouter);

  const io = new Server(server, { cors: { origin: clientUrl } });
  registerSocketHandlers(io);

  return { app, server, io };
}

// Initializes the database and starts listening on the given port.
export async function start(port = process.env.PORT || 3001) {
  await initDb();
  const { server } = createServer();
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`Server running on port ${port}`);
  return server;
}