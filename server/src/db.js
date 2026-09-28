import pg from "pg";

const { Pool } = pg;

// Shared PostgreSQL connection pool configured from the server environment.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Creates the user and game tables, plus the case-insensitive username index.
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(20) NOT NULL,
      password_hash TEXT NOT NULL,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci
    ON users (LOWER(username))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      white_id INT REFERENCES users(id),
      black_id INT REFERENCES users(id),
      winner_id INT REFERENCES users(id),
      result VARCHAR(20),
      pgn TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// Saves a finished game and updates the win/loss counters of both players.
export async function recordGameResult({ whiteUserId, blackUserId, winnerUserId, result, pgn }) {
  await pool.query(
    `INSERT INTO games (white_id, black_id, winner_id, result, pgn)
     VALUES ($1, $2, $3, $4, $5)`,
    [whiteUserId, blackUserId, winnerUserId ?? null, result, pgn ?? null],
  );

  if (winnerUserId) {
    const loserUserId = winnerUserId === whiteUserId ? blackUserId : whiteUserId;
    await pool.query(`UPDATE users SET wins = wins + 1 WHERE id = $1`, [winnerUserId]);
    await pool.query(`UPDATE users SET losses = losses + 1 WHERE id = $1`, [loserUserId]);
  }
}
// Returns a user's win rate (0 to 1). New players with no finished games
// get a neutral 0.5, so they're not treated as unusually strong or weak.
export async function getWinRate(userId) {
  const result = await pool.query(
    "SELECT wins, losses FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0];
  if (!user) return 0.5;
  const total = user.wins + user.losses;
  return total === 0 ? 0.5 : user.wins / total;
}