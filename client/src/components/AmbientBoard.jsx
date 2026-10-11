import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import {
  squareToCoords,
  createWoodTexture,
  createRadialGradientTexture,
  PieceVisual,
  STARTING_PIECES,
} from "./boardVisuals";

const FRAME_HEIGHT = 0.5;
const FRAME_SIZE = 9.6;

/**
 * The same board, lighting and piece geometry as the real game board, but
 * static (starting position, no clocks, no sockets) and non-interactive
 * (every mesh has raycast disabled) — reused as a decorative background
 * behind the login screen and the lobby instead of a stock photo. This
 * keeps the "no external assets, no network fetch" rule that the real
 * board already follows, and it's guaranteed to look consistent since both
 * boards share the exact same texture/geometry code (see boardVisuals.js).
 */
export default function AmbientBoard() {
  const lightWoodMap = useMemo(() => createWoodTexture("#d8c6a0", "#a8896a"), []);
  const darkWoodMap = useMemo(() => createWoodTexture("#4a1f1a", "#2a0f0c"), []);
  const frameWoodMap = useMemo(() => createWoodTexture("#3a1612", "#210a08"), []);
  const glowTexture = useMemo(() => createRadialGradientTexture(), []);

  const squares = useMemo(() => {
    const list = [];
    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const name = `${String.fromCharCode(97 + file)}${rank + 1}`;
        const isDark = (file + rank) % 2 === 0;
        list.push({ name, isDark, coords: squareToCoords(name, "white") });
      }
    }
    return list;
  }, []);

  const pieces = useMemo(
    () => STARTING_PIECES.map((p) => ({ ...p, coords: squareToCoords(p.square, "white") })),
    [],
  );

  return (
    <div style={wrapStyle}>
      <Canvas shadows camera={{ position: [0, 8.5, 12.5], fov: 45 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#000000"]} />
        <fog attach="fog" args={["#000000", 16, 34]} />

        <Environment resolution={64} frames={1} background={false}>
          <Lightformer form="rect" intensity={0.8} color="#fff5e0" scale={[10, 10, 1]} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer form="rect" intensity={0.2} color="#88aaff" scale={[8, 8, 1]} position={[-6, 3, -6]} rotation={[0, Math.PI / 4, 0]} />
        </Environment>

        <ambientLight intensity={0.05} />
        <spotLight
          position={[0, 9, 0]}
          angle={0.55}
          penumbra={0.55}
          intensity={320}
          distance={30}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0004}
        />

        <Turntable>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#050505" roughness={0.4} metalness={0.4} polygonOffset polygonOffsetFactor={1} />
          </mesh>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.47, 0]}>
            <planeGeometry args={[11, 11]} />
            <meshBasicMaterial map={glowTexture} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>

          <ContactShadows position={[0, -0.53, 0]} opacity={0.6} scale={14} blur={2} far={3} resolution={256} />

          <mesh position={[0, -FRAME_HEIGHT / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[FRAME_SIZE, FRAME_HEIGHT, FRAME_SIZE]} />
            <meshStandardMaterial map={frameWoodMap} roughness={0.4} metalness={0.15} />
          </mesh>

          {squares.map(({ name, isDark, coords }) => (
            <mesh key={name} position={coords} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
              <planeGeometry args={[1, 1]} />
              <meshStandardMaterial map={isDark ? darkWoodMap : lightWoodMap} roughness={0.85} metalness={0.03} />
            </mesh>
          ))}

          {pieces.map((p) => (
            <PieceVisual key={p.square} type={p.type} color={p.color} position={p.coords} />
          ))}
        </Turntable>

        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={0.35} />
        </EffectComposer>
      </Canvas>

      <div style={vignetteStyle} />
    </div>
  );
}

// Separated from the default export so the rotating group has a stable
// identity across re-renders (useMemo'd textures/pieces above would
// otherwise remount it every render if it were declared inline).
function Turntable({ children }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.25;
  });
  return <group ref={ref}>{children}</group>;
}

const wrapStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
};

const vignetteStyle = {
  position: "absolute",
  inset: 0,
  background: "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 55%, #000 95%)",
};