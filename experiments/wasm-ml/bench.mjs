import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const wasmBytes = await readFile(new URL('./inference.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasmBytes);
const { memory, predict } = instance.exports;

// Deterministic fixture weights only. These are not trained on music data.
const w1 = Float32Array.from({ length: 32 }, (_, i) => Math.sin(i * 0.73) * 0.4);
const b1 = Float32Array.from({ length: 8 }, (_, i) => Math.cos(i * 0.41) * 0.1);
const w2 = Float32Array.from({ length: 104 }, (_, i) => Math.cos(i * 0.29) * 0.3);
const b2 = Float32Array.from({ length: 13 }, (_, i) => Math.sin(i * 0.37) * 0.05);
const input = Float32Array.of(0.2, -0.4, 0.8, 0.1);

const inputOffset = 0;
const w1Offset = 16;
const b1Offset = w1Offset + w1.length * 4;
const w2Offset = b1Offset + b1.length * 4;
const b2Offset = w2Offset + w2.length * 4;
const outputOffset = b2Offset + b2.length * 4;
const memoryFloats = new Float32Array(memory.buffer);
const put = (offset, data) => memoryFloats.set(data, offset / 4);
put(inputOffset, input);
put(w1Offset, w1);
put(b1Offset, b1);
put(w2Offset, w2);
put(b2Offset, b2);

const jsHidden = new Float32Array(8);
const jsOutput = new Float32Array(13);
const jsPredict = (x) => {
  for (let h = 0; h < 8; h++) {
    let value = b1[h];
    for (let i = 0; i < 4; i++) value += x[i] * w1[h * 4 + i];
    jsHidden[h] = Math.max(0, value);
  }
  for (let o = 0; o < 13; o++) {
    let value = b2[o];
    for (let h = 0; h < 8; h++) value += jsHidden[h] * w2[o * 8 + h];
    jsOutput[o] = value;
  }
};

jsPredict(input);
predict(inputOffset, w1Offset, b1Offset, w2Offset, b2Offset, outputOffset);
const wasmOutput = new Float32Array(memory.buffer, outputOffset, 13).slice();
const maxError = Math.max(...jsOutput.map((x, i) => Math.abs(x - wasmOutput[i])));
if (maxError > 1e-6) throw new Error(`JS/Wasm mismatch: ${maxError}`);

const iterations = 500_000;
const time = (run) => {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) run();
  return performance.now() - start;
};
// Warm both paths before measuring; report multiple rounds to expose variability.
for (let i = 0; i < 20_000; i++) {
  jsPredict(input);
  predict(inputOffset, w1Offset, b1Offset, w2Offset, b2Offset, outputOffset);
}
const jsMs = time(() => jsPredict(input));
const wasmMs = time(() => predict(inputOffset, w1Offset, b1Offset, w2Offset, b2Offset, outputOffset));

console.log(JSON.stringify({
  runtime: process.version,
  iterations,
  maxOutputError: maxError,
  javascriptMs: Number(jsMs.toFixed(2)),
  wasmMs: Number(wasmMs.toFixed(2)),
  wasmVsJs: Number((wasmMs / jsMs).toFixed(2)),
}, null, 2));
