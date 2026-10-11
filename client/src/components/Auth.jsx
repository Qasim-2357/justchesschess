import { useRef, useState } from "react";
import { signup, login } from "../api";
import AmbientBoard from "./AmbientBoard";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const action = mode === "login" ? login : signup;
      const data = await action(username.trim(), password);
      onAuthenticated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Both fields sit in one <form>, so by default the browser submits on
  // Enter from EITHER input — pressing Enter right after typing a username
  // (password still blank) used to submit immediately and come back
  // "wrong password", which reads as a bug even though the password really
  // was empty. Enter in the username field should just hand off to the
  // password field instead; only Enter from the password field submits.
  function handleUsernameKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      passwordRef.current?.focus();
    }
  }

  return (
    <div style={containerStyle}>
      <AmbientBoard />
      <div style={cardStyle}>
        <PawnMark />
        <h1 style={titleStyle}>justchesschess</h1>
        <p style={taglineStyle}>Instant matches. No friends, no noise.</p>

        <form onSubmit={handleSubmit} style={formStyle}>
          <input
            className="field"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleUsernameKeyDown}
            autoFocus
            autoComplete="username"
          />
          <input
            ref={passwordRef}
            className="field"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error && <p style={errorStyle}>{error}</p>}
          <button className="btn btn-primary" style={submitStyle} type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <button
          className="btn"
          style={linkStyle}
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

function PawnMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 32 32" style={{ marginBottom: 4 }}>
      <circle cx="16" cy="10" r="5" fill="#d4b24c" />
      <path d="M11 17h10l2 4H9z" fill="#d4b24c" />
      <rect x="8" y="23" width="16" height="4" rx="1" fill="#d4b24c" />
    </svg>
  );
}

const containerStyle = {
  position: "relative",
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardStyle = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  width: 300,
  padding: "36px 32px",
  background: "radial-gradient(ellipse at top, #0e0e0ef2 0%, #050505f2 70%)",
  border: "1px solid #262016",
  borderRadius: 12,
  boxShadow: "0 0 50px rgba(0,0,0,0.6), 0 0 80px rgba(212, 178, 76, 0.07)",
  backdropFilter: "blur(2px)",
};

const titleStyle = {
  fontWeight: 400,
  letterSpacing: 1,
  margin: "4px 0 0",
  fontSize: 22,
};

const taglineStyle = {
  color: "#777",
  fontSize: 13,
  margin: "0 0 18px",
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "100%",
};

const submitStyle = {
  marginTop: 4,
  width: "100%",
  fontSize: 15,
  padding: "11px 24px",
};

const errorStyle = {
  color: "#ff8a8a",
  fontSize: 13,
  margin: 0,
};

const linkStyle = {
  marginTop: 16,
  background: "none",
  border: "none",
  color: "#888",
  fontSize: 13,
  textDecoration: "underline",
  padding: "4px 8px",
};