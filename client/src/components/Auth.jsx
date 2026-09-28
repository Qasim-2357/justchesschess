import { useState } from "react";
import { signup, login } from "../api";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={containerStyle}>
      <h1 style={{ fontWeight: 400, letterSpacing: 1 }}>justchesschess</h1>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          style={inputStyle}
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          style={inputStyle}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p style={{ color: "#ff8a8a", margin: 0 }}>{error}</p>}
        <button style={buttonStyle} type="submit" disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button
        style={linkStyle}
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
        }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
    </div>
  );
}

const containerStyle = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: 260,
};

const inputStyle = {
  background: "#111",
  color: "#fff",
  border: "1px solid #333",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 14,
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

const linkStyle = {
  background: "none",
  color: "#888",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "underline",
};