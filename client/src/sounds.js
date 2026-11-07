// Tiny synthesized sound effects (Web Audio) — no audio files to download,
// no licensing, nothing to fail to load. A wooden "tock" for a move, a
// heavier knock for a capture, and a two-note chime for check.

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem("justchesschess_muted") === "1";
} catch {
  /* storage unavailable — default to sound on */
}

function getCtx() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem("justchesschess_muted", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function noiseBurst(c, { duration, freq, q, gain, when = 0 }) {
  const length = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + when);
}

function thump(c, { from, to, duration, gain, when = 0 }) {
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function tone(c, { freq, duration, gain, when = 0 }) {
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function playMove() {
  const c = getCtx();
  if (!c) return;
  noiseBurst(c, { duration: 0.05, freq: 1400, q: 1.2, gain: 0.5 });
  thump(c, { from: 220, to: 120, duration: 0.07, gain: 0.35 });
}

export function playCapture() {
  const c = getCtx();
  if (!c) return;
  noiseBurst(c, { duration: 0.09, freq: 900, q: 0.9, gain: 0.8 });
  thump(c, { from: 170, to: 70, duration: 0.14, gain: 0.6 });
  noiseBurst(c, { duration: 0.04, freq: 2200, q: 1.5, gain: 0.3, when: 0.06 });
}

export function playCheck() {
  const c = getCtx();
  if (!c) return;
  playMove();
  tone(c, { freq: 784, duration: 0.18, gain: 0.12, when: 0.08 });
  tone(c, { freq: 1047, duration: 0.28, gain: 0.12, when: 0.2 });
}