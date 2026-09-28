import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";

const INITIAL_TIME_MS = 10 * 60 * 1000;

// Owns active chess games, player assignments, move validation, and clocks.
export class GameManager {
  constructor() {
    this.games = new Map();
    this.socketGames = new Map();
  }

  // Creates a UUID-keyed game and randomly assigns white and black.
  createGame(firstSocketId, secondSocketId) {
    if (firstSocketId === secondSocketId) {
      throw new Error("A game requires two different players");
    }

    const [white, black] = Math.random() < 0.5
      ? [firstSocketId, secondSocketId]
      : [secondSocketId, firstSocketId];
    const gameId = randomUUID();
    const game = {
      gameId,
      players: { white, black },
      chess: new Chess(),
      clocks: { white: INITIAL_TIME_MS, black: INITIAL_TIME_MS },
      lastTickAt: Date.now(),
      status: "ongoing",
      winner: null,
    };

    this.games.set(gameId, game);
    this.socketGames.set(white, gameId);
    this.socketGames.set(black, gameId);

    return {
      gameId,
      players: { ...game.players },
      colors: { [white]: "white", [black]: "black" },
      fen: game.chess.fen(),
      timeMs: INITIAL_TIME_MS,
    };
  }

  // Applies a legal move for the player whose turn it is, or returns an error.
  makeMove(gameId, socketId, from, to, promotion) {
    const game = this.games.get(gameId);
    if (!game) return { error: "Game not found" };
    if (game.status !== "ongoing") return { error: "Game is over" };

    const clock = this.checkTime(gameId);
    if (clock.flagFallen) {
      return {
        error: "Flag fallen",
        flagFallen: true,
        fen: game.chess.fen(),
        status: game.status,
        winner: game.winner,
        clocks: { ...game.clocks },
      };
    }

    const color = this.getColor(game, socketId);
    if (!color) return { error: "Player is not in this game" };
    const turn = game.chess.turn();
    if ((color === "white" ? "w" : "b") !== turn) {
      return { error: "It is not your turn" };
    }

    try {
      const move = { from, to };
      if (promotion) move.promotion = promotion;
      game.chess.move(move);
    } catch {
      return { error: "Illegal move" };
    }

    game.lastTickAt = Date.now();
    game.status = this.getChessStatus(game.chess);
    if (game.status === "checkmate") game.winner = socketId;

    return {
      fen: game.chess.fen(),
      status: game.status,
      turn: game.chess.turn(),
      clocks: { ...game.clocks },
      winner: game.winner,
    };
  }

  // Ends a game by resignation and returns the winning socket ID, or null.
  resign(gameId, socketId) {
    const game = this.games.get(gameId);
    if (!game || game.status !== "ongoing") return null;

    const color = this.getColor(game, socketId);
    if (!color) return null;

    const clock = this.checkTime(gameId);
    if (clock.flagFallen) return game.winner;

    game.status = "resignation";
    game.winner = game.players[color === "white" ? "black" : "white"];
    return game.winner;
  }

  // Updates the active player's remaining time and reports whether it expired.
  checkTime(gameId) {
    const game = this.games.get(gameId);
    if (!game) return { flagFallen: false, clocks: null, winner: null };
    if (game.status !== "ongoing") {
      return { flagFallen: false, clocks: { ...game.clocks }, winner: game.winner };
    }

    const now = Date.now();
    const activeColor = game.chess.turn() === "w" ? "white" : "black";
    game.clocks[activeColor] = Math.max(
      0,
      game.clocks[activeColor] - (now - game.lastTickAt),
    );
    game.lastTickAt = now;

    if (game.clocks[activeColor] === 0) {
      game.status = "timeout";
      game.winner = game.players[activeColor === "white" ? "black" : "white"];
      return { flagFallen: true, clocks: { ...game.clocks }, winner: game.winner };
    }

    return { flagFallen: false, clocks: { ...game.clocks }, winner: null };
  }

  // Finds a player's color in a game, or null when they are not a participant.
  getColor(game, socketId) {
    if (game.players.white === socketId) return "white";
    if (game.players.black === socketId) return "black";
    return null;
  }

  // Maps the chess.js position to the public game status values.
  getChessStatus(chess) {
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isStalemate()) return "stalemate";
    if (chess.isDraw()) return "draw";
    return "ongoing";
  }
}