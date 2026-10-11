// Shared, render-only pieces of the 3D board — procedural textures, square
// math, and piece geometry — used by both the real interactive Board3D and
// the decorative AmbientBoard behind the login/lobby screens. Keeping this
// in one place means the two boards can never visually drift apart, and a
// fix made once (like the z-fighting nudge below) applies to both.
import * as THREE from "three";

export const PIECE_COLOR = { w: "#e8e4da", b: "#161616" };

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

// A turned-wood silhouette (wide foot, narrow waist, flared collar, tapered
// to a point), revolved around the Y axis with THREE.LatheGeometry — shared
// by every piece type so they read as one matching set.
// Height fractions are normalized so the last point (the taper's point)
// lands at exactly 1.0 — the profile used to close at 0.82, leaving every
// topper (placed assuming the body reached its full declared height)
// floating above the real apex with a visible gap. Fine print on a sphere
// or cone topper, but a glaring floating gap under the rook's flat
// crenellations and a disconnected head on the knight.
const BODY_PROFILE = [
  [0.95, 0.0], [0.95, 0.0366], [0.74, 0.122], [0.86, 0.1951], [0.64, 0.2561],
  [0.42, 0.6707], [0.5, 0.8293], [0.58, 0.9024], [0.4, 0.9512], [0.0, 1.0],
];

const bodyGeometryCache = new Map();
export function getBodyGeometry(height, baseRadius) {
  const key = `${height}:${baseRadius}`;
  let geo = bodyGeometryCache.get(key);
  if (!geo) {
    const points = BODY_PROFILE.map(([rf, hf]) => new THREE.Vector2(rf * baseRadius, hf * height));
    geo = new THREE.LatheGeometry(points, 24);
    bodyGeometryCache.set(key, geo);
  }
  return geo;
}

// A real horse-head silhouette (poll, ear, a concave forehead dip, a
// convex nose bridge, a pointed muzzle, and the signature concave "chin
// notch" every carved Staunton knight has) extruded into a thin solid —
// not a pile of stacked primitives. Drawn directly in the plane the main
// board cameras face (XY, extruded along Z), so it reads as a profile
// silhouette without any extra rotation trick.
const KNIGHT_HEAD_PROFILE = [
  [-0.06, 0.0], [-0.1, 0.1], [-0.11, 0.2], [-0.07, 0.28], [-0.02, 0.33],
  [0.0, 0.36], [0.015, 0.49], [0.038, 0.37], [0.07, 0.3], [0.1, 0.26],
  [0.15, 0.25], [0.19, 0.22], [0.22, 0.16], [0.225, 0.11], [0.15, 0.115],
  [0.12, 0.08], [0.1, 0.03], [0.04, -0.02], [-0.06, 0.0],
];

let knightHeadGeometry = null;
function getKnightHeadGeometry() {
  if (knightHeadGeometry) return knightHeadGeometry;
  const shape = new THREE.Shape();
  KNIGHT_HEAD_PROFILE.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  const depth = 0.16;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -depth / 2);
  knightHeadGeometry = geo;
  return geo;
}

export const BODY_DIMS = {
  p: { height: 0.34, radius: 0.26 },
  r: { height: 0.4, radius: 0.32 },
  n: { height: 0.32, radius: 0.3 },
  b: { height: 0.5, radius: 0.28 },
  q: { height: 0.58, radius: 0.3 },
  k: { height: 0.58, radius: 0.3 },
};

// Click-target size per piece type — used only by the interactive board,
// but kept next to BODY_DIMS since the two are tuned together.
export const PIECE_HIT_SIZE = {
  p: { r: 0.24, h: 0.55 },
  r: { r: 0.33, h: 0.5 },
  n: { r: 0.3, h: 0.65 },
  b: { r: 0.3, h: 0.75 },
  q: { r: 0.34, h: 0.88 },
  k: { r: 0.34, h: 0.88 },
};

// Pure visual piece — body + topper, no click handling. The interactive
// board wraps this with its own invisible hitbox; the decorative ambient
// board renders it as-is.
export function PieceVisual({ type, color, position }) {
  const fill = PIECE_COLOR[color];
  const matProps = { color: fill, metalness: 0.25, roughness: 0.35 };
  const visualProps = { castShadow: true, receiveShadow: true, raycast: () => null };
  const dims = BODY_DIMS[type] ?? { height: 0.4, radius: 0.28 };

  let topper;
  switch (type) {
    case "p":
      topper = <mesh position={[0, dims.height + 0.11, 0]} {...visualProps}><sphereGeometry args={[0.14, 16, 16]} /><meshStandardMaterial {...matProps} /></mesh>;
      break;
    case "r": {
      // A flat parapet cap sits directly on the body's apex point (closing
      // the gap that used to leave the merlons floating), and the four
      // corner merlons sit directly on the cap — nothing disconnected.
      const capThickness = 0.06;
      const capY = dims.height + capThickness / 2;
      const capTopY = dims.height + capThickness;
      topper = (
        <>
          <mesh position={[0, capY, 0]} {...visualProps}>
            <cylinderGeometry args={[dims.radius * 0.8, dims.radius * 0.72, capThickness, 20]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          {[[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].map(([dx, dz], i) => (
            <mesh key={i} position={[dx, capTopY + 0.055, dz]} {...visualProps}><boxGeometry args={[0.11, 0.11, 0.11]} /><meshStandardMaterial {...matProps} /></mesh>
          ))}
        </>
      );
      break;
    }
    case "n": {
      // A real horse-head silhouette (see KNIGHT_HEAD_PROFILE above),
      // extruded into a thin solid and sunk down into the body's apex —
      // not stacked spheres/cones, which read as a round blob with ear
      // nubs no matter how they were arranged. The profile is drawn in
      // the plane the main board cameras already face, so it reads as a
      // horse in profile from the actual in-game camera angles.
      topper = (
        <mesh position={[0, dims.height - 0.04, 0]} geometry={getKnightHeadGeometry()} {...visualProps}>
          <meshStandardMaterial {...matProps} />
        </mesh>
      );
      break;
    }
    case "b":
      topper = (
        <>
          <mesh position={[0, dims.height + 0.17, 0]} {...visualProps}><coneGeometry args={[0.15, 0.34, 16]} /><meshStandardMaterial {...matProps} /></mesh>
          <mesh position={[0, dims.height + 0.4, 0]} {...visualProps}><sphereGeometry args={[0.055, 12, 12]} /><meshStandardMaterial {...matProps} /></mesh>
        </>
      );
      break;
    case "q":
      topper = (
        <>
          <mesh position={[0, dims.height + 0.14, 0]} {...visualProps}><sphereGeometry args={[0.16, 18, 18]} /><meshStandardMaterial {...matProps} /></mesh>
          <mesh position={[0, dims.height + 0.32, 0]} {...visualProps}><coneGeometry args={[0.05, 0.12, 10]} /><meshStandardMaterial {...matProps} /></mesh>
        </>
      );
      break;
    case "k":
      topper = (
        <>
          <mesh position={[0, dims.height + 0.1, 0]} {...visualProps}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial {...matProps} /></mesh>
          <mesh position={[0, dims.height + 0.28, 0]} {...visualProps}><boxGeometry args={[0.07, 0.22, 0.07]} /><meshStandardMaterial {...matProps} /></mesh>
          <mesh position={[0, dims.height + 0.32, 0]} {...visualProps}><boxGeometry args={[0.2, 0.07, 0.07]} /><meshStandardMaterial {...matProps} /></mesh>
        </>
      );
      break;
    default:
      topper = null;
  }

  return (
    <group position={position}>
      <mesh geometry={getBodyGeometry(dims.height, dims.radius)} {...visualProps}>
        <meshStandardMaterial {...matProps} />
      </mesh>
      {topper}
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