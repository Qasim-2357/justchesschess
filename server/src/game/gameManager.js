import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";

const INITIAL_TIME_MS = 10 * 60 * 1000;

export class GameManager {
  constructor() {
    this.games = new Map();
    this.socketGames = new Map();
    this.userGames = new Map();
  }

  createGame(firstPlayer, secondPlayer) {
    if (firstPlayer.socketId === secondPlayer.socketId) {
      throw new Error("A game requires two different players");
    }

    const [white, black] = Math.random() < 0.5
      ? [firstPlayer, secondPlayer]
      : [secondPlayer, firstPlayer];
    const gameId = randomUUID();
    const game = {
      gameId,
      players: { white: white.socketId, black: black.socketId },
      accounts: { white, black },
      chess: new Chess(),
      clocks: { white: INITIAL_TIME_MS, black: INITIAL_TIME_MS },
      lastTickAt: Date.now(),
      status: "ongoing",
      winner: null,
      reconnect: {
        white: { used: false, timer: null, deadline: null },
        black: { used: false, timer: null, deadline: null },
      },
    };

    this.games.set(gameId, game);
    this.socketGames.set(white.socketId, gameId);
    this.socketGames.set(black.socketId, gameId);
    this.userGames.set(white.userId, gameId);
    this.userGames.set(black.userId, gameId);

    return {
      gameId,
      players: { ...game.players },
      colors: { [white.socketId]: "white", [black.socketId]: "black" },
      usernames: { white: white.username, black: black.username },
      fen: game.chess.fen(),
      clocks: { ...game.clocks },
      timeMs: INITIAL_TIME_MS,
    };
  }

  getActiveGameForUser(userId) {
    const gameId = this.userGames.get(userId);
    const game = this.games.get(gameId);
    if (game && game.status === "ongoing") return { gameId, game };
    return null;
  }

  getColorForUser(game, userId) {
    if (game.accounts.white.userId === userId) return "white";
    if (game.accounts.black.userId === userId) return "black";
    return null;
  }

  rebindSocket(gameId, userId, newSocketId) {
    const game = this.games.get(gameId);
    if (!game) return null;
    const color = this.getColorForUser(game, userId);
    if (!color) return null;

    const oldSocketId = game.players[color];
    this.socketGames.delete(oldSocketId);
    game.players[color] = newSocketId;
    game.accounts[color].socketId = newSocketId;
    this.socketGames.set(newSocketId, gameId);

    return { color, game };
  }

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

  getColor(game, socketId) {
    if (game.players.white === socketId) return "white";
    if (game.players.black === socketId) return "black";
    return null;
  }

  getChessStatus(chess) {
    if (chess.isCheckmate()) return "checkmate";
    if (chess.isStalemate()) return "stalemate";
    if (chess.isDraw()) return "draw";
    return "ongoing";
  }

  cleanupGame(gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    for (const color of ["white", "black"]) {
      const timer = game.reconnect[color].timer;
      if (timer) clearTimeout(timer);
      this.userGames.delete(game.accounts[color].userId);
    }
  }
}