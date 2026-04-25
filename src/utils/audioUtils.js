export const WAVEFORM_VIEWBOX_WIDTH = 1000;
const WAVEFORM_MIDLINE = 50;
const WAVEFORM_MAX_AMPLITUDE = 40;

export const getAudioContext = () => {
  return new (window.AudioContext || window.webkitAudioContext)();
};

export const buildWaveformPeaks = (audioBuffer, peakCount = 240) => {
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPeak = Math.max(1, Math.floor(channelData.length / peakCount));
  const peaks = [];

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex++) {
    const start = peakIndex * samplesPerPeak;
    const end = Math.min(channelData.length, start + samplesPerPeak);
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      peak = Math.max(peak, Math.abs(channelData[sampleIndex]));
    }

    peaks.push(peak);
  }

  return peaks;
};

export const buildWaveformAreaPath = (peaks = []) => {
  if (!peaks.length) return '';

  const points = peaks.map((peak, index) => {
    const x = peaks.length === 1
      ? 0
      : (index / (peaks.length - 1)) * WAVEFORM_VIEWBOX_WIDTH;
    const amplitude = Math.max(2, peak * WAVEFORM_MAX_AMPLITUDE);

    return {
      x,
      topY: WAVEFORM_MIDLINE - amplitude,
      bottomY: WAVEFORM_MIDLINE + amplitude,
    };
  });

  let path = `M ${points[0].x} ${WAVEFORM_MIDLINE} `;
  path += `L ${points[0].x} ${points[0].topY} `;

  for (let index = 1; index < points.length; index++) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];
    const controlX = (previousPoint.x + currentPoint.x) / 2;

    path += `Q ${controlX} ${previousPoint.topY} ${currentPoint.x} ${currentPoint.topY} `;
  }

  path += `L ${points[points.length - 1].x} ${WAVEFORM_MIDLINE} `;

  for (let index = points.length - 1; index >= 0; index--) {
    const currentPoint = points[index];
    const previousPoint = points[index - 1] ?? currentPoint;
    const controlX = (previousPoint.x + currentPoint.x) / 2;

    path += `Q ${controlX} ${currentPoint.bottomY} ${previousPoint.x} ${previousPoint.bottomY} `;
  }

  path += 'Z';
  return path;
};

export const normalizeTrackFades = (track) => {
  const trimDuration = Math.max(0.01, track.trimEnd - track.trimStart);
  let fadeIn = Math.max(0, Math.min(track.fadeIn ?? 0, trimDuration));
  let fadeOut = Math.max(0, Math.min(track.fadeOut ?? 0, trimDuration));

  if (fadeIn + fadeOut > trimDuration) {
    const scale = trimDuration / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
  }

  return {
    ...track,
    fadeIn,
    fadeOut,
  };
};

export const bufferToWav = (audioBuffer) => {
  let numOfChan = audioBuffer.numberOfChannels;
  let length = audioBuffer.length * numOfChan * 2 + 44;
  let buffer = new ArrayBuffer(length);
  let view = new DataView(buffer);
  let channels = [];
  let offset = 0;
  let pos = 0;
  let sample;
  let index;

  const setUint16 = (data) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };

  const setUint32 = (data) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  setUint32(0x46464952);
  setUint32(length - 8);
  setUint32(0x45564157);
  setUint32(0x20746d66);
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164);
  setUint32(length - pos - 4);

  for (index = 0; index < audioBuffer.numberOfChannels; index++) {
    channels.push(audioBuffer.getChannelData(index));
  }

  while (offset < audioBuffer.length) {
    for (index = 0; index < numOfChan; index++) {
      sample = Math.max(-1, Math.min(1, channels[index][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

export const getTrackFadeDurations = (track, overlapWithPrevious = 0, overlapWithNext = 0) => {
  const trimDuration = Math.max(0.01, track.trimEnd - track.trimStart);
  let fadeInDuration = Math.max(track.fadeIn ?? 0, overlapWithPrevious);
  let fadeOutDuration = Math.max(track.fadeOut ?? 0, overlapWithNext);

  fadeInDuration = Math.min(fadeInDuration, trimDuration);
  fadeOutDuration = Math.min(fadeOutDuration, trimDuration);

  if (fadeInDuration + fadeOutDuration > trimDuration) {
    const scale = trimDuration / (fadeInDuration + fadeOutDuration);
    fadeInDuration *= scale;
    fadeOutDuration *= scale;
  }

  return {
    fadeInDuration,
    fadeOutDuration,
  };
};

export const getSafeTrackSegment = (track) => {
  const bufferDuration = track.buffer?.duration ?? track.duration ?? 0;
  const safeTrimStart = Math.max(0, Math.min(track.trimStart, bufferDuration));
  const safeTrimEnd = Math.max(safeTrimStart + 0.001, Math.min(track.trimEnd, bufferDuration));

  return {
    safeTrimStart,
    safeTrimEnd,
    safeTrimDuration: Math.max(0.001, safeTrimEnd - safeTrimStart),
  };
};

export const applyGainEnvelope = (gainNode, startTime, endTime, peakGain, fadeInDuration, fadeOutDuration) => {
  gainNode.gain.cancelScheduledValues(startTime);

  if (fadeInDuration > 0) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(peakGain, startTime + fadeInDuration);
  } else {
    gainNode.gain.setValueAtTime(peakGain, startTime);
  }

  const fadeOutStart = Math.max(startTime + fadeInDuration, endTime - fadeOutDuration);
  gainNode.gain.setValueAtTime(peakGain, fadeOutStart);

  if (fadeOutDuration > 0) {
    gainNode.gain.linearRampToValueAtTime(0, endTime);
  } else {
    gainNode.gain.setValueAtTime(peakGain, endTime);
  }
};