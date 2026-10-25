// Generates the Funny Mode sound pack: original, fully synthesized cartoon
// effects (pops, boings, squeaks, slides) written as small mono 16-bit WAVs.
// No third-party audio, no copyright concerns — deterministic math only.
// Regenerate with:  node tools/gen-funny-sounds.js
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join(__dirname, '..', 'sounds', 'packs', 'funny');
const PEAK = 0.45; // ~ -7 dBFS: playful, not painful

function render(seconds, fn) {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(-1, fn(i / SR, i / n)));
  return out;
}

// exponential attack/decay envelope
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

// linear chirp: frequency glides from f0 to f1 over `seconds`
function chirp(f0, f1, seconds, fn) {
  return render(seconds, (t, p) => {
    const f = f0 + (f1 - f0) * p;
    return Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * p) / 2)) * (fn ? fn(t, p) : env(t, 0.002, seconds * 0.4));
  });
}

function boing(f0, seconds, wobbleHz) {
  return render(seconds, (t, p) => {
    const f = f0 * (1 - 0.45 * p) + Math.sin(2 * Math.PI * wobbleHz * t) * 18 * (1 - p);
    const phase = 2 * Math.PI * f0 * t + Math.sin(2 * Math.PI * wobbleHz * t) * (18 / wobbleHz);
    return Math.sin(phase) * env(t, 0.003, seconds * 0.45);
  });
}

function noiseBurst(seconds, freq) {
  // deterministic pseudo-noise via a quick xorshift state
  let s = 0x1234abcd;
  return render(seconds, (t, p) => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const noise = ((s >>> 0) / 4294967295) * 2 - 1;
    const thump = Math.sin(2 * Math.PI * freq * t) * env(t, 0.001, seconds * 0.3);
    return (noise * 0.5 * (1 - p) + thump) * env(t, 0.001, seconds * 0.35);
  });
}

function twoTone(f1, f2, ms1, ms2) {
  const a = chirp(f1, f1, ms1 / 1000, (t, p) => env(t, 0.002, (ms1 / 1000) * 0.5) * (1 - p * 0.1));
  const b = chirp(f2, f2, ms2 / 1000, (t, p) => env(t, 0.002, (ms2 / 1000) * 0.4));
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const SOUNDS = {
  // regular keys — five round-robin takes so typing stays varied
  'press/GENERIC_R0.wav': () => chirp(600, 180, 0.08),          // cartoon pop
  'press/GENERIC_R1.wav': () => chirp(850, 260, 0.07),          // higher pop
  'press/GENERIC_R2.wav': () => chirp(180, 520, 0.09),          // bloop up
  'press/GENERIC_R3.wav': () => boing(240, 0.16, 22),           // tiny boing
  'press/GENERIC_R4.wav': () => noiseBurst(0.07, 150),          // goofy click
  // big keys
  'press/SPACE.wav': () => boing(200, 0.22, 14),                // spring boing
  'press/ENTER.wav': () => twoTone(987, 1318, 60, 110),         // game coin
  'press/BACKSPACE.wav': () => chirp(1400, 300, 0.26),          // slide whistle down
  'press/TAB.wav': () => chirp(400, 900, 0.06),                 // quick twip
  'press/ESCAPE.wav': () => chirp(700, 1600, 0.14),             // cartoon squeak
  // keyup — soft and short
  'release/GENERIC.wav': () => chirp(320, 140, 0.05),
};

function writeWav(rel, samples) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? PEAK / max : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  console.log('wrote ' + rel + ' (' + samples.length + ' samples, ' + (samples.length / SR * 1000).toFixed(0) + 'ms)');
}

for (const [rel, make] of Object.entries(SOUNDS)) writeWav(rel, make());
console.log('Funny Mode pack generated in ' + OUT);
