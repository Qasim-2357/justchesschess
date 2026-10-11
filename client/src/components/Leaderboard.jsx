import { useEffect, useState } from "react";
import { SERVER_URL } from "../api";

// A persistent side panel, not a modal — always on screen, no click needed
// to open it. The signed-in player's own row is highlighted gold if it's
// in the visible list; if they're ranked lower down (or not ranked yet),
// their row is pinned at the bottom below a divider instead, the way
// Brawl Stars / Contest of Champions always show "you are #N" even when
// you're nowhere near the top.
export default function Leaderboard({ currentUsername }) {
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [minGames, setMinGames] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`${SERVER_URL}/leaderboard?limit=100`).then((res) => res.json()),
      currentUsername
        ? fetch(`${SERVER_URL}/leaderboard/me?username=${encodeURIComponent(currentUsername)}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([listData, meData]) => {
        if (cancelled) return;
        setRows(listData.leaderboard || []);
        if (listData.minGamesToRank) setMinGames(listData.minGamesToRank);
        setMe(meData);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the leaderboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUsername]);

  const meInList = rows.some((row) => row.username === currentUsername);
  const showPinnedMe = !loading && !error && currentUsername && me && !meInList;

  return (
    <div style={panelStyle}>
      <h2 style={titleStyle}>Leaderboard</h2>

      {loading && <p style={mutedStyle}>Loading...</p>}
      {error && <p style={{ color: "#ff8a8a", fontSize: 13 }}>{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p style={mutedStyle}>No one has played {minGames}+ games yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={listWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Player</th>
                <th style={{ ...thStyle, textAlign: "right" }}>W%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isMe = row.username === currentUsername;
                return (
                  <tr key={row.username} style={isMe ? meRowStyle : undefined}>
                    <td style={{ ...tdStyle, color: RANK_COLORS[i] ?? (isMe ? "#1a1308" : "#eee") }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: isMe ? 700 : 400, color: isMe ? "#1a1308" : undefined }}>
                      {row.username}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: isMe ? "#1a1308" : undefined }}>
                      {Math.round(row.win_rate * 100)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (
        <p style={footnoteStyle}>Ranked after {minGames}+ games played.</p>
      )}

      {showPinnedMe && (
        <div style={pinnedWrapStyle}>
          <div style={pinnedDividerStyle}>⋯</div>
          <div style={pinnedRowStyle}>
            <span style={{ color: "#d4b24c", fontWeight: 700, minWidth: 28 }}>
              {me.rank ? `#${me.rank}` : "—"}
            </span>
            <span style={{ fontWeight: 700, flex: 1 }}>{me.username}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#aaa" }}>
              {me.rank ? `${Math.round(me.win_rate * 100)}%` : `${me.games}/${minGames} games`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  background: "radial-gradient(ellipse at top, #121212f0 0%, #090909f0 70%)",
  border: "1px solid #262016",
  borderRadius: 10,
  padding: "16px 14px",
  boxShadow: "0 0 40px rgba(0,0,0,0.6)",
  backdropFilter: "blur(2px)",
  overflow: "hidden",
};

const titleStyle = {
  margin: "0 0 12px",
  fontWeight: 400,
  fontSize: 16,
  color: "#d4b24c",
  letterSpacing: 0.5,
};

const mutedStyle = { color: "#888", fontSize: 13 };

const listWrapStyle = { overflowY: "auto", flex: 1, minHeight: 0 };

const RANK_COLORS = ["#e8c75a", "#c9c9c9", "#b08a52"];

const tableStyle = { width: "100%", borderCollapse: "collapse" };

const thStyle = {
  textAlign: "left", color: "#777", fontWeight: 400, fontSize: 11,
  borderBottom: "1px solid #2a2a2a", padding: "4px 4px", position: "sticky", top: 0,
  background: "#0c0c0c",
};

const tdStyle = { padding: "6px 4px", borderBottom: "1px solid #1c1c1c", fontSize: 13 };

const meRowStyle = {
  background: "linear-gradient(90deg, #d4b24c, #e8c75a)",
  borderRadius: 4,
};

const footnoteStyle = { color: "#555", fontSize: 10, marginTop: 8 };

const pinnedWrapStyle = { marginTop: "auto", paddingTop: 8 };

const pinnedDividerStyle = {
  textAlign: "center", color: "#444", fontSize: 12, marginBottom: 4,
};

const pinnedRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  background: "rgba(212, 178, 76, 0.12)",
  border: "1px solid rgba(212, 178, 76, 0.4)",
  borderRadius: 6,
  fontSize: 13,
};