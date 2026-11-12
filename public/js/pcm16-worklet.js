const TARGET_SAMPLE_RATE = 16_000;
const CHUNK_DURATION_SECONDS = 0.1;

function pcm16Chunk(input) {
  const outputLength = Math.round(TARGET_SAMPLE_RATE * CHUNK_DURATION_SECONDS);
  const output = new Int16Array(outputLength);
  const ratio = input.length / outputLength;
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.min(input.length - 1, Math.floor(index * ratio));
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex] || 0;
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    output[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return output;
}

class Pcm16CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.sourceChunkSize = Math.max(1, Math.round(sampleRate * CHUNK_DURATION_SECONDS));
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index += 1) this.samples.push(channel[index]);
    while (this.samples.length >= this.sourceChunkSize) {
      const source = this.samples.splice(0, this.sourceChunkSize);
      const pcm = pcm16Chunk(source);
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm16-capture", Pcm16CaptureProcessor);
