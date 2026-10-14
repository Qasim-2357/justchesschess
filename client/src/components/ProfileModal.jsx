import { useEffect, useState } from "react";
import { SERVER_URL } from "../api";

export default function ProfileModal({ username, refreshSignal, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");
    fetch(`${SERVER_URL}/leaderboard/me?username=${encodeURIComponent(username)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Could not load profile.");
        }
        return data;
      })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username, refreshSignal]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        style={modalStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Player profile</p>
            <h2 id="profile-title" style={titleStyle}>{username}</h2>
          </div>
          <button className="btn" style={closeButtonStyle} onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        {loading && <p style={mutedStyle}>Loading profile...</p>}
        {error && <p style={errorStyle}>{error}</p>}

        {!loading && !error && profile && (
          <div style={statsGridStyle}>
            <Stat label="Wins" value={profile.wins} valueStyle={winValueStyle} />
            <Stat label="Losses" value={profile.losses} valueStyle={lossValueStyle} />
            <Stat label="Win rate" value={`${Math.round(Number(profile.win_rate || 0) * 100)}%`} />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, valueStyle }) {
  return (
    <div style={statStyle}>
      <span style={statLabelStyle}>{label}</span>
      <strong style={{ ...statValueStyle, ...valueStyle }}>{value}</strong>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.72)",
};

const modalStyle = {
  width: "min(100%, 360px)",
  background: "radial-gradient(ellipse at top, #171717 0%, #090909 75%)",
  border: "1px solid #3a301b",
  borderRadius: 12,
  padding: 22,
  boxShadow: "0 20px 80px rgba(0, 0, 0, 0.8)",
};

const headerStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 22,
};

const eyebrowStyle = {
  margin: 0,
  color: "#777",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const titleStyle = {
  margin: "5px 0 0",
  color: "#d4b24c",
  fontSize: 22,
  fontWeight: 400,
};

const closeButtonStyle = {
  padding: "1px 9px 3px",
  fontSize: 22,
  lineHeight: 1,
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};

const statStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 7,
  padding: "14px 8px",
  background: "rgba(255, 255, 255, 0.035)",
  border: "1px solid #242424",
  borderRadius: 8,
};

const statLabelStyle = { color: "#888", fontSize: 11 };
const statValueStyle = { color: "#eee", fontSize: 21, fontWeight: 500 };
const winValueStyle = { color: "#8bd49a" };
const lossValueStyle = { color: "#ff8a8a" };
const mutedStyle = { color: "#888", fontSize: 13 };
const errorStyle = { color: "#ff8a8a", fontSize: 13 };
