import { useEffect, useState } from "react";
import { socket } from "./socket";
import Board from "./components/Board";
import Auth from "./components/Auth";
import ReconnectModal from "./components/ReconnectModal";

const STORAGE_KEY = "justchesschess_auth";

export default function App() {
  const [auth, setAuth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [screen, setScreen] = useState("idle");
  const [game, setGame] = useState(null);
  const [overInfo, setOverInfo] = useState(null);
  const [resumePrompt, setResumePrompt] = useState(null);
  const [opponentDeadline, setOpponentDeadline] = useState(null);
  const [opponentSecondsLeft, setOpponentSecondsLeft] = useState(null);
  const [connectionError, setConnectionError] = useState("");

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    setScreen("idle");
    setGame(null);
    setOverInfo(null);
    setResumePrompt(null);
    setOpponentDeadline(null);
  }

  useEffect(() => {
    function onStart(data) {
      setGame(data);
      setOverInfo(null);
      setResumePrompt(null);
      setOpponentDeadline(null);
      setScreen("playing");
    }

    function onResumePrompt(data) {
      setResumePrompt(data);
    }

    function onResume(data) {
      setGame(data);
      setOverInfo(null);
      setResumePrompt(null);
      setOpponentDeadline(null);
      setScreen("playing");
    }

    function onOver(data) {
      setOverInfo(data);
      setResumePrompt(null);
      setOpponentDeadline(null);
      setScreen("over");
    }

    function onOpponentGone(data) {
      setOpponentDeadline(Date.now() + data.forfeitInMs);
    }

    function onOpponentReconnected() {
      setOpponentDeadline(null);
    }

    function onConnectError(err) {
      if (err.message === "Authentication required" || err.message === "Invalid or expired token") {
        setConnectionError("Your session expired. Please log in again.");
        handleLogout();
      }
    }

    socket.on("game:start", onStart);
    socket.on("game:resume_prompt", onResumePrompt);
    socket.on("game:resume", onResume);
    socket.on("game:over", onOver);
    socket.on("opponent:disconnected", onOpponentGone);
    socket.on("opponent:reconnected", onOpponentReconnected);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("game:start", onStart);
      socket.off("game:resume_prompt", onResumePrompt);
      socket.off("game:resume", onResume);
      socket.off("game:over", onOver);
      socket.off("opponent:disconnected", onOpponentGone);
      socket.off("opponent:reconnected", onOpponentReconnected);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    socket.auth = { token: auth.token };
    socket.connect();
    return () => socket.disconnect();
  }, [auth]);

  // Live countdown for "opponent disconnected" banner.
  useEffect(() => {
    if (!opponentDeadline) {
      setOpponentSecondsLeft(null);
      return;
    }
    function tick() {
      setOpponentSecondsLeft(Math.max(0, Math.ceil((opponentDeadline - Date.now()) / 1000)));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [opponentDeadline]);

  function handleAuthenticated(data) {
    setConnectionError("");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAuth(data);
  }

  function joinQueue() {
    setGame(null);
    setOverInfo(null);
    setOpponentDeadline(null);
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

  if (!auth) {
    return (
      <>
        <Auth onAuthenticated={handleAuthenticated} />
        {connectionError && (
          <p style={{ color: "#ff8a8a", textAlign: "center" }}>{connectionError}</p>
        )}
      </>
    );
  }

  return (
    <div style={appStyle}>
      <div style={topBarStyle}>
        <span>{auth.user.username}</span>
        <button style={smallButtonStyle} onClick={handleLogout}>Log out</button>
      </div>

      {resumePrompt && (
        <ReconnectModal prompt={resumePrompt} onResign={() => setResumePrompt(null)} />
      )}

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
          {opponentSecondsLeft !== null && (
            <p>Opponent disconnected. You'll be awarded the win in {opponentSecondsLeft}s if they don't return.</p>
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
  minHeight: "100vh", padding: 20, background: "#000", color: "#fff",
  display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: 16, position: "relative",
};

const topBarStyle = {
  position: "absolute", top: 16, right: 20, display: "flex",
  alignItems: "center", gap: 12, fontSize: 14, color: "#aaa",
};

const smallButtonStyle = {
  background: "#111", color: "#fff", border: "1px solid #333",
  borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer",
};

const buttonStyle = {
  background: "#111", color: "#fff", border: "1px solid #333",
  borderRadius: 6, padding: "10px 24px", fontSize: 16, cursor: "pointer",
};