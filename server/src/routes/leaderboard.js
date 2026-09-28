import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /leaderboard?limit=50 -> top users by wins, then by fewest losses.
router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  try {
    const result = await pool.query(
      `SELECT username, wins, losses FROM users
       ORDER BY wins DESC, losses ASC, username ASC
       LIMIT $1`,
      [limit],
    );
    res.json({ leaderboard: result.rows });
  } catch (err) {
    console.error("leaderboard error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;