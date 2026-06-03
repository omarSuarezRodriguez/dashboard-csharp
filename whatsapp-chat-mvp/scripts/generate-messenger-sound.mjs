import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "dashboard", "sounds");
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;

function writeWav(path, samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.floor(clamped * 32767 * 0.85), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function popTone(startSec, freq, durationSec) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.006);
    const decay = Math.exp(-t * 28);
    const env = attack * decay;
    const wobble = 1 + 0.04 * Math.sin(t * 120);
    out[i] = Math.sin(2 * Math.PI * freq * wobble * t) * env;
  }
  return { start, samples: out };
}

const totalSec = 0.42;
const totalSamples = Math.floor(totalSec * SAMPLE_RATE);
const mix = new Float64Array(totalSamples);

const pops = [
  popTone(0, 880, 0.14),
  popTone(0.1, 1174.66, 0.16),
];

for (const { start, samples } of pops) {
  for (let i = 0; i < samples.length; i++) {
    const idx = start + i;
    if (idx < totalSamples) mix[idx] += samples[i];
  }
}

let peak = 0;
for (const s of mix) peak = Math.max(peak, Math.abs(s));
const norm = peak > 0 ? 0.92 / peak : 1;
const normalized = mix.map((s) => s * norm);

writeWav(join(outDir, "messenger.wav"), normalized);
console.log("Wrote", join(outDir, "messenger.wav"));
