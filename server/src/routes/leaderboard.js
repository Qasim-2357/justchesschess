import { Router } from "express";
import { pool } from "../db.js";

const router = Router();
const MIN_GAMES_TO_RANK = 5;

// GET /leaderboard?limit=50 -> ranked by win rate (min games required to
// qualify, so a 1-0 record can't outrank a proven 40-5 record).
router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  try {
    const result = await pool.query(
      `SELECT
         username, wins, losses, (wins + losses) AS games,
         CASE WHEN (wins + losses) = 0 THEN 0
              ELSE ROUND(wins::numeric / (wins + losses), 3)
         END AS win_rate
       FROM users
       WHERE (wins + losses) >= $2
       ORDER BY win_rate DESC, wins DESC, username ASC
       LIMIT $1`,
      [limit, MIN_GAMES_TO_RANK],
    );
    res.json({ leaderboard: result.rows, minGamesToRank: MIN_GAMES_TO_RANK });
  } catch (err) {
    console.error("leaderboard error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /leaderboard/me?username=foo -> this one player's rank, even when
// they're outside the top N the main list returns. Lets the client pin
// "you are #134" at the bottom of the board instead of hiding the player
// entirely, the way mobile game leaderboards (Brawl Stars, Contest of
// Champions, etc.) always show your own standing.
router.get("/me", async (req, res) => {
  const username = (req.query.username || "").trim();
  if (!username) {
    return res.status(400).json({ error: "username required" });
  }
  try {
    const result = await pool.query(
      `WITH ranked AS (
         SELECT
           username, wins, losses, (wins + losses) AS games,
           ROUND(wins::numeric / NULLIF(wins + losses, 0), 3) AS win_rate,
           RANK() OVER (
             ORDER BY (wins::numeric / NULLIF(wins + losses, 0)) DESC, wins DESC, username ASC
           ) AS rank
         FROM users
         WHERE (wins + losses) >= $2
       )
       SELECT username, wins, losses, games, win_rate, rank FROM ranked WHERE username = $1
       UNION ALL
       SELECT
         username, wins, losses, (wins + losses) AS games,
         CASE WHEN (wins + losses) = 0 THEN 0 ELSE ROUND(wins::numeric / (wins + losses), 3) END AS win_rate,
         NULL AS rank
       FROM users
       WHERE username = $1 AND (wins + losses) < $2`,
      [username, MIN_GAMES_TO_RANK],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json({ ...result.rows[0], minGamesToRank: MIN_GAMES_TO_RANK });
  } catch (err) {
    console.error("leaderboard/me error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;