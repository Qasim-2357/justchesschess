// Shared, render-only pieces of the 3D board — procedural textures, square
// math, and the chess piece models — used by both the real interactive
// Board3D and the decorative AmbientBoard behind the login/lobby screens.
// Keeping this in one place means the two boards can never visually drift
// apart.
//
// The pieces are a real modelled Staunton set (public/models/pieces.glb,
// made in Blender, CC BY 3.0 — see the credits in README.md). One mesh per
// piece type is loaded once and shared by every piece on the board; white and
// black differ only by material colour.
import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

export const PIECE_COLOR = { w: "#e8e4da", b: "#1a1816" };

export const PIECES_URL = `${import.meta.env.BASE_URL}models/pieces.glb`;

export function squareToFileRank(square) {
  return { file: square.charCodeAt(0) - 97, rank: parseInt(square[1], 10) - 1 };
}

export function squareToCoords(square, orientation) {
  const { file, rank } = squareToFileRank(square);
  const x = orientation === "white" ? file : 7 - file;
  const z = orientation === "white" ? 7 - rank : rank;
  // y is nudged a hair above 0 on purpose: the board frame's top face sits
  // exactly at y=0, and a square tile plane at the same y=0 was perfectly
  // coplanar with it — a z-fighting setup that broke into a jagged,
  // flickering stairstep pattern at any oblique camera angle.
  return [x - 3.5, 0.01, z - 3.5];
}

// --- Procedural textures (no external image files, no network fetch) ---

export function createWoodTexture(baseColor, grainColor, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = grainColor;
    ctx.globalAlpha = 0.08 + Math.random() * 0.1;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 4 + (Math.random() - 0.5) * 3);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createRadialGradientTexture(inner = "rgba(255,255,255,0.9)", outer = "rgba(255,255,255,0)") {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// --- The modelled pieces ---

// glTF node name for each chess.js piece type.
const NODE_NAME = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };

// The model is authored at 1 unit per square, which makes the pieces
// slightly chunky next to the board's squares; this brings them to
// tournament proportions (king ≈ 1.7 squares tall, pawn ≈ 0.85).
const PIECE_SCALE = 0.8;

// The knight is modelled facing -Z (toward the opponent, from white's seat).
// Turned a quarter-turn it shows its profile to the default camera, which
// reads far better than a head-on view; white's knights face one way and
// black's the other so each side looks toward the centre of the board.
const KNIGHT_YAW = { w: -Math.PI / 4, b: Math.PI - Math.PI / 4 };

// Click-target size per piece type — used only by the interactive board,
// but kept here next to the model scale since the two are tuned together.
export const PIECE_HIT_SIZE = {
  p: { r: 0.24, h: 0.8 },
  r: { r: 0.3, h: 1.0 },
  n: { r: 0.3, h: 1.05 },
  b: { r: 0.28, h: 1.2 },
  q: { r: 0.32, h: 1.45 },
  k: { r: 0.32, h: 1.75 },
};

// Pure visual piece — no click handling. The interactive board wraps this
// with its own invisible hitbox and animation; the decorative ambient board
// renders it as-is.
export function PieceVisual({ type, color, position, rotationY = 0 }) {
  const { nodes } = useGLTF(PIECES_URL);
  const geometry = nodes[NODE_NAME[type]]?.geometry;

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: PIECE_COLOR[color],
      metalness: color === "w" ? 0.05 : 0.25,
      roughness: color === "w" ? 0.45 : 0.3,
    }),
    [color],
  );

  if (!geometry) return null;
  const yaw = rotationY + (type === "n" ? KNIGHT_YAW[color] : 0);

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={PIECE_SCALE}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow raycast={() => null} />
    </group>
  );
}

useGLTF.preload(PIECES_URL);

// Thin brass inlay running around the playing surface.
export function BoardTrim() {
  const props = { raycast: () => null, castShadow: false, receiveShadow: true };
  const mat = <meshStandardMaterial color="#b8963a" metalness={0.85} roughness={0.3} />;
  return (
    <group position={[0, 0.02, 0]}>
      <mesh position={[0, 0, 4.035]} {...props}><boxGeometry args={[8.14, 0.04, 0.07]} />{mat}</mesh>
      <mesh position={[0, 0, -4.035]} {...props}><boxGeometry args={[8.14, 0.04, 0.07]} />{mat}</mesh>
      <mesh position={[4.035, 0, 0]} {...props}><boxGeometry args={[0.07, 0.04, 8]} />{mat}</mesh>
      <mesh position={[-4.035, 0, 0]} {...props}><boxGeometry args={[0.07, 0.04, 8]} />{mat}</mesh>
    </group>
  );
}

// The standard starting position, as (square, type, color) triples — used
// by the ambient board, which has no chess.js instance of its own.
export const STARTING_PIECES = (() => {
  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const files = "abcdefgh";
  const list = [];
  for (let i = 0; i < 8; i++) {
    list.push({ square: `${files[i]}2`, type: "p", color: "w" });
    list.push({ square: `${files[i]}7`, type: "p", color: "b" });
    list.push({ square: `${files[i]}1`, type: backRank[i], color: "w" });
    list.push({ square: `${files[i]}8`, type: backRank[i], color: "b" });
  }
  return list;
})();