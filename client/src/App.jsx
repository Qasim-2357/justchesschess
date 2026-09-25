import { useEffect, useState } from "react";
import { socket } from "./socket";
import Board from "./components/Board";

export default function App() {
  const [screen, setScreen] = useState("idle");
  const [game, setGame] = useState(null);
  const [overInfo, setOverInfo] = useState(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  useEffect(() => {
    function onStart(data) {
      setGame(data);
      setOverInfo(null);
      setOpponentDisconnected(false);
      setScreen("playing");
    }

    function onOver(data) {
      setOverInfo(data);
      setOpponentDisconnected(false);
      setScreen("over");
    }

    function onOpponentGone() {
      setOpponentDisconnected(true);
    }

    socket.on("game:start", onStart);
    socket.on("game:over", onOver);
    socket.on("opponent:disconnected", onOpponentGone);

    return () => {
      socket.off("game:start", onStart);
      socket.off("game:over", onOver);
      socket.off("opponent:disconnected", onOpponentGone);
    };
  }, []);

  function joinQueue() {
    setGame(null);
    setOverInfo(null);
    setOpponentDisconnected(false);
    socket.emit("queue:join");
    setScreen("queued");
  }

  function leaveQueue() {
    socket.emit("queue:leave");
    setScreen("idle");
  }

  function getGameOverMessage() {
    if (overInfo?.winner) {
      return overInfo.winner === socket.id
        ? `You won (${overInfo.status}).`
        : `You lost (${overInfo.status}).`;
    }

    return `Game over: ${overInfo?.status ?? "unknown"}.`;
  }

  return (
    <div style={appStyle}>
      {screen === "idle" && (
        <button style={buttonStyle} onClick={joinQueue}>
          Play
        </button>
      )}

      {screen === "queued" && (
        <>
          <p>Waiting for an opponent...</p>
          <button style={buttonStyle} onClick={leaveQueue}>
            Cancel
          </button>
        </>
      )}

      {screen === "playing" && game && (
        <>
          {opponentDisconnected && (
            <p>Opponent disconnected. Waiting for the game clock to finish.</p>
          )}
          <Board game={game} />
        </>
      )}

      {screen === "over" && (
        <>
          <p>{getGameOverMessage()}</p>
          <button style={buttonStyle} onClick={joinQueue}>
            Play again
          </button>
        </>
      )}
    </div>
  );
}

const appStyle = {
  minHeight: "100vh",
  padding: 20,
  background: "#000",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
};

const buttonStyle = {
  background: "#111",
  color: "#fff",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "10px 24px",
  fontSize: 16,
  cursor: "pointer",
};
