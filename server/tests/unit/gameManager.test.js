import { describe, it, expect, beforeEach } from "vitest";
import { GameManager } from "../../src/game/gameManager.js";

function player(socketId, userId, username) {
  return { socketId, userId, username };
}

describe("GameManager", () => {
  let gm, white, black, gameId;

  beforeEach(() => {
    gm = new GameManager();
    const created = gm.createGame(player("s1", 1, "alice"), player("s2", 2, "bob"));
    gameId = created.gameId;
    white = created.colors["s1"] === "white" ? "s1" : "s2";
    black = white === "s1" ? "s2" : "s1";
  });

  it("assigns opposite colors to the two players", () => {
    const game = gm.games.get(gameId);
    expect(game.players.white).not.toBe(game.players.black);
  });

  it("rejects a move from the player who is not on turn", () => {
    const result = gm.makeMove(gameId, black, "e7", "e5");
    expect(result.error).toBe("It is not your turn");
  });

  it("accepts a legal opening move from white", () => {
    const result = gm.makeMove(gameId, white, "e2", "e4");
    expect(result.error).toBeUndefined();
    expect(result.turn).toBe("b");
    expect(result.status).toBe("ongoing");
  });

  it("rejects an illegal move", () => {
    const result = gm.makeMove(gameId, white, "e2", "e5");
    expect(result.error).toBe("Illegal move");
  });

  it("rejects a move from a socket not in the game", () => {
    const result = gm.makeMove(gameId, "stranger", "e2", "e4");
    expect(result.error).toBe("Player is not in this game");
  });

  it("resign awards the win to the opponent", () => {
    const winner = gm.resign(gameId, white);
    expect(winner).toBe(black);
    expect(gm.games.get(gameId).status).toBe("resignation");
  });

  it("detects checkmate via Fool's Mate and sets the winner", () => {
    gm.makeMove(gameId, white, "f2", "f3");
    gm.makeMove(gameId, black, "e7", "e5");
    gm.makeMove(gameId, white, "g2", "g4");
    const result = gm.makeMove(gameId, black, "d8", "h4");
    expect(result.status).toBe("checkmate");
    expect(result.winner).toBe(black);
  });

  it("a finished game rejects further moves", () => {
    gm.resign(gameId, white);
    const result = gm.makeMove(gameId, black, "e7", "e5");
    expect(result.error).toBe("Game is over");
  });
});