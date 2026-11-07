// Works out which piece on the new board is which piece from the old board,
// so a move can be animated (the same piece slides to its new square)
// instead of the old piece vanishing and a new one popping into existence.
//
// A piece is identified by a stable id. Anything standing on the same
// square with the same type and colour is simply kept. The rest is matched
// by colour and type (a pawn may become a promoted piece), picking the
// closest candidate — which handles ordinary moves, captures, en passant,
// castling (king and rook each find their own match) and promotion with no
// special cases. Old pieces nobody claims were captured; new squares nobody
// claims are brand-new pieces (initial load or a full reset).

let counter = 0;
export function newPieceId() {
  counter += 1;
  return `piece-${counter}`;
}

function fileRank(square) {
  return [square.charCodeAt(0) - 97, parseInt(square[1], 10) - 1];
}

function distance(a, b) {
  const [af, ar] = fileRank(a);
  const [bf, br] = fileRank(b);
  return Math.max(Math.abs(af - bf), Math.abs(ar - br));
}

// chess.board() → Map(square → { type, color })
export function boardToMap(board) {
  const map = new Map();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row][col];
      if (cell) map.set(`${String.fromCharCode(97 + col)}${8 - row}`, { type: cell.type, color: cell.color });
    }
  }
  return map;
}

export function reconcile(prevPieces, targetMap) {
  const kept = [];
  const pool = [];
  const claimed = new Set();

  for (const piece of prevPieces) {
    const t = targetMap.get(piece.square);
    if (t && t.type === piece.type && t.color === piece.color) {
      kept.push(piece);
      claimed.add(piece.square);
    } else {
      pool.push(piece);
    }
  }

  const pieces = [...kept];
  const moves = [];
  let changed = pool.length > 0;

  for (const [square, t] of targetMap) {
    if (claimed.has(square)) continue;
    changed = true;

    let bestIndex = -1;
    let bestScore = Infinity;
    pool.forEach((old, i) => {
      if (old.color !== t.color) return;
      const sameType = old.type === t.type;
      if (!sameType && !(old.type === "p" && t.type !== "p")) return;
      const score = distance(old.square, square) + (sameType ? 0 : 100);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });

    if (bestIndex >= 0) {
      const [old] = pool.splice(bestIndex, 1);
      moves.push({ from: old.square, to: square, type: t.type });
      pieces.push({ id: old.id, square, type: t.type, color: t.color });
    } else {
      pieces.push({ id: newPieceId(), square, type: t.type, color: t.color });
    }
  }

  // Whatever is left in the pool was taken off the board.
  return { pieces, removed: pool, moves, changed };
}