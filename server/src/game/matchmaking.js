// FIFO queue of players waiting for an opponent. Each entry is
// { socketId, userId, username } so we can avoid matching a player
// against their own second tab/account.
export class Queue {
  constructor() {
    this.entries = [];
  }

  // Adds a player once, preserving join order.
  addPlayer(entry) {
    if (!this.entries.some((e) => e.socketId === entry.socketId)) {
      this.entries.push(entry);
    }
  }

  // Removes a player from the waiting list if present.
  removePlayer(socketId) {
    this.entries = this.entries.filter((e) => e.socketId !== socketId);
  }

  // Returns the oldest two waiting entries belonging to DIFFERENT accounts,
  // or null when no valid pair is available yet (e.g. only the same user
  // waiting in two tabs).
  tryMatch() {
    if (this.entries.length < 2) return null;

    const [first, ...rest] = this.entries;
    const opponentIndex = rest.findIndex((entry) => entry.userId !== first.userId);
    if (opponentIndex === -1) return null;

    const opponent = rest[opponentIndex];
    this.entries = rest.filter((_, i) => i !== opponentIndex);
    return [first, opponent];
  }
}