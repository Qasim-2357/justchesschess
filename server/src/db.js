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