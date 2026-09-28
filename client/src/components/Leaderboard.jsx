import { useEffect, useState } from "react";
import { SERVER_URL } from "../api";

export default function Leaderboard({ onClose }) {
  const [rows, setRows] = useState([]);
  const [minGames, setMinGames] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${SERVER_URL}/leaderboard`)
      .then((res) => res.json())
      .then((data) => {
        setRows(data.leaderboard || []);
        if (data.minGamesToRank) setMinGames(data.minGamesToRank);
      })
      .catch(() => setError("Could not load the leaderboard."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontWeight: 400 }}>Leaderboard</h2>
          <button style={closeButtonStyle} onClick={onClose}>×</button>
        </div>

        {loading && <p style={{ color: "#888" }}>Loading...</p>}
        {error && <p style={{ color: "#ff8a8a" }}>{error}</p>}

        {!loading && !error && rows.length === 0 && (
          <p style={{ color: "#888" }}>No one has played {minGames}+ games yet.</p>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Player</th>
                  <th style={thStyle}>Win rate</th>
                  <th style={thStyle}>W</th>
                  <th style={thStyle}>L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.username}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>{row.username}</td>
                    <td style={tdStyle}>{Math.round(row.win_rate * 100)}%</td>
                    <td style={tdStyle}>{row.wins}</td>
                    <td style={tdStyle}>{row.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color: "#666", fontSize: 11, marginTop: 10 }}>
              Ranked players need at least {minGames} games played.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
};

const boxStyle = {
  background: "#111", border: "1px solid #333", borderRadius: 8,
  padding: 24, color: "#fff", width: 360, maxHeight: "80vh", overflowY: "auto",
};

const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
};

const closeButtonStyle = {
  background: "none", color: "#888", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1,
};

const tableStyle = { width: "100%", borderCollapse: "collapse" };

const thStyle = {
  textAlign: "left", color: "#888", fontWeight: 400, fontSize: 12,
  borderBottom: "1px solid #333", padding: "6px 4px",
};

const tdStyle = { padding: "6px 4px", borderBottom: "1px solid #222", fontSize: 14 };