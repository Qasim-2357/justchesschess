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

export default router;