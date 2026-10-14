import { useEffect, useState } from "react";
import { socket } from "./socket";
import Board from "./components/Board3D";
import Auth from "./components/Auth";
import ReconnectModal from "./components/ReconnectModal";
import Leaderboard from "./components/Leaderboard";
import AmbientBoard from "./components/AmbientBoard";

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
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

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
      setLeaderboardRefresh((n) => n + 1);
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
      {/* Only behind the lobby screens — never mounted alongside the real,
          interactive Board3D during "playing", so there's only ever one
          WebGL canvas on screen at a time. */}
      {screen !== "playing" && <AmbientBoard />}

      {resumePrompt && (
        <ReconnectModal prompt={resumePrompt} onResign={() => setResumePrompt(null)} />
      )}

      {/* Left HUD panel: the leaderboard is always on screen — no button to
          click to open it — and pins the signed-in player's own standing
          even when they're off the visible list, the way a mobile game's
          side panel does. */}
      <div style={leftPanelStyle}>
        <Leaderboard currentUsername={auth.user.username} refreshSignal={leaderboardRefresh} />
      </div>

      {/* Center stays empty chrome so the board (AmbientBoard or the real
          interactive Board3D) is the only thing ever drawn there — nothing
          competes with it for clicks or attention. */}
      {screen === "playing" && game && (
        <div style={centerStageStyle}>
          <Board game={game} />
        </div>
      )}

      {/* Right HUD panel: identity + whatever action fits the current
          screen (Play / queued status / post-game) + Log out. Positioned,
          z-indexed, and off to the side — never sitting on top of the
          board the way the old centered Play button used to. */}
      <div style={rightPanelStyle}>
        <div style={identityCardStyle}>
          <span style={usernameStyle}>{auth.user.username}</span>
          <button className="btn" style={smallButtonStyle} onClick={handleLogout}>Log out</button>
        </div>

        <div style={actionCardStyle}>
          {screen === "idle" && (
            <button className="btn btn-primary" style={playButtonStyle} onClick={joinQueue}>
              Play
            </button>
          )}

          {screen === "queued" && (
            <div style={centeredMessageStyle}>
              <div style={spinnerStyle} />
              <p style={{ color: "#aaa", margin: 0 }}>Waiting for an opponent…</p>
              <button className="btn" style={buttonStyle} onClick={leaveQueue}>
                Cancel
              </button>
            </div>
          )}

          {screen === "playing" && (
            <div style={centeredMessageStyle}>
              <p style={{ color: "#aaa", margin: 0, fontSize: 13 }}>Game in progress</p>
              {opponentSecondsLeft !== null && (
                <p style={disconnectBannerStyle}>
                  Opponent disconnected. You'll be awarded the win in {opponentSecondsLeft}s if they don't return.
                </p>
              )}
            </div>
          )}

          {screen === "over" && (
            <div style={centeredMessageStyle}>
              <p style={gameOverTextStyle}>{getGameOverMessage()}</p>
              <button className="btn btn-primary" style={buttonStyle} onClick={joinQueue}>
                Play again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const appStyle = {
  minHeight: "100vh", background: "#000", color: "#fff", position: "relative",
  overflow: "hidden",
};

const PANEL_WIDTH = 230;

const leftPanelStyle = {
  position: "fixed",
  top: 20,
  bottom: 20,
  left: 20,
  width: PANEL_WIDTH,
  zIndex: 2,
};

const rightPanelStyle = {
  position: "fixed",
  top: 20,
  right: 20,
  width: PANEL_WIDTH,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const centerStageStyle = {
  position: "relative",
  zIndex: 1,
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardBaseStyle = {
  background: "radial-gradient(ellipse at top, #121212f0 0%, #090909f0 70%)",
  border: "1px solid #262016",
  borderRadius: 10,
  padding: "14px 16px",
  boxShadow: "0 0 40px rgba(0,0,0,0.6)",
  backdropFilter: "blur(2px)",
};

const identityCardStyle = {
  ...cardBaseStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const actionCardStyle = {
  ...cardBaseStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 90,
};

const usernameStyle = {
  color: "#d4b24c",
  letterSpacing: 0.3,
  fontSize: 14,
};

const smallButtonStyle = {
  padding: "6px 14px", fontSize: 12,
};

const buttonStyle = {
  padding: "11px 26px", fontSize: 15,
};

const playButtonStyle = {
  padding: "14px 44px",
  fontSize: 17,
  letterSpacing: 1,
};

const centeredMessageStyle = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
};

const gameOverTextStyle = {
  fontSize: 18,
  color: "#eee",
  margin: 0,
};

const disconnectBannerStyle = {
  color: "#f3c969",
  fontSize: 13,
  textAlign: "center",
};

const spinnerStyle = {
  width: 22,
  height: 22,
  border: "2px solid #2a2a2a",
  borderTopColor: "#d4b24c",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};