import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { initDb } from "./db.js";
import { registerSocketHandlers } from "./socket.js";
import authRouter from "./routes/auth.js";
import leaderboardRouter from "./routes/leaderboard.js";

export function validateEnvironment() {
  const missing = [
    "DATABASE_URL",
    "JWT_SECRET",
    "CLIENT_URL",
  ].filter((key) => !process.env[key] || !process.env[key].trim());

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  let databaseUrl;

  try {
    databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (
    databaseUrl.protocol !== "postgres:" &&
    databaseUrl.protocol !== "postgresql:"
  ) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  try {
    new URL(process.env.CLIENT_URL);
  } catch {
    throw new Error("CLIENT_URL must be a valid absolute URL");
  }

  return true;
}

// Builds the app/http server/socket server without starting to listen.
// Used by both the real entrypoint and by tests.
export function createServer() {
  validateEnvironment();

  const app = express();
  const server = http.createServer(app);
  const clientUrl = process.env.CLIENT_URL;

  app.use(cors({ origin: clientUrl }));
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/auth", authRouter);
  app.use("/leaderboard", leaderboardRouter);

  const io = new Server(server, { cors: { origin: clientUrl } });
  registerSocketHandlers(io);

  return { app, server, io };
}

// Initializes the database and starts listening on the given port.
export async function start(port = process.env.PORT || 3001) {
  validateEnvironment();
  await initDb();
  const { server } = createServer();
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`Server running on port ${port}`);
  return server;
}