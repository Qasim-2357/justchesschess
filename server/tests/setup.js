// Runs before any test file's imports, so modules that read these at
// load time (like DISCONNECT_GRACE_MS in socket.js) pick up the short
// test values instead of production defaults.
process.env.DISCONNECT_GRACE_MS = process.env.DISCONNECT_GRACE_MS || "3000";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";