import { describe, it, expect, beforeEach } from "vitest";
import { Queue } from "../../src/game/matchmaking.js";

describe("Queue", () => {
  let queue;
  beforeEach(() => { queue = new Queue(); });

  it("does not match fewer than two waiting players", () => {
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    expect(queue.tryMatch()).toBeNull();
  });

  it("matches two different users FIFO", () => {
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    queue.addPlayer({ socketId: "s2", userId: 2, username: "b" });
    const pair = queue.tryMatch();
    expect(pair.map((p) => p.socketId)).toEqual(["s1", "s2"]);
  });

  it("does NOT match two sockets belonging to the same account", () => {
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    queue.addPlayer({ socketId: "s2", userId: 1, username: "a" });
    expect(queue.tryMatch()).toBeNull();
  });

  it("skips over a same-account duplicate to match a different waiting user", () => {
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    queue.addPlayer({ socketId: "s2", userId: 1, username: "a" });
    queue.addPlayer({ socketId: "s3", userId: 2, username: "b" });
    const pair = queue.tryMatch();
    const ids = pair.map((p) => p.socketId);
    expect(ids).toContain("s1");
    expect(ids).toContain("s3");
  });

  it("removePlayer takes a player out of the queue", () => {
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    queue.removePlayer("s1");
    queue.addPlayer({ socketId: "s2", userId: 2, username: "b" });
    expect(queue.tryMatch()).toBeNull();
  });

  it("addPlayer ignores a duplicate call for the same socket", () => {
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    queue.addPlayer({ socketId: "s1", userId: 1, username: "a" });
    expect(queue.entries.length).toBe(1);
  });
});