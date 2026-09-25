import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const port = process.env.PORT || 3001;

app.use(cors({ origin: clientUrl }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

const io = new Server(server, {
  cors: { origin: clientUrl },
});

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`Disconnected: ${socket.id}`));
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


