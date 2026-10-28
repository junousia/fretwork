// Tiny dense neural-network inference kernel for the Wasm runtime experiment.
// Layout: input[4] -> ReLU hidden[8] -> logits[13]. Weights are supplied by JS.

__attribute__((visibility("default")))
void predict(const float *input,
             const float *w1,
             const float *b1,
             const float *w2,
             const float *b2,
             float *output) {
  float hidden[8];
  for (int h = 0; h < 8; h++) {
    float value = b1[h];
    for (int i = 0; i < 4; i++) value += input[i] * w1[h * 4 + i];
    hidden[h] = value > 0.0f ? value : 0.0f;
  }
  for (int o = 0; o < 13; o++) {
    float value = b2[o];
    for (int h = 0; h < 8; h++) value += hidden[h] * w2[o * 8 + h];
    output[o] = value;
  }
}
