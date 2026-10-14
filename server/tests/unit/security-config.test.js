import { describe, it, expect } from "vitest";
import { getDatabaseConfig } from "../../src/db.js";
import { validateEnvironment } from "../../src/server.js";

describe("Security configuration", () => {
  it("keeps SSL disabled for local PostgreSQL on a non-default port", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://localhost:5433/justchesschess";

    try {
      expect(getDatabaseConfig()).toMatchObject({
        connectionString: "postgres://localhost:5433/justchesschess",
        ssl: false,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });

  it("verifies TLS for remote PostgreSQL connections", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://app:secret@db.example.com:5432/app";

    try {
      expect(getDatabaseConfig()).toMatchObject({
        connectionString:
          "postgresql://app:secret@db.example.com:5432/app",
        ssl: { rejectUnauthorized: true },
      });
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });

  it("rejects non-PostgreSQL URLs in database configuration", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "https://example.com";

    try {
      expect(() => getDatabaseConfig()).toThrow(/postgres/i);
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });

  it("fails fast when required environment variables are missing", () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      CLIENT_URL: process.env.CLIENT_URL,
    };

    try {
      delete process.env.DATABASE_URL;
      delete process.env.JWT_SECRET;
      delete process.env.CLIENT_URL;

      expect(() => validateEnvironment()).toThrow(
        /Missing required env vars/,
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("rejects non-PostgreSQL DATABASE_URL values during environment validation", () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      CLIENT_URL: process.env.CLIENT_URL,
    };

    try {
      process.env.DATABASE_URL = "https://example.com";
      process.env.JWT_SECRET = "test-secret";
      process.env.CLIENT_URL = "http://localhost:5173";

      expect(() => validateEnvironment()).toThrow(/postgres/i);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});