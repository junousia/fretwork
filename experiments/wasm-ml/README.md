# Wasm neural-network inference experiment

This is an isolated runtime experiment, not part of Fretwork's app. It runs the
same small dense neural-network inference kernel in JavaScript and WebAssembly
and checks that both produce the same output.

The network shape (4 → 8 → 13) is only a stand-in for musical features and
next-note logits. The deterministic weights in `bench.mjs` are fixtures, not
trained weights, so this experiment says nothing about musical quality or
prediction accuracy. Real weights need a suitable MIDI dataset and a training
step.

With LLVM/Clang and Node installed:

```sh
clang --target=wasm32 -O3 -nostdlib \
  -Wl,--no-entry -Wl,--export=predict -Wl,--export-memory \
  -Wl,--initial-memory=65536 -Wl,--max-memory=65536 \
  -o experiments/wasm-ml/inference.wasm experiments/wasm-ml/inference.c
node experiments/wasm-ml/bench.mjs
```

The benchmark includes a JS/Wasm output-equivalence check and measures 500,000
inference calls after warm-up. It uses Node's WebAssembly runtime as a quick
proxy; final app performance should be measured in target browsers, including
the cost of crossing the JS/Wasm boundary and copying model inputs.
