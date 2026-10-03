import jwt from "jsonwebtoken";
import { Queue } from "./game/matchmaking.js";
import { GameManager } from "./game/gameManager.js";
import { recordGameResult, getWinRate } from "./db.js";

const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS) || 30 * 1000;
const MATCHMAKING_RETRY_MS = 2000;

export function registerSocketHandlers(io) {
  const queue = new Queue();
  const gameManager = new GameManager();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  function emitToPlayers(game, event, payload) {
    io.to(game.players.white).emit(event, payload);
    io.to(game.players.black).emit(event, payload);
  }

  // Drains the queue of every currently valid pair (there could be more
  // than one waiting pair at once) and starts a game for each.
  function attemptMatches() {
    let pair;
    while ((pair = queue.tryMatch())) {
      const game = gameManager.createGame(pair[0], pair[1]);
      for (const playerId of Object.values(game.players)) {
        io.to(playerId).emit("game:start", {
          gameId: game.gameId,
          color: game.colors[playerId],
          fen: game.fen,
          clocks: game.clocks,
          timeMs: game.timeMs,
          usernames: game.usernames,
        });
      }
    }
  }

   async function emitGameOver(gameId) {
    const game = gameManager.games.get(gameId);
    if (!game) return;

    const whiteUserId = game.accounts.white.userId;
    const blackUserId = game.accounts.black.userId;
    const winnerUserId =
      game.winner === game.players.white ? whiteUserId
      : game.winner === game.players.black ? blackUserId
      : null;

    // Save the result BEFORE telling clients it's final — otherwise a
    // client (or a test) could check the database before the write lands.
    try {
      await recordGameResult({
        whiteUserId,
        blackUserId,
        winnerUserId,
        result: game.status,
        pgn: game.chess.pgn(),
      });
    } catch (err) {
      console.error("Failed to record game result:", err);
    }

    emitToPlayers(game, "game:over", {
      gameId,
      winner: game.winner,
      status: game.status,
      fen: game.chess.fen(),
      clocks: { ...game.clocks },
    });

    gameManager.cleanupGame(gameId);
    gameManager.socketGames.delete(game.players.white);
    gameManager.socketGames.delete(game.players.black);
  }

  io.on("connection", (socket) => {
    const active = gameManager.getActiveGameForUser(socket.data.userId);
    if (active) {
      const rebind = gameManager.rebindSocket(active.gameId, socket.data.userId, socket.id);
      if (rebind) {
        const { color, game } = rebind;
        const slot = game.reconnect[color];
        const secondsLeft = slot.deadline
          ? Math.max(0, Math.ceil((slot.deadline - Date.now()) / 1000))
          : Math.ceil(DISCONNECT_GRACE_MS / 1000);

        socket.emit("game:resume_prompt", {
          gameId: game.gameId,
          color,
          fen: game.chess.fen(),
          clocks: { ...game.clocks },
          usernames: {
            white: game.accounts.white.username,
            black: game.accounts.black.username,
          },
          secondsLeft,
        });
      }
    }

    socket.on("game:rejoin_confirm", (payload = {}) => {
      const { gameId } = payload ?? {};
      if (gameManager.socketGames.get(socket.id) !== gameId) {
        socket.emit("game:error", { error: "Player is not in this game" });
        return;
      }
      const game = gameManager.games.get(gameId);
      if (!game || game.status !== "ongoing") return;
      const color = gameManager.getColor(game, socket.id);
      if (!color) return;

      const slot = game.reconnect[color];
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
      slot.used = true;
      slot.deadline = null;

      socket.emit("game:resume", {
        gameId: game.gameId,
        color,
        fen: game.chess.fen(),
        clocks: { ...game.clocks },
        usernames: {
          white: game.accounts.white.username,
          black: game.accounts.black.username,
        },
      });

      const opponentId = color === "white" ? game.players.black : game.players.white;
      io.to(opponentId).emit("opponent:reconnected", { gameId });
    });

    socket.on("queue:join", async () => {
      const currentGameId = gameManager.socketGames.get(socket.id);
      const currentGame = gameManager.games.get(currentGameId);
      if (currentGame?.status === "ongoing") return;

      const winRate = await getWinRate(socket.data.userId);
      queue.addPlayer({
        socketId: socket.id,
        userId: socket.data.userId,
        username: socket.data.username,
        winRate,
      });
      attemptMatches();
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

      const color = gameManager.getColor(game, socket.id);
      if (!color) return;
      const opponentId = color === "white" ? game.players.black : game.players.white;

      if (game.reconnect[color].used) {
        gameManager.resign(gameId, socket.id);
        emitGameOver(gameId);
        return;
      }

      io.to(opponentId).emit("opponent:disconnected", {
        gameId,
        forfeitInMs: DISCONNECT_GRACE_MS,
      });

      game.reconnect[color].deadline = Date.now() + DISCONNECT_GRACE_MS;
      game.reconnect[color].timer = setTimeout(() => {
        const current = gameManager.games.get(gameId);
        if (!current || current.status !== "ongoing") return;
        gameManager.resign(gameId, socket.id);
        emitGameOver(gameId);
      }, DISCONNECT_GRACE_MS);
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

  // Re-attempts matching periodically, since tolerance widens with wait
  // time even if nobody new joins the queue.
  const matchmakingInterval = setInterval(attemptMatches, MATCHMAKING_RETRY_MS);
  matchmakingInterval.unref?.();

  return { queue, gameManager };
}