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
  it("ranks a proven high win-rate player above a small-sample perfect record", async () => {
    const provenUser = `test_${randomUUID().slice(0, 8)}`; // 8-2, 80%
    const luckyUser = `test_${randomUUID().slice(0, 8)}`;  // 1-0, 100%, too few games
    await signup(provenUser);
    await signup(luckyUser);

    await pool.query("UPDATE users SET wins = 8, losses = 2 WHERE username = $1", [provenUser]);
    await pool.query("UPDATE users SET wins = 1, losses = 0 WHERE username = $1", [luckyUser]);

    const res = await fetch(`${SERVER_URL}/leaderboard`);
    const data = await res.json();

    const usernames = data.leaderboard.map((r) => r.username);
    expect(usernames).toContain(provenUser);
    expect(usernames).not.toContain(luckyUser);
  });

  it("orders qualified players by win rate, not raw win count", async () => {
    const higherRate = `test_${randomUUID().slice(0, 8)}`; // 5-1, 83%
    const lowerRate = `test_${randomUUID().slice(0, 8)}`;  // 6-6, 50%
    await signup(higherRate);
    await signup(lowerRate);

    await pool.query("UPDATE users SET wins = 5, losses = 1 WHERE username = $1", [higherRate]);
    await pool.query("UPDATE users SET wins = 6, losses = 6 WHERE username = $1", [lowerRate]);

    const res = await fetch(`${SERVER_URL}/leaderboard`);
    const data = await res.json();

    const higherIndex = data.leaderboard.findIndex((r) => r.username === higherRate);
    const lowerIndex = data.leaderboard.findIndex((r) => r.username === lowerRate);
    expect(higherIndex).toBeGreaterThanOrEqual(0);
    expect(lowerIndex).toBeGreaterThan(higherIndex);
  });

  it("only returns username, wins, losses, games, win_rate — never password_hash or id", async () => {
    const res = await fetch(`${SERVER_URL}/leaderboard`);
    const data = await res.json();
    if (data.leaderboard.length > 0) {
      expect(data.leaderboard[0]).not.toHaveProperty("password_hash");
      expect(data.leaderboard[0]).not.toHaveProperty("id");
    }
  });
});