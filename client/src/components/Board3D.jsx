import { useEffect, useRef, useState, useMemo } from "react";
import { Chess } from "chess.js";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { socket } from "../socket";
import {
  squareToFileRank,
  squareToCoords,
  createWoodTexture,
  createRadialGradientTexture,
  PIECE_HIT_SIZE,
  PieceVisual,
} from "./boardVisuals";

const PROMOTION_PIECES = [
  { code: "q", label: "Queen" },
  { code: "r", label: "Rook" },
  { code: "b", label: "Bishop" },
  { code: "n", label: "Knight" },
];

const CAMERA_PRESETS = [
  { label: "Broadcast", position: [0, 9.5, 11], target: [0, 0.2, 0] },
  { label: "Right side", position: [15, 6.5, 0], target: [0, 0.4, 0] },
  { label: "Top-down", position: [0, 16, 0.01], target: [0, 0, 0] },
  { label: "Left side", position: [-15, 6.5, 0], target: [0, 0.4, 0] },
];

const FRAME_HEIGHT = 0.5;
const FRAME_SIZE = 9.6;

function CameraRig({ presetIndex }) {
  const { camera } = useThree();
  useFrame(() => {
    const preset = CAMERA_PRESETS[presetIndex];
    camera.position.lerp(
      { x: preset.position[0], y: preset.position[1], z: preset.position[2] },
      0.08,
    );
    camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);
  });
  return null;
}

// A click target for this piece, sized to its own silhouette (see
// boardVisuals.PIECE_HIT_SIZE) instead of a one-size-fits-all column. It
// sits right on the piece's own square, so a ray aimed at the piece's
// visible pixels hits this (close, small) volume before it can reach
// anything on a square further back — which is what was letting clicks on
// a short piece (a pawn) fall through to a taller piece one rank behind it
// (its king) under a raking camera angle.
function Piece({ type, color, position, square, onSquareClick }) {
  const hit = PIECE_HIT_SIZE[type] ?? { r: 0.3, h: 0.6 };
  return (
    <group position={position}>
      <PieceVisual type={type} color={color} position={[0, 0, 0]} />
      {onSquareClick && (
        <mesh
          position={[0, hit.h / 2, 0]}
          visible={false}
          onClick={(e) => { e.stopPropagation(); onSquareClick(square); }}
        >
          <cylinderGeometry args={[hit.r, hit.r, hit.h, 12]} />
          <meshBasicMaterial />
        </mesh>
      )}
    </group>
  );
}

function BoardSquares({ orientation, selectedSquare, legalTargets, cursorSquare, onSquareClick, lightWoodMap, darkWoodMap }) {
  const squares = useMemo(() => {
    const list = [];
    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const name = `${String.fromCharCode(97 + file)}${rank + 1}`;
        const isDark = (file + rank) % 2 === 0;
        list.push({ name, isDark, coords: squareToCoords(name, orientation) });
      }
    }
    return list;
  }, [orientation]);

  return (
    <>
      {squares.map(({ name, isDark, coords }) => {
        const isSelected = selectedSquare === name;
        const isLegal = legalTargets.includes(name);
        const isCursor = cursorSquare === name;
        return (
          <group key={name} position={coords}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
              <planeGeometry args={[1, 1]} />
              <meshStandardMaterial map={isDark ? darkWoodMap : lightWoodMap} roughness={0.85} metalness={0.03} />
            </mesh>

            {isSelected && (
              <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <planeGeometry args={[0.96, 0.96]} />
                <meshStandardMaterial color="#d4b24c" transparent opacity={0.45} />
              </mesh>
            )}
            {isLegal && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <torusGeometry args={[0.16, 0.035, 8, 24]} />
                <meshStandardMaterial color="#5fd97a" emissive="#5fd97a" emissiveIntensity={0.6} />
              </mesh>
            )}
            {isCursor && (
              <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <ringGeometry args={[0.42, 0.47, 32]} />
                <meshStandardMaterial color="#5fc9ff" emissive="#5fc9ff" emissiveIntensity={0.8} />
              </mesh>
            )}

            {/* Click target for an EMPTY square: a thin plate hugging the
                board surface, not a tall column. A piece standing on a
                square gets its own, correctly-sized hitbox (see Piece)
                that sits in front of this one, so this plate only ever
                catches clicks on bare wood — it no longer reaches up into
                the screen space of whatever is on the square behind it. */}
            <mesh
              position={[0, 0.03, 0]}
              visible={false}
              onClick={(e) => { e.stopPropagation(); onSquareClick(name); }}
            >
              <boxGeometry args={[0.96, 0.06, 0.96]} />
              <meshBasicMaterial />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export default function Board3D({ game }) {
  const [chess] = useState(() => new Chess(game.fen));
  const [fen, setFen] = useState(game.fen);
  const [clocks, setClocks] = useState(() => game.clocks ?? {
    white: game.timeMs,
    black: game.timeMs,
  });
  const [error, setError] = useState("");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [cursorSquare, setCursorSquare] = useState(
    () => (game.color === "white" ? "e2" : "e7"),
  );
  const authoritativeFen = useRef(game.fen);

  const lightWoodMap = useMemo(() => createWoodTexture("#d8c6a0", "#a8896a"), []);
  const darkWoodMap = useMemo(() => createWoodTexture("#4a1f1a", "#2a0f0c"), []);
  const frameWoodMap = useMemo(() => createWoodTexture("#3a1612", "#210a08"), []);
  const glowTexture = useMemo(() => createRadialGradientTexture(), []);
  const beamTexture = useMemo(
    () => createRadialGradientTexture("rgba(255,250,230,0.5)", "rgba(255,250,230,0)"),
    [],
  );

  useEffect(() => {
    function onUpdate(data) {
      // The server also broadcasts this event once a second just to sync
      // clocks, with no move involved — the fen is unchanged in that case.
      // Only clear the current selection when a move actually happened,
      // otherwise a routine clock tick wipes out whatever the player was
      // in the middle of selecting.
      const positionChanged = data.fen && data.fen !== authoritativeFen.current;

      if (data.fen) {
        authoritativeFen.current = data.fen;
        chess.load(data.fen);
        setFen(data.fen);
      }
      if (data.clocks) setClocks(data.clocks);

      if (positionChanged) {
        setSelectedSquare(null);
        setLegalTargets([]);
      }
      setError("");
    }
    function onError(data = {}) {
      chess.load(authoritativeFen.current);
      setFen(authoritativeFen.current);
      setError(data.error || "Move rejected.");
    }
    socket.on("game:update", onUpdate);
    socket.on("game:error", onError);
    return () => {
      socket.off("game:update", onUpdate);
      socket.off("game:error", onError);
    };
  }, [chess]);

  const playerTurn = game.color === "white" ? "w" : "b";

  // Keyboard play: arrow keys walk a highlighted cursor square (the cyan
  // ring) around the board, Enter does whatever a click on that square
  // would do (select a piece, move to it, or deselect), and Escape backs
  // out of a selection. "Up"/"Right" always mean "away from me"/"to my
  // right" from the player's own seat, so the mapping flips for black.
  useEffect(() => {
    function moveCursor(dFile, dRank) {
      const { file, rank } = squareToFileRank(cursorSquare);
      const flip = game.color === "black";
      const nextFile = Math.min(7, Math.max(0, file + (flip ? -dFile : dFile)));
      const nextRank = Math.min(7, Math.max(0, rank + (flip ? -dRank : dRank)));
      setCursorSquare(`${String.fromCharCode(97 + nextFile)}${nextRank + 1}`);
    }

    function onKeyDown(e) {
      const n = Number(e.key);
      if (n >= 1 && n <= CAMERA_PRESETS.length) {
        setPresetIndex(n - 1);
        return;
      }
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveCursor(0, 1);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveCursor(0, -1);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveCursor(1, 0);
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveCursor(-1, 0);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          handleSquareClick(cursorSquare);
          break;
        case "Escape":
          setSelectedSquare(null);
          setLegalTargets([]);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cursorSquare, selectedSquare, legalTargets, pendingPromotion, game.color]);

  function sendMove(from, to, promotion) {
    try {
      chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    } catch {
      return;
    }
    setFen(chess.fen());
    setSelectedSquare(null);
    setLegalTargets([]);
    setError("");
    socket.emit("game:move", { gameId: game.gameId, from, to, ...(promotion ? { promotion } : {}) });
  }

  function handleSquareClick(square) {
    if (pendingPromotion) return;

    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        setLegalTargets([]);
        return;
      }
      if (legalTargets.includes(square)) {
        const isPromotion = chess
          .moves({ square: selectedSquare, verbose: true })
          .some((m) => m.to === square && m.promotion);
        if (isPromotion) {
          setPendingPromotion({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          setLegalTargets([]);
        } else {
          sendMove(selectedSquare, square, undefined);
        }
        return;
      }
    }

    const piece = chess.get(square);
    if (piece && piece.color === playerTurn && chess.turn() === playerTurn) {
      setSelectedSquare(square);
      setLegalTargets(chess.moves({ square, verbose: true }).map((m) => m.to));
    } else {
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  }

  function choosePromotion(code) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    sendMove(from, to, code);
  }

  const pieces = useMemo(() => {
    const board = chess.board();
    const list = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = board[row][col];
        if (!cell) continue;
        const square = `${String.fromCharCode(97 + col)}${8 - row}`;
        list.push({ square, type: cell.type, color: cell.color, coords: squareToCoords(square, game.color) });
      }
    }
    return list;
  }, [fen, chess, game.color]);

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  const topColor = game.color === "white" ? "black" : "white";
  const bottomColor = game.color;

  return (
    <div style={containerStyle}>
      <div style={clockStyle}>Opponent ({topColor}): {formatClock(clocks[topColor])}</div>

      <div style={canvasWrapStyle}>
        <Canvas shadows camera={{ position: CAMERA_PRESETS[0].position, fov: 50 }}>
          <color attach="background" args={["#000000"]} />
          <fog attach="fog" args={["#000000", 18, 42]} />

          <Environment resolution={128} frames={1} background={false}>
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
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0004}
            shadow-camera-near={1}
            shadow-camera-far={25}
          />

          <CameraRig presetIndex={presetIndex} />

          {/* Floor, glow decal, and contact shadow are deliberately spaced
              well apart in height (0.5, 0.52, 0.48) to avoid z-fighting —
              coplanar or near-coplanar transparent planes flicker badly
              as the camera moves, which was the "black lines" artifact. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#050505" roughness={0.4} metalness={0.4} polygonOffset polygonOffsetFactor={1} />
          </mesh>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.47, 0]}>
            <planeGeometry args={[11, 11]} />
            <meshBasicMaterial
              map={glowTexture}
              transparent
              opacity={0.8}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* The beam's base must stay ABOVE the tallest piece (~0.8) —
              earlier it reached down to y=0 and its base disk sliced
              straight through the board and pieces, which is what showed
              up as a bright line that shifted/flickered as the camera
              moved. Stopping well short of the board fixes that. */}
          <mesh position={[0, 5.1, 0]}>
            <coneGeometry args={[3.2, 7.8, 32, 1, true]} />
            <meshBasicMaterial
              map={beamTexture}
              transparent
              opacity={0.12}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          <ContactShadows
            position={[0, -0.53, 0]}
            opacity={0.6}
            scale={14}
            blur={2}
            far={3}
            resolution={512}
          />

          <mesh position={[0, -FRAME_HEIGHT / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[FRAME_SIZE, FRAME_HEIGHT, FRAME_SIZE]} />
            <meshStandardMaterial map={frameWoodMap} roughness={0.4} metalness={0.15} />
          </mesh>

          <BoardSquares
            orientation={game.color}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            cursorSquare={cursorSquare}
            onSquareClick={handleSquareClick}
            lightWoodMap={lightWoodMap}
            darkWoodMap={darkWoodMap}
          />
          {pieces.map((p) => (
            <Piece
              key={p.square}
              type={p.type}
              color={p.color}
              position={p.coords}
              square={p.square}
              onSquareClick={handleSquareClick}
            />
          ))}

          {/* Bloom's threshold must stay high — at the lower threshold we
              had before, it was catching ordinary specular highlights on
              the wood (e.g. near the pawns) and inflating them into the
              bright smeared streak that got worse as the camera moved.
              Restricting it to only very bright pixels (the beam/glow)
              keeps the mood without that side effect. */}
          <EffectComposer multisampling={0}>
            <Bloom luminanceThreshold={0.85} luminanceSmoothing={0.15} intensity={0.35} />
          </EffectComposer>
        </Canvas>

        <div style={vignetteStyle} />

        <div style={cameraButtonRowStyle}>
          {CAMERA_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              style={{ ...cameraButtonStyle, borderColor: i === presetIndex ? "#d4b24c" : "#333" }}
              onClick={() => setPresetIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {pendingPromotion && (
          <div style={overlayStyle}>
            <div style={pickerBoxStyle}>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#ccc" }}>Promote to:</p>
              <div style={{ display: "flex", gap: 8 }}>
                {PROMOTION_PIECES.map((piece) => (
                  <button
                    key={piece.code}
                    className="btn btn-primary"
                    onClick={() => choosePromotion(piece.code)}
                  >
                    {piece.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={clockStyle}>You ({bottomColor}): {formatClock(clocks[bottomColor])}</div>
      {error && <p style={{ color: "#ff8a8a" }}>{error}</p>}
      <p style={keyboardHintStyle}>Arrow keys to move the cursor (cyan ring) · Enter to select/play · Esc to cancel</p>

      <button className="btn" onClick={() => socket.emit("game:resign", { gameId: game.gameId })}>
        Resign
      </button>
    </div>
  );
}

const containerStyle = { display: "flex", flexDirection: "column", alignItems: "center", gap: 10 };
const canvasWrapStyle = { position: "relative", width: "min(96vw, 900px)", height: "min(78vh, 760px)", background: "#000" };
const vignetteStyle = {
  position: "absolute", inset: 0, pointerEvents: "none",
  background: "radial-gradient(ellipse at center, transparent 45%, #000 92%)",
};
const clockStyle = { width: "min(96vw, 900px)", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#fff" };
const cameraButtonRowStyle = { position: "absolute", top: 8, right: 8, display: "flex", gap: 6 };
const keyboardHintStyle = { fontSize: 12, color: "#777", margin: 0 };
const cameraButtonStyle = { width: 28, height: 28, background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid #333", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const overlayStyle = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 };
const pickerBoxStyle = {
  background: "radial-gradient(ellipse at top, #121212f0 0%, #090909f0 70%)",
  border: "1px solid #262016",
  borderRadius: 10,
  boxShadow: "0 0 40px rgba(0,0,0,0.6)",
  backdropFilter: "blur(2px)",
  padding: "18px 20px",
  textAlign: "center",
};