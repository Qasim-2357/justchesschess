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
        <p style={{ margin: 0, color: "#eee" }}>You have an unfinished game.</p>
        <p style={secondsStyle}>{secondsLeft}s</p>
        <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
          Rejoin now, or it counts as a resignation.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleRejoin}
            disabled={secondsLeft === 0}
          >
            Rejoin
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={handleResign}>
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

// Matches the gold-on-black card language used across the HUD panels and
// the auth screen (radial-gradient card, #262016 border, gold accents) —
// this used to be a flat #111 box with no border tint, the one spot in the
// app that still looked like the pre-redesign UI.
const boxStyle = {
  background: "radial-gradient(ellipse at top, #121212f0 0%, #090909f0 70%)",
  border: "1px solid #262016",
  borderRadius: 10,
  boxShadow: "0 0 40px rgba(0,0,0,0.6)",
  backdropFilter: "blur(2px)",
  padding: "26px 28px",
  textAlign: "center",
  width: 260,
};

const secondsStyle = {
  fontSize: 32,
  margin: "10px 0",
  color: "#d4b24c",
  fontVariantNumeric: "tabular-nums",
};