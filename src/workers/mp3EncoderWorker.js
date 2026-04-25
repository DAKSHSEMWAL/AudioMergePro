import lamejsSource from 'lamejs/lame.all.js?raw';

const lamejs = new Function(`${lamejsSource}; return lamejs;`)();

const float32ToInt16 = (input) => {
  const output = new Int16Array(input.length);

  for (let index = 0; index < input.length; index++) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 32768 : sample * 32767;
  }

  return output;
};

const concatUint8Arrays = (chunks) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });

  return merged;
};

self.onmessage = (event) => {
  try {
    const {
      channels,
      sampleRate,
      kbps,
      leftChannel,
      rightChannel,
    } = event.data;

    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    const left = float32ToInt16(new Float32Array(leftChannel));
    const right = channels > 1 && rightChannel
      ? float32ToInt16(new Float32Array(rightChannel))
      : null;
    const blockSize = 1152;
    const mp3Chunks = [];

    for (let index = 0; index < left.length; index += blockSize) {
      const leftChunk = left.subarray(index, index + blockSize);
      const mp3Buffer = channels > 1 && right
        ? encoder.encodeBuffer(leftChunk, right.subarray(index, index + blockSize))
        : encoder.encodeBuffer(leftChunk);

      if (mp3Buffer.length > 0) {
        mp3Chunks.push(new Uint8Array(mp3Buffer));
      }
    }

    const finalChunk = encoder.flush();
    if (finalChunk.length > 0) {
      mp3Chunks.push(new Uint8Array(finalChunk));
    }

    const mp3Data = concatUint8Arrays(mp3Chunks);
    self.postMessage({ mp3Buffer: mp3Data.buffer }, [mp3Data.buffer]);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};