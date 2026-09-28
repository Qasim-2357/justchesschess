import { Queue } from "./game/matchmaking.js";
import { GameManager } from "./game/gameManager.js";

// Registers queue, game, clock, and disconnect events on a Socket.IO server.
export function registerSocketHandlers(io) {
  const queue = new Queue();
  const gameManager = new GameManager();

  function emitToPlayers(game, event, payload) {
    io.to(game.players.white).emit(event, payload);
    io.to(game.players.black).emit(event, payload);
  }

  function emitGameOver(gameId) {
    const game = gameManager.games.get(gameId);
    if (!game) return;

    emitToPlayers(game, "game:over", {
      gameId,
      winner: game.winner,
      status: game.status,
      fen: game.chess.fen(),
      clocks: { ...game.clocks },
    });
    gameManager.socketGames.delete(game.players.white);
    gameManager.socketGames.delete(game.players.black);
  }

  io.on("connection", (socket) => {
    socket.on("queue:join", () => {
      const currentGameId = gameManager.socketGames.get(socket.id);
      const currentGame = gameManager.games.get(currentGameId);
      if (currentGame?.status === "ongoing") return;

      queue.addPlayer(socket.id);
      const players = queue.tryMatch();
      if (!players) return;

      const game = gameManager.createGame(players[0], players[1]);
      for (const playerId of players) {
        io.to(playerId).emit("game:start", {
          gameId: game.gameId,
          color: game.colors[playerId],
          fen: game.fen,
          timeMs: game.timeMs,
        });
      }
    });

    socket.on("queue:leave", () => {
      queue.removePlayer(socket.id);
    });

    socket.on("game:move", (move = {}) => {
      move ??= {};
      const { gameId, from, to, promotion } = move;
      if (gameManager.socketGames.get(socket.id) !== gameId) {
        socket.emit("game:error", { error: "Player is not in this game" });
        return;
      }

      const result = gameManager.makeMove(gameId, socket.id, from, to, promotion);
      if (result.flagFallen) {
        emitGameOver(gameId);
      } else if (result.error) {
        socket.emit("game:error", { error: result.error });
      } else if (result.status === "ongoing") {
        const game = gameManager.games.get(gameId);
        emitToPlayers(game, "game:update", {
          fen: result.fen,
          turn: result.turn,
          clocks: result.clocks,
        });
      } else {
        emitGameOver(gameId);
      }
    });

    socket.on("game:resign", (payload = {}) => {
      const { gameId } = payload ?? {};
      if (gameManager.socketGames.get(socket.id) !== gameId) {
        socket.emit("game:error", { error: "Player is not in this game" });
        return;
      }

      const winner = gameManager.resign(gameId, socket.id);
      if (!winner) {
        socket.emit("game:error", { error: "Unable to resign from this game" });
        return;
      }
      emitGameOver(gameId);
    });

    socket.on("disconnect", () => {
      queue.removePlayer(socket.id);
      const gameId = gameManager.socketGames.get(socket.id);
      const game = gameManager.games.get(gameId);
      if (!game || game.status !== "ongoing") return;

      const opponentId = game.players.white === socket.id
        ? game.players.black
        : game.players.white;
      io.to(opponentId).emit("opponent:disconnected", { gameId });
    });
  });

  const clockInterval = setInterval(() => {
    for (const [gameId, game] of gameManager.games) {
      if (game.status !== "ongoing") continue;

      const clock = gameManager.checkTime(gameId);
      if (clock.flagFallen) {
        emitGameOver(gameId);
      } else {
        emitToPlayers(game, "game:update", {
          fen: game.chess.fen(),
          turn: game.chess.turn(),
          clocks: clock.clocks,
        });
      }
    }
  }, 1000);
  clockInterval.unref?.();

  return { queue, gameManager };
}