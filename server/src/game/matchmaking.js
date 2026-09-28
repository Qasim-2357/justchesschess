// Win-rate gap (0 to 1) allowed at each stage of how long the longest-
// waiting player has been in queue. Widens over time so a top player
// doesn't wait forever for an exact skill match when few players are online.
export const TOLERANCE_STAGES = [
  { afterMs: 0, tolerance: 0.15 },
  { afterMs: 10000, tolerance: 0.30 },
  { afterMs: 20000, tolerance: 0.50 },
  { afterMs: 30000, tolerance: 1.00 }, // effectively: match anyone
];

function toleranceFor(waitedMs) {
  let tolerance = TOLERANCE_STAGES[0].tolerance;
  for (const stage of TOLERANCE_STAGES) {
    if (waitedMs >= stage.afterMs) tolerance = stage.tolerance;
  }
  return tolerance;
}

// Queue of players waiting for an opponent, matched by closeness in win
// rate rather than pure arrival order. Each entry:
// { socketId, userId, username, winRate, joinedAt }
export class Queue {
  constructor() {
    this.entries = [];
  }

  addPlayer(entry) {
    if (!this.entries.some((e) => e.socketId === entry.socketId)) {
      this.entries.push({ ...entry, joinedAt: Date.now() });
    }
  }

  removePlayer(socketId) {
    this.entries = this.entries.filter((e) => e.socketId !== socketId);
  }

  // Tries the longest-waiting player first (so nobody starves), looking
  // for the CLOSEST win-rate opponent within their currently allowed
  // tolerance. Returns a pair, or null if no valid pair exists yet.
  tryMatch() {
    if (this.entries.length < 2) return null;

    const byWait = [...this.entries].sort((a, b) => a.joinedAt - b.joinedAt);
    const now = Date.now();

    for (const anchor of byWait) {
      const tolerance = toleranceFor(now - anchor.joinedAt);
      let best = null;
      let bestDiff = Infinity;

      for (const candidate of this.entries) {
        if (candidate.socketId === anchor.socketId) continue;
        if (candidate.userId === anchor.userId) continue;
        const diff = Math.abs(candidate.winRate - anchor.winRate);
        if (diff <= tolerance && diff < bestDiff) {
          best = candidate;
          bestDiff = diff;
        }
      }

      if (best) {
        this.entries = this.entries.filter(
          (e) => e.socketId !== anchor.socketId && e.socketId !== best.socketId,
        );
        return [anchor, best];
      }
    }

    return null;
  }
}