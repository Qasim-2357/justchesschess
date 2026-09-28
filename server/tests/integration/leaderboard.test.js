import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "../../src/server.js";
import { initDb, pool } from "../../src/db.js";

const TEST_PORT = 4002;
const SERVER_URL = `http://localhost:${TEST_PORT}`;
let httpServer;

async function signup(username) {
  const res = await fetch(`${SERVER_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });
  return res.json();
}

beforeAll(async () => {
  await initDb();
  const { server } = createServer();
  httpServer = server;
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await pool.end();
});

describe("GET /leaderboard", () => {
  it("returns users sorted by wins, descending", async () => {
    const topUser = `test_${randomUUID().slice(0, 8)}`;
    const midUser = `test_${randomUUID().slice(0, 8)}`;
    await signup(topUser);
    await signup(midUser);

    await pool.query("UPDATE users SET wins = 5, losses = 1 WHERE username = $1", [topUser]);
    await pool.query("UPDATE users SET wins = 2, losses = 3 WHERE username = $1", [midUser]);

    const res = await fetch(`${SERVER_URL}/leaderboard`);
    const data = await res.json();

    const topIndex = data.leaderboard.findIndex((r) => r.username === topUser);
    const midIndex = data.leaderboard.findIndex((r) => r.username === midUser);
    expect(topIndex).toBeGreaterThanOrEqual(0);
    expect(midIndex).toBeGreaterThan(topIndex);
  });

  it("only returns username, wins, and losses — never password_hash", async () => {
    const res = await fetch(`${SERVER_URL}/leaderboard`);
    const data = await res.json();
    if (data.leaderboard.length > 0) {
      expect(data.leaderboard[0]).not.toHaveProperty("password_hash");
      expect(data.leaderboard[0]).not.toHaveProperty("id");
    }
  });
});