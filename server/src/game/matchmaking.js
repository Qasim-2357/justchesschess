// FIFO queue of socket IDs waiting for an opponent.
export class Queue {
  constructor() {
    this.players = [];
  }

  // Adds a socket once, preserving the order in which players joined.
  addPlayer(socketId) {
    if (!this.players.includes(socketId)) this.players.push(socketId);
  }

  // Removes a socket from the waiting list if it is present.
  removePlayer(socketId) {
    this.players = this.players.filter((playerId) => playerId !== socketId);
  }

  // Returns the oldest two waiting socket IDs, or null when fewer than two wait.
  tryMatch() {
    if (this.players.length < 2) return null;
    return [this.players.shift(), this.players.shift()];
  }
}