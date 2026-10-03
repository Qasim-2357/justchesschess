import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const router = Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Limits signup/login attempts per IP to slow down bots and brute-forcing,
// without being so strict that a real person retyping a password gets stuck.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

function signToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "30d" },
  );
}

// POST /auth/signup { username, password } -> creates a unique account and returns a token.
router.post("/signup", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: "Username must be 3-20 characters: letters, numbers, underscore only",
    });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       RETURNING id, username, wins, losses`,
      [username, passwordHash],
    );
    const user = result.rows[0];
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username is already taken" });
    }
    console.error("signup error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /auth/login { username, password } -> returns a token for a valid account.
router.post("/login", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password_hash, wins, losses
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [username],
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid username or password" });

    delete user.password_hash;
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;

