import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { io as ioClient } from "socket.io-client";
import { createServer } from "../../src/server.js";
import { initDb, pool } from "../../src/db.js";

const TEST_PORT = 4001;
const SERVER_URL = `http://localhost:${TEST_PORT}`;
let httpServer;

async function signup(username) {
  const res = await fetch(`${SERVER_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });
  if (!res.ok) throw new Error(`signup failed: ${res.status}`);
  return res.json();
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, { auth: { token }, autoConnect: false });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
    socket.connect();
  });
}

// Creates the socket object and registers a listener for an event the
// server might emit immediately on connection, BEFORE actually connecting —
// otherwise a same-tick server emit can be missed.
function connectSocketAndCatch(token, event, timeoutMs = 5000) {
  const socket = ioClient(SERVER_URL, { auth: { token }, autoConnect: false });
  const caught = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
  const connected = new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  socket.connect();
  return { socket, connected, caught };
}

function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  await initDb();
  const { server } = createServer();
  httpServer = server;
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  // Let any fire-and-forget background writes (like recording a forfeit
  // from a disconnect timer) finish before closing the database pool.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await pool.end();
});

describe("full game flow", () => {
  it("matches two different accounts, syncs a move, and records the result on resign", async () => {
    const usernameA = `test_${randomUUID().slice(0, 8)}`;
    const usernameB = `test_${randomUUID().slice(0, 8)}`;
    const accountA = await signup(usernameA);
    const accountB = await signup(usernameB);

    const socketA = await connectSocket(accountA.token);
    const socketB = await connectSocket(accountB.token);

    try {
      const startA = waitFor(socketA, "game:start");
      const startB = waitFor(socketB, "game:start");
      socketA.emit("queue:join");
      socketB.emit("queue:join");
      const [dataA, dataB] = await Promise.all([startA, startB]);

      expect(dataA.gameId).toBe(dataB.gameId);
      expect(dataA.color).not.toBe(dataB.color);

      const white = dataA.color === "white" ? socketA : socketB;
      const black = dataA.color === "white" ? socketB : socketA;
      const whiteData = dataA.color === "white" ? dataA : dataB;
      const whiteUsername = white === socketA ? usernameA : usernameB;

      const updateWhite = waitFor(white, "game:update");
      const updateBlack = waitFor(black, "game:update");
      white.emit("game:move", { gameId: whiteData.gameId, from: "e2", to: "e4" });
      const [updA, updB] = await Promise.all([updateWhite, updateBlack]);
      expect(updA.turn).toBe("b");
      expect(updB.turn).toBe("b");

      const overWhite = waitFor(white, "game:over");
      const overBlack = waitFor(black, "game:over");
      black.emit("game:resign", { gameId: whiteData.gameId });
      const [overA] = await Promise.all([overWhite, overBlack]);
      expect(overA.status).toBe("resignation");
      expect(overA.winner).toBe(white.id);

      const result = await pool.query(
        "SELECT wins, losses FROM users WHERE username = $1",
        [whiteUsername],
      );
      expect(result.rows[0].wins).toBe(1);
    } finally {
      socketA.close();
      socketB.close();
    }
  });

  it("refuses to match the same account against itself in two tabs", async () => {
    const username = `test_${randomUUID().slice(0, 8)}`;
    const account = await signup(username);

    const socketA = await connectSocket(account.token);
    const socketB = await connectSocket(account.token);

    try {
      let matched = false;
      socketA.once("game:start", () => { matched = true; });
      socketB.once("game:start", () => { matched = true; });

      socketA.emit("queue:join");
      socketB.emit("queue:join");

      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(matched).toBe(false);
    } finally {
      socketA.close();
      socketB.close();
    }
  });

  it("lets a disconnected player rejoin once, then forfeits on a second disconnect", async () => {
    const usernameA = `test_${randomUUID().slice(0, 8)}`;
    const usernameB = `test_${randomUUID().slice(0, 8)}`;
    const accountA = await signup(usernameA);
    const accountB = await signup(usernameB);

    let socketA = await connectSocket(accountA.token);
    const socketB = await connectSocket(accountB.token);

    try {
      const startA = waitFor(socketA, "game:start");
      const startB = waitFor(socketB, "game:start");
      socketA.emit("queue:join");
      socketB.emit("queue:join");
      const [dataA] = await Promise.all([startA, startB]);
      const gameId = dataA.gameId;

      const opponentGone = waitFor(socketB, "opponent:disconnected");
      socketA.close();
      await opponentGone;

      // Register the resume_prompt listener BEFORE connecting, since the
      // server may emit it in the same tick as the connection is accepted.
      const reconnectAttempt = connectSocketAndCatch(accountA.token, "game:resume_prompt");
      socketA = reconnectAttempt.socket;
      await reconnectAttempt.connected;
      const resumePrompt = await reconnectAttempt.caught;
      expect(resumePrompt.gameId).toBe(gameId);

      const reconnectedB = waitFor(socketB, "opponent:reconnected");
      const resumeA = waitFor(socketA, "game:resume");
      socketA.emit("game:rejoin_confirm", { gameId });
      await Promise.all([resumeA, reconnectedB]);

      const overB = waitFor(socketB, "game:over", 5000);
      socketA.close();
      const overResult = await overB;
      expect(overResult.status).toBe("resignation");
    } finally {
      socketA.close();
      socketB.close();
    }
  });
});