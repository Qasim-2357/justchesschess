import { describe, it, expect, beforeEach } from "vitest";
import { Queue, TOLERANCE_STAGES } from "../../src/game/matchmaking.js";

function player(socketId, userId, username, winRate) {
  return { socketId, userId, username, winRate };
}

describe("Queue (skill-based matchmaking)", () => {
  let queue;
  beforeEach(() => { queue = new Queue(); });

  it("does not match fewer than two waiting players", () => {
    queue.addPlayer(player("s1", 1, "a", 0.5));
    expect(queue.tryMatch()).toBeNull();
  });

  it("matches two players with an identical win rate immediately", () => {
    queue.addPlayer(player("s1", 1, "a", 0.5));
    queue.addPlayer(player("s2", 2, "b", 0.5));
    expect(queue.tryMatch()).not.toBeNull();
  });

  it("does NOT match two sockets belonging to the same account, even with equal win rate", () => {
    queue.addPlayer(player("s1", 1, "a", 0.5));
    queue.addPlayer(player("s2", 1, "a", 0.5));
    expect(queue.tryMatch()).toBeNull();
  });

  it("picks the CLOSEST win-rate opponent among several waiting players", () => {
    queue.addPlayer(player("s1", 1, "anchor", 0.80));
    queue.addPlayer(player("s2", 2, "far", 0.20));
    queue.addPlayer(player("s3", 3, "close", 0.75));
    const pair = queue.tryMatch();
    const ids = pair.map((p) => p.socketId).sort();
    expect(ids).toEqual(["s1", "s3"]);
  });

  it("does not match players far apart in win rate before tolerance widens", () => {
    queue.addPlayer(player("s1", 1, "top", 0.95));
    queue.addPlayer(player("s2", 2, "new", 0.10));
    expect(queue.tryMatch()).toBeNull();
  });

  it("matches players far apart in win rate once they've waited long enough", () => {
    queue.addPlayer(player("s1", 1, "top", 0.95));
    queue.addPlayer(player("s2", 2, "new", 0.10));

    const lastStage = TOLERANCE_STAGES[TOLERANCE_STAGES.length - 1];
    const longAgo = Date.now() - lastStage.afterMs - 1000;
    queue.entries.forEach((e) => { e.joinedAt = longAgo; });

    expect(queue.tryMatch()).not.toBeNull();
  });

  it("removePlayer takes a player out of the queue", () => {
    queue.addPlayer(player("s1", 1, "a", 0.5));
    queue.removePlayer("s1");
    queue.addPlayer(player("s2", 2, "b", 0.5));
    expect(queue.tryMatch()).toBeNull();
  });

  it("addPlayer ignores a duplicate call for the same socket", () => {
    queue.addPlayer(player("s1", 1, "a", 0.5));
    queue.addPlayer(player("s1", 1, "a", 0.5));
    expect(queue.entries.length).toBe(1);
  });
});