import { useEffect, useState } from "react";
import { socket } from "../socket";

export default function ReconnectModal({ prompt, onResign }) {
  const [secondsLeft, setSecondsLeft] = useState(prompt.secondsLeft);

  useEffect(() => {
    setSecondsLeft(prompt.secondsLeft);
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [prompt.gameId, prompt.secondsLeft]);

  function handleRejoin() {
    socket.emit("game:rejoin_confirm", { gameId: prompt.gameId });
  }

  function handleResign() {
    socket.emit("game:resign", { gameId: prompt.gameId });
    onResign();
  }

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <p>You have an unfinished game.</p>
        <p style={{ fontSize: 28, margin: "8px 0" }}>{secondsLeft}s</p>
        <p style={{ color: "#aaa", fontSize: 13 }}>
          Rejoin now, or it counts as a resignation.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button style={buttonStyle} onClick={handleRejoin} disabled={secondsLeft === 0}>
            Rejoin
          </button>
          <button style={buttonStyle} onClick={handleResign}>
            Resign
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
};

const boxStyle = {
  background: "#111", border: "1px solid #333", borderRadius: 8,
  padding: 24, textAlign: "center", color: "#fff", width: 260,
};

const buttonStyle = {
  flex: 1, background: "#222", color: "#fff", border: "1px solid #333",
  borderRadius: 6, padding: "8px 0", cursor: "pointer",
};