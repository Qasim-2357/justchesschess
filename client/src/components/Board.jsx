import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { socket } from "../socket";

export default function Board({ game }) {
  const [chess] = useState(() => new Chess(game.fen));
  const [fen, setFen] = useState(game.fen);
  const [clocks, setClocks] = useState(() => game.clocks ?? {
    white: game.timeMs,
    black: game.timeMs,
  });
  const [error, setError] = useState("");
  const authoritativeFen = useRef(game.fen);

  useEffect(() => {
    function onUpdate(data) {
      if (data.fen) {
        authoritativeFen.current = data.fen;
        chess.load(data.fen);
        setFen(data.fen);
      }

      if (data.clocks) setClocks(data.clocks);
      setError("");
    }

    function onError(data = {}) {
      chess.load(authoritativeFen.current);
      setFen(authoritativeFen.current);
      setError(data.error || "Move rejected.");
    }

    socket.on("game:update", onUpdate);
    socket.on("game:error", onError);

    return () => {
      socket.off("game:update", onUpdate);
      socket.off("game:error", onError);
    };
  }, [chess]);

  function onPieceDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare) return false;

    const promotion = chess
      .moves({ square: sourceSquare, verbose: true })
      .some((move) => move.to === targetSquare && move.promotion)
      ? "q"
      : undefined;

    try {
      chess.move({
        from: sourceSquare,
        to: targetSquare,
        ...(promotion ? { promotion } : {}),
      });
    } catch {
      return false;
    }

    setFen(chess.fen());
    setError("");

    socket.emit("game:move", {
      gameId: game.gameId,
      from: sourceSquare,
      to: targetSquare,
      ...(promotion ? { promotion } : {}),
    });

    return true;
  }

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  const playerTurn = game.color === "white" ? "w" : "b";
  const topColor = game.color === "white" ? "black" : "white";
  const bottomColor = game.color;

  const chessboardOptions = {
    position: fen,
    boardOrientation: game.color,
    darkSquareStyle: { backgroundColor: "#1a1a1a" },
    lightSquareStyle: { backgroundColor: "#3a3a3a" },
    boardStyle: { width: "min(90vw, 480px)" },
    canDragPiece: ({ piece }) =>
      piece.pieceType[0] === playerTurn && chess.turn() === playerTurn,
    onPieceDrop,
  };

  return (
    <div style={boardContainerStyle}>
      <div style={clockStyle}>
        Opponent ({topColor}): {formatClock(clocks[topColor])}
      </div>

      <Chessboard options={chessboardOptions} />

      <div style={clockStyle}>
        You ({bottomColor}): {formatClock(clocks[bottomColor])}
      </div>

      {error && <p style={{ color: "#ff8a8a" }}>{error}</p>}

      <button
        style={buttonStyle}
        onClick={() => socket.emit("game:resign", { gameId: game.gameId })}
      >
        Resign
      </button>
    </div>
  );
}

const boardContainerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const clockStyle = {
  width: "min(90vw, 480px)",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const buttonStyle = {
  background: "#111",
  color: "#fff",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "7px 18px",
  cursor: "pointer",
};
