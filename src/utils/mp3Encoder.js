export const createMp3BlobInWorker = (audioBuffer, kbps = 320) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/mp3EncoderWorker.js', import.meta.url), {
      type: 'module',
    });

    const channels = Math.min(audioBuffer.numberOfChannels, 2);
    const leftChannel = new Float32Array(audioBuffer.getChannelData(0));
    const rightChannel = channels > 1
      ? new Float32Array(audioBuffer.getChannelData(1))
      : null;

    worker.onmessage = (event) => {
      worker.terminate();

      if (event.data?.error) {
        reject(new Error(event.data.error));
        return;
      }

      resolve(new Blob([event.data.mp3Buffer], { type: 'audio/mpeg' }));
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error instanceof Error ? error : new Error('MP3 encoding worker failed'));
    };

    worker.postMessage(
      {
        channels,
        sampleRate: audioBuffer.sampleRate,
        kbps,
        leftChannel: leftChannel.buffer,
        rightChannel: rightChannel?.buffer ?? null,
      },
      rightChannel
        ? [leftChannel.buffer, rightChannel.buffer]
        : [leftChannel.buffer],
    );
  });
};