import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Chess } from "chess.js";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, ContactShadows, RoundedBox } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { socket } from "../socket";
import {
  squareToFileRank,
  squareToCoords,
  createWoodTexture,
  createRadialGradientTexture,
  PIECE_HIT_SIZE,
  PieceVisual,
  BoardTrim,
} from "./boardVisuals";
import { reconcile, boardToMap } from "../pieceTracker";
import { playMove, playCapture, playCheck, isMuted, setMuted } from "../sounds";

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
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const preset = CAMERA_PRESETS[presetIndex];
    target.set(preset.position[0], preset.position[1], preset.position[2]);
    // Frame-rate independent easing: the camera glides to a new preset in
    // about the same time on a 30 fps laptop as on a 144 Hz monitor.
    camera.position.lerp(target, 1 - Math.exp(-5 * Math.min(delta, 0.1)));
    camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);
  });
  return null;
}

const easeInOut = (t) => t * t * (3 - 2 * t);

// A piece that glides to its new square instead of teleporting. Knights
// hop in a high arc (they jump over things); everything else slides with a
// small lift so it visibly leaves the board surface. The click target
// (below) rides along inside the same group, so it always sits on whatever
// square the piece is currently over.
function Piece({ type, color, position, square, onSquareClick }) {
  const hit = PIECE_HIT_SIZE[type] ?? { r: 0.3, h: 0.6 };
  const groupRef = useRef(null);
  const anim = useRef({ t: 1, dur: 0, from: null, to: position, lift: 0 });
  const placed = useRef(false);

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    if (!placed.current) {
      placed.current = true;
      g.position.set(position[0], position[1], position[2]);
      anim.current.to = position;
      return;
    }
    const from = g.position.clone();
    const dist = Math.hypot(position[0] - from.x, position[2] - from.z);
    if (dist < 0.001) return;
    anim.current = {
      t: 0,
      dur: Math.min(0.8, 0.2 + 0.09 * dist),
      from,
      to: position,
      lift: type === "n" ? 0.7 : Math.min(0.35, 0.12 + 0.03 * dist),
    };
  }, [position[0], position[1], position[2]]);

  useFrame((_, delta) => {
    const a = anim.current;
    const g = groupRef.current;
    if (!g || a.t >= 1) return;
    a.t = Math.min(1, a.t + delta / a.dur);
    const k = easeInOut(a.t);
    g.position.x = a.from.x + (a.to[0] - a.from.x) * k;
    g.position.z = a.from.z + (a.to[2] - a.from.z) * k;
    g.position.y = a.to[1] + Math.sin(Math.PI * a.t) * a.lift;
  });

  return (
    <group ref={groupRef}>
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

// A captured piece: waits a beat so the capturing piece lands first, then
// pops up, tips over and shrinks away.
function CapturedPiece({ type, color, position, onDone }) {
  const ref = useRef(null);
  const t = useRef(-0.18);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    t.current += delta;
    if (t.current < 0) return;
    const k = Math.min(1, t.current / 0.45);
    g.position.y = position[1] + Math.sin(k * Math.PI) * 0.35;
    g.rotation.z = k * 0.9;
    g.scale.setScalar(Math.max(0.001, 1 - easeInOut(k)));
    if (k >= 1) onDone();
  });
  return (
    <group ref={ref} position={position}>
      <PieceVisual type={type} color={color} position={[0, 0, 0]} />
    </group>
  );
}

function BoardSquares({ orientation, selectedSquare, legalTargets, cursorSquare, lastMove, onSquareClick, lightWoodMap, darkWoodMap }) {
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
        const isLastMove = lastMove.includes(name);
        return (
          <group key={name} position={coords}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
              <planeGeometry args={[1, 1]} />
              <meshStandardMaterial map={isDark ? darkWoodMap : lightWoodMap} roughness={0.85} metalness={0.03} />
            </mesh>

            {isLastMove && (
              <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="#d4b24c" transparent opacity={0.28} depthWrite={false} />
              </mesh>
            )}
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
                catches clicks on bare wood. */}
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
  const [muted, setMutedState] = useState(() => isMuted());
  const [cursorSquare, setCursorSquare] = useState(
    () => (game.color === "white" ? "e2" : "e7"),
  );
  const authoritativeFen = useRef(game.fen);

  // Piece identities persist across moves so they can be animated; see
  // pieceTracker.js. `ghosts` are just-captured pieces playing their exit.
  const [pieceList, setPieceList] = useState(() => reconcile([], boardToMap(chess.board())).pieces);
  const latestPieces = useRef(pieceList);
  const [ghosts, setGhosts] = useState([]);
  const [lastMove, setLastMove] = useState([]);

  const lightWoodMap = useMemo(() => createWoodTexture("#d8c6a0", "#a8896a"), []);
  const darkWoodMap = useMemo(() => createWoodTexture("#4a1f1a", "#2a0f0c"), []);
  const frameWoodMap = useMemo(() => createWoodTexture("#3a1612", "#210a08"), []);
  const glowTexture = useMemo(() => createRadialGradientTexture(), []);
  const beamTexture = useMemo(
    () => createRadialGradientTexture("rgba(255,250,230,0.5)", "rgba(255,250,230,0)"),
    [],
  );

  // Whenever the position changes — our own move, the opponent's, or a
  // rollback after a rejected move — work out what moved, animate it, and
  // play the matching sound.
  useEffect(() => {
    const result = reconcile(latestPieces.current, boardToMap(chess.board()));
    if (!result.changed) return;
    latestPieces.current = result.pieces;
    setPieceList(result.pieces);

    if (result.removed.length) {
      setGhosts((g) => [...g, ...result.removed]);
    }
    if (result.moves.length) {
      const main = result.moves.find((m) => m.type === "k") ?? result.moves[0];
      setLastMove([main.from, main.to]);
    }

    if (chess.inCheck()) playCheck();
    else if (result.removed.length) playCapture();
    else if (result.moves.length) playMove();
  }, [fen, chess]);

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

  const pieces = useMemo(
    () => pieceList.map((p) => ({ ...p, coords: squareToCoords(p.square, game.color) })),
    [pieceList, game.color],
  );

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }

  const topColor = game.color === "white" ? "black" : "white";
  const bottomColor = game.color;

  return (
    <div style={containerStyle}>
      <div style={clockStyle}>Opponent ({topColor}): {formatClock(clocks[topColor])}</div>

      <div className="board-canvas-wrap" style={canvasWrapStyle}>
        <Canvas shadows camera={{ position: CAMERA_PRESETS[0].position, fov: 50 }} dpr={[1, 2]}>
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

          {/* The beam's base must stay ABOVE the tallest piece — earlier it
              reached down to y=0 and its base disk sliced straight through
              the board and pieces, which is what showed up as a bright line
              that shifted/flickered as the camera moved. */}
          <mesh position={[0, 5.6, 0]}>
            <coneGeometry args={[3.2, 7.2, 32, 1, true]} />
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

          <RoundedBox
            args={[FRAME_SIZE, FRAME_HEIGHT, FRAME_SIZE]}
            radius={0.08}
            smoothness={4}
            position={[0, -FRAME_HEIGHT / 2, 0]}
            receiveShadow
            castShadow
          >
            <meshStandardMaterial map={frameWoodMap} roughness={0.4} metalness={0.15} />
          </RoundedBox>

          <BoardTrim />

          <BoardSquares
            orientation={game.color}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            cursorSquare={cursorSquare}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
            lightWoodMap={lightWoodMap}
            darkWoodMap={darkWoodMap}
          />

          <Suspense fallback={null}>
            {pieces.map((p) => (
              <Piece
                key={p.id}
                type={p.type}
                color={p.color}
                position={p.coords}
                square={p.square}
                onSquareClick={handleSquareClick}
              />
            ))}
            {ghosts.map((g) => (
              <CapturedPiece
                key={g.id}
                type={g.type}
                color={g.color}
                position={squareToCoords(g.square, game.color)}
                onDone={() => setGhosts((list) => list.filter((x) => x.id !== g.id))}
              />
            ))}
          </Suspense>

          {/* Bloom's threshold must stay high — at the lower threshold we
              had before, it was catching ordinary specular highlights on
              the wood and inflating them into a bright smeared streak that
              got worse as the camera moved. */}
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
          <button
            style={cameraButtonStyle}
            onClick={toggleMute}
            title={muted ? "Sound off — click to turn on" : "Sound on — click to mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
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

const containerStyle = { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" };
const canvasWrapStyle = { position: "relative", width: "min(96vw, 900px)", height: "min(78vh, 760px)", background: "#000" };
const vignetteStyle = {
  position: "absolute", inset: 0, pointerEvents: "none",
  background: "radial-gradient(ellipse at center, transparent 45%, #000 92%)",
};
const clockStyle = { width: "min(96vw, 900px)", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#fff" };
const cameraButtonRowStyle = { position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 2 };
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