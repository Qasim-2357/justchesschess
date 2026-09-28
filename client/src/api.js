export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

async function postJson(path, body) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export function signup(username, password) {
  return postJson("/auth/signup", { username, password });
}

export function login(username, password) {
  return postJson("/auth/login", { username, password });
}