import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { initDb } from "./db.js";
import { registerSocketHandlers } from "./socket.js";
import authRouter from "./routes/auth.js";

const app = express();
const server = http.createServer(app);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const port = process.env.PORT || 3001;

app.use(cors({ origin: clientUrl }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.use("/auth", authRouter);

const io = new Server(server, {
  cors: { origin: clientUrl },
});

await initDb();
registerSocketHandlers(io);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});