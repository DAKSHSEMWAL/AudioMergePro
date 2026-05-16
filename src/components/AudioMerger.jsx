import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  Info,
  Layers,
  List,
  Loader2,
  Music,
  Play,
  Scissors,
  Upload,
} from 'lucide-react';

import TrackCard from './TrackCard';
import {
  applyGainEnvelope,
  buildWaveformPeaks,
  bufferToWav,
  getAudioContext,
  getSafeTrackSegment,
  getTrackFadeDurations,
  normalizeTrackFades,
} from '../utils/audioUtils';
import { createMp3BlobInWorker } from '../utils/mp3Encoder';
import { extractTrackMetadata, preloadTrackMetadataParser } from '../utils/trackMetadata';
import { getTrackTheme } from '../utils/trackThemes';
import { formatTime } from '../utils/timeUtils';

const createTrackId = () => Math.random().toString(36).slice(2, 11);

export default function AudioMerger() {
  const [tracks, setTracks] = useState([]);
  const [crossfade, setCrossfade] = useState(2);
  const [mergeMode, setMergeMode] = useState('sequential');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergedOutput, setMergedOutput] = useState(null);
  const [error, setError] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [previewPositions, setPreviewPositions] = useState({});
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const fileInputRef = useRef(null);
  const previewPlaybackRef = useRef(null);
  const previewFrameRef = useRef(null);
  const exportJobRef = useRef(0);
  const exportMenuRef = useRef(null);
  const mergedOutputRef = useRef(null);

  const clearMergedOutput = () => {
    setMergedOutput((previousOutput) => {
      if (previousOutput) {
        URL.revokeObjectURL(previousOutput.wavUrl);
        if (previousOutput.mp3Url) {
          URL.revokeObjectURL(previousOutput.mp3Url);
        }
      }

      return null;
    });
  };

  const stopPreviewPlayback = (resetTrackId = null) => {
    if (previewFrameRef.current) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }

    const activePreview = previewPlaybackRef.current;
    if (activePreview?.source) {
      try {
        activePreview.source.onended = null;
        activePreview.source.stop();
      } catch {
        // Ignore already-stopped sources.
      }
    }

    if (activePreview?.audioCtx && activePreview.audioCtx.state !== 'closed') {
      activePreview.audioCtx.close().catch(() => {});
    }

    previewPlaybackRef.current = null;
    setPlayingTrackId(null);

    if (resetTrackId) {
      setPreviewPositions((previous) => ({
        ...previous,
        [resetTrackId]: null,
      }));
    }
  };

  useEffect(() => {
    mergedOutputRef.current = mergedOutput;
  }, [mergedOutput]);

  useEffect(() => {
    return () => {
      stopPreviewPlayback();

      if (mergedOutputRef.current) {
        URL.revokeObjectURL(mergedOutputRef.current.wavUrl);
        if (mergedOutputRef.current.mp3Url) {
          URL.revokeObjectURL(mergedOutputRef.current.mp3Url);
        }
      }
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setError('');

    let audioCtx;

    try {
      audioCtx = getAudioContext();
      const newTracks = [];

      for (const file of files) {
        const metadata = await extractTrackMetadata(file);
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        newTracks.push({
          id: createTrackId(),
          file,
          name: file.name,
          buffer: audioBuffer,
          displayTitle: metadata.title || file.name,
          artist: metadata.artist,
          album: metadata.album,
          codec: metadata.codec,
          bitrate: metadata.bitrate,
          sampleRate: metadata.sampleRate,
          artworkUrl: metadata.artworkUrl,
          artworkFallbackUrls: metadata.artworkFallbackUrls,
          waveformPeaks: buildWaveformPeaks(audioBuffer),
          duration: audioBuffer.duration,
          trimStart: 0,
          trimEnd: audioBuffer.duration,
          fadeIn: 0,
          fadeOut: 0,
          zoom: 1,
        });
      }

      setTracks((previous) => [...previous, ...newTracks]);
      clearMergedOutput();
    } catch (uploadError) {
      console.error('Error decoding audio:', uploadError);
      setError('Failed to decode one or more audio files. Please ensure they are valid audio files.');
    } finally {
      setIsProcessing(false);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateTrackTrim = (id, type, value) => {
    setTracks((previous) => previous.map((track) => {
      if (track.id !== id) return track;

      const previousTrimDuration = Math.max(0.01, track.trimEnd - track.trimStart);
      let nextValue = Number(value);
      if (Number.isNaN(nextValue)) return track;

      nextValue = Math.max(0, Math.min(track.duration, nextValue));
      const nextTrack = { ...track, [type]: nextValue };

      if (type === 'trimStart' && nextTrack.trimStart >= nextTrack.trimEnd) {
        nextTrack.trimStart = Math.max(0, nextTrack.trimEnd - 0.01);
      }

      if (type === 'trimEnd' && nextTrack.trimEnd <= nextTrack.trimStart) {
        nextTrack.trimEnd = Math.min(track.duration, nextTrack.trimStart + 0.01);
      }

      const nextTrimDuration = Math.max(0.01, nextTrack.trimEnd - nextTrack.trimStart);

      if (nextTrimDuration < previousTrimDuration) {
        const trimRatio = nextTrimDuration / previousTrimDuration;
        nextTrack.fadeIn = (track.fadeIn ?? 0) * trimRatio;
        nextTrack.fadeOut = (track.fadeOut ?? 0) * trimRatio;
      }

      return normalizeTrackFades(nextTrack);
    }));

    clearMergedOutput();
  };

  const updateTrackFade = (id, type, value) => {
    setTracks((previous) => previous.map((track) => {
      if (track.id !== id) return track;

      const fadeValue = Number(value);
      if (Number.isNaN(fadeValue)) return track;

      return normalizeTrackFades({
        ...track,
        [type]: Math.max(0, fadeValue),
      });
    }));

    clearMergedOutput();
  };

  const updateTrackZoom = (id, zoom) => {
    setTracks((previous) => previous.map((track) => (
      track.id === id ? { ...track, zoom } : track
    )));
  };

  const removeTrack = (id) => {
    if (playingTrackId === id) {
      stopPreviewPlayback(id);
    }

    setTracks((previous) => previous.filter((track) => track.id !== id));
    clearMergedOutput();
  };

  const duplicateTrack = (id) => {
    setTracks((previous) => {
      const index = previous.findIndex((track) => track.id === id);
      if (index === -1) return previous;

      const sourceTrack = previous[index];
      const nextTrack = {
        ...sourceTrack,
        id: createTrackId(),
      };

      const nextTracks = [...previous];
      nextTracks.splice(index + 1, 0, nextTrack);
      return nextTracks;
    });

    clearMergedOutput();
  };

  const moveTrack = (index, direction) => {
    setTracks((previous) => {
      const nextTracks = [...previous];

      if (direction === 'up' && index > 0) {
        [nextTracks[index - 1], nextTracks[index]] = [nextTracks[index], nextTracks[index - 1]];
      } else if (direction === 'down' && index < previous.length - 1) {
        [nextTracks[index], nextTracks[index + 1]] = [nextTracks[index + 1], nextTracks[index]];
      }

      return nextTracks;
    });

    clearMergedOutput();
  };

  const getSequentialOverlap = (currentTrack, nextTrack) => {
    if (!nextTrack || crossfade <= 0) return 0;

    const currentDuration = currentTrack.trimEnd - currentTrack.trimStart;
    const nextDuration = nextTrack.trimEnd - nextTrack.trimStart;

    return Math.max(0, Math.min(crossfade, currentDuration, nextDuration));
  };

  const timelineSegments = useMemo(() => {
    let currentTimeInTimeline = 0;

    return tracks.map((track, index) => {
      const { safeTrimDuration } = getSafeTrackSegment(track);
      const start = mergeMode === 'sequential' ? currentTimeInTimeline : 0;
      const end = start + safeTrimDuration;

      if (mergeMode === 'sequential') {
        currentTimeInTimeline = end - getSequentialOverlap(track, tracks[index + 1]);
      }

      return {
        id: track.id,
        start,
        end,
        duration: safeTrimDuration,
      };
    });
  }, [tracks, mergeMode, crossfade]);

  const totalTimelineDuration = useMemo(() => {
    if (timelineSegments.length === 0) return 0;
    return timelineSegments.reduce((maxDuration, segment) => Math.max(maxDuration, segment.end), 0);
  }, [timelineSegments]);

  const globalPlayheadTime = useMemo(() => {
    if (!playingTrackId) return null;

    const activeTrack = tracks.find((track) => track.id === playingTrackId);
    const activeSegment = timelineSegments.find((segment) => segment.id === playingTrackId);
    const previewTime = previewPositions[playingTrackId];

    if (!activeTrack || !activeSegment || previewTime == null) return null;

    const offsetWithinTrack = Math.max(0, previewTime - activeTrack.trimStart);
    return Math.min(totalTimelineDuration, activeSegment.start + offsetWithinTrack);
  }, [playingTrackId, previewPositions, timelineSegments, totalTimelineDuration, tracks]);

  const timelineTicks = useMemo(() => {
    if (totalTimelineDuration <= 0) return [];

    const preferredTickCount = 5;
    const rawStep = totalTimelineDuration / preferredTickCount;

    const normalizedStep = (() => {
      if (rawStep <= 5) return 5;
      if (rawStep <= 10) return 10;
      if (rawStep <= 15) return 15;
      if (rawStep <= 30) return 30;
      if (rawStep <= 60) return 60;
      if (rawStep <= 120) return 120;
      return 300;
    })();

    const ticks = [];
    for (let tick = 0; tick <= totalTimelineDuration + normalizedStep / 2; tick += normalizedStep) {
      ticks.push(Number(tick.toFixed(3)));
    }

    return ticks;
  }, [totalTimelineDuration]);

  const downloadOutput = (format) => {
    if (!mergedOutput) return;

    const link = document.createElement('a');
    if (format === 'wav') {
      link.href = mergedOutput.wavUrl;
      link.download = 'merged_audio.wav';
    } else if (format === 'mp3' && mergedOutput.mp3Url) {
      link.href = mergedOutput.mp3Url;
      link.download = 'merged_audio_320kbps.mp3';
    } else {
      return;
    }

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  const mergeTracks = async () => {
    if (tracks.length === 0) return;

    setIsProcessing(true);
    setError('');

    let audioCtx;

    try {
      const exportJobId = Date.now();
      exportJobRef.current = exportJobId;
      let totalDuration = 0;
      let currentTimeInContext = 0;

      if (mergeMode === 'sequential') {
        for (let index = 0; index < tracks.length; index++) {
          const { safeTrimDuration } = getSafeTrackSegment(tracks[index]);
          const trackEndTime = currentTimeInContext + safeTrimDuration;
          totalDuration = trackEndTime;

          const overlap = getSequentialOverlap(tracks[index], tracks[index + 1]);
          currentTimeInContext = trackEndTime - overlap;
        }
      } else {
        tracks.forEach((track) => {
          const { safeTrimDuration } = getSafeTrackSegment(track);
          totalDuration = Math.max(totalDuration, safeTrimDuration);
        });
      }

      totalDuration = Math.max(0.1, totalDuration);
      audioCtx = getAudioContext();
      const offlineCtx = new OfflineAudioContext(
        2,
        Math.ceil(audioCtx.sampleRate * totalDuration),
        audioCtx.sampleRate,
      );

      currentTimeInContext = 0;

      tracks.forEach((track, index) => {
        const source = offlineCtx.createBufferSource();
        source.buffer = track.buffer;

        const gainNode = offlineCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        const { safeTrimStart, safeTrimDuration } = getSafeTrackSegment(track);
        const startTimeInContext = mergeMode === 'sequential' ? currentTimeInContext : 0;
        const endTimeInContext = startTimeInContext + safeTrimDuration;
        const overlapWithPrevious = mergeMode === 'sequential' && index > 0
          ? getSequentialOverlap(tracks[index - 1], track)
          : 0;
        const overlapWithNext = mergeMode === 'sequential'
          ? getSequentialOverlap(track, tracks[index + 1])
          : 0;
        const { fadeInDuration, fadeOutDuration } = getTrackFadeDurations(
          track,
          overlapWithPrevious,
          overlapWithNext,
        );
        const peakGain = mergeMode === 'mix' ? 0.8 : 1;

        source.start(startTimeInContext, safeTrimStart, safeTrimDuration);
        applyGainEnvelope(
          gainNode,
          startTimeInContext,
          endTimeInContext,
          peakGain,
          fadeInDuration,
          fadeOutDuration,
        );

        if (mergeMode === 'sequential') {
          currentTimeInContext = endTimeInContext - overlapWithNext;
        }
      });

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = bufferToWav(renderedBuffer);
      const wavUrl = URL.createObjectURL(wavBlob);

      clearMergedOutput();
      setMergedOutput({
        wavUrl,
        mp3Url: null,
        mp3Status: 'processing',
        previewUrl: wavUrl,
      });

      void createMp3BlobInWorker(renderedBuffer, 320)
        .then((mp3Blob) => {
          if (exportJobRef.current !== exportJobId) {
            return;
          }

          const mp3Url = URL.createObjectURL(mp3Blob);
          setMergedOutput((previousOutput) => {
            if (!previousOutput || previousOutput.wavUrl !== wavUrl) {
              URL.revokeObjectURL(mp3Url);
              return previousOutput;
            }

            if (previousOutput.mp3Url) {
              URL.revokeObjectURL(previousOutput.mp3Url);
            }

            return {
              ...previousOutput,
              mp3Url,
              mp3Status: 'ready',
            };
          });
        })
        .catch((mp3Error) => {
          console.error('MP3 export failed:', mp3Error);
          if (exportJobRef.current !== exportJobId) {
            return;
          }

          setMergedOutput((previousOutput) => {
            if (!previousOutput || previousOutput.wavUrl !== wavUrl) {
              return previousOutput;
            }

            return {
              ...previousOutput,
              mp3Status: 'failed',
            };
          });
        });
    } catch (mergeError) {
      console.error('Merging failed:', mergeError);
      const errorMessage = mergeError instanceof Error ? mergeError.message : String(mergeError);
      setError(`Failed to merge audio: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    }
  };

  const playTrack = async (track, startOffset = track.trimStart, toggleIfSame = true) => {
    try {
      if (playingTrackId === track.id && toggleIfSame) {
        stopPreviewPlayback(track.id);
        return;
      }

      stopPreviewPlayback();

      const audioCtx = getAudioContext();
      const previewStart = Math.max(track.trimStart, Math.min(track.trimEnd - 0.001, startOffset));
      const trimDuration = Math.max(0.001, track.trimEnd - previewStart);
      const originalTrimDuration = Math.max(0.001, track.trimEnd - track.trimStart);
      const remainingRatio = trimDuration / originalTrimDuration;
      const fadeInDuration = previewStart > track.trimStart ? 0 : Math.min(track.fadeIn ?? 0, trimDuration);
      const fadeOutDuration = Math.min((track.fadeOut ?? 0) * remainingRatio, trimDuration);

      const gainNode = audioCtx.createGain();
      const source = audioCtx.createBufferSource();
      source.buffer = track.buffer;
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      setPlayingTrackId(track.id);
      setPreviewPositions((previous) => ({
        ...previous,
        [track.id]: previewStart,
      }));

      const now = audioCtx.currentTime;
      applyGainEnvelope(gainNode, now, now + trimDuration, 1, fadeInDuration, fadeOutDuration);
      source.start(now, previewStart, trimDuration);

      previewPlaybackRef.current = {
        trackId: track.id,
        source,
        audioCtx,
        startedAt: now,
        previewStart,
        previewEnd: track.trimEnd,
      };

      const syncPreviewPosition = () => {
        const activePreview = previewPlaybackRef.current;
        if (!activePreview || activePreview.trackId !== track.id) return;

        const elapsed = Math.max(0, activePreview.audioCtx.currentTime - activePreview.startedAt);
        const currentTime = Math.min(activePreview.previewEnd, activePreview.previewStart + elapsed);

        setPreviewPositions((previous) => ({
          ...previous,
          [track.id]: currentTime,
        }));

        if (currentTime < activePreview.previewEnd) {
          previewFrameRef.current = requestAnimationFrame(syncPreviewPosition);
        }
      };

      previewFrameRef.current = requestAnimationFrame(syncPreviewPosition);
      source.stop(now + trimDuration);
      source.onended = () => {
        stopPreviewPlayback();
        setPreviewPositions((previous) => ({
          ...previous,
          [track.id]: track.trimStart,
        }));
      };
    } catch (playbackError) {
      console.error('Error playing track:', playbackError);
      setError('Failed to play track');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(67,56,202,0.16),transparent_30%),linear-gradient(180deg,#060a16,#040814_55%,#030611)] p-3 font-sans text-slate-100 md:p-4 lg:p-5">
      <div className="w-full rounded-[32px] border border-indigo-500/20 bg-[linear-gradient(180deg,rgba(4,8,20,0.96),rgba(4,8,18,0.98))] p-3 shadow-[0_30px_120px_rgba(2,6,23,0.85)] md:p-4">
        <header className="mb-4 flex flex-col gap-3 rounded-[28px] border border-white/5 bg-[linear-gradient(180deg,rgba(10,15,33,0.98),rgba(5,9,22,0.98))] p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-2xl bg-[linear-gradient(180deg,#6d4aff,#5630db)] p-3 shadow-[0_16px_32px_rgba(86,48,219,0.35)]">
              <Music className="h-5 w-5 text-white md:h-6 md:w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-white md:text-2xl">AudioMerge Pro</h1>
              <p className="truncate text-sm text-slate-400">Trim, fade, preview, and merge tracks locally in a browser-first editor.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex rounded-2xl border border-white/5 bg-slate-950/70 p-1">
              <button
                onClick={() => {
                  setMergeMode('sequential');
                  clearMergedOutput();
                }}
                className={`flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm transition ${mergeMode === 'sequential' ? 'bg-[#6d4aff] text-white shadow-[0_10px_24px_rgba(109,74,255,0.35)]' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}`}
              >
                <List className="h-4 w-4" />
                <span>Sequential</span>
              </button>
              <button
                onClick={() => {
                  setMergeMode('mix');
                  clearMergedOutput();
                }}
                className={`flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm transition ${mergeMode === 'mix' ? 'bg-[#6d4aff] text-white shadow-[0_10px_24px_rgba(109,74,255,0.35)]' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}`}
              >
                <Layers className="h-4 w-4" />
                <span>Mix / Layer</span>
              </button>
            </div>

            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen((previous) => !previous)}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-200 transition hover:border-white/10 hover:bg-slate-900"
              >
                <Download className="h-4 w-4 text-slate-400" />
                <span>Export</span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition ${isExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-30 min-w-64 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(11,16,34,0.98),rgba(7,12,24,0.98))] p-2 shadow-[0_24px_60px_rgba(2,6,23,0.72)]">
                  <button
                    type="button"
                    onClick={() => downloadOutput('wav')}
                    disabled={!mergedOutput}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-100">Export WAV</div>
                      <div className="text-xs text-slate-500">Lossless master output</div>
                    </div>
                    <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300">Ready</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadOutput('mp3')}
                    disabled={!mergedOutput || mergedOutput.mp3Status !== 'ready' || !mergedOutput.mp3Url}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-100">Export MP3</div>
                      <div className="text-xs text-slate-500">320 kbps worker-encoded output</div>
                    </div>
                    <span className="rounded-lg bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-300">
                      {!mergedOutput ? 'Locked' : mergedOutput.mp3Status === 'ready' ? 'Ready' : mergedOutput.mp3Status === 'processing' ? 'Processing' : 'Unavailable'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-500/20 p-3 text-red-200 md:gap-3 md:p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm md:text-base">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-[28px] border border-white/5 bg-[linear-gradient(180deg,rgba(9,14,30,0.98),rgba(4,8,18,0.98))] p-3.5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Scissors className="h-4 w-4 text-violet-300" />
                <span>Track Sequence ({tracks.length})</span>
                </h2>
              </div>

              {tracks.length === 0 ? (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center text-slate-500">
                  <Music className="mb-3 h-10 w-10 opacity-20" />
                  <p>No tracks added yet.</p>
                  <p className="mt-1 text-xs">Upload audio files to build your sequence.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tracks.map((track, index) => {
                    const theme = getTrackTheme(index);
                    return (
                      <div
                        key={track.id}
                        className="rounded-[18px] border border-white/5 bg-white/[0.02] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[14px] border border-white/10 bg-slate-900">
                            {track.artworkUrl ? (
                              <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div
                                className="flex h-full w-full items-center justify-center"
                                style={{ background: `linear-gradient(135deg, rgba(${theme.accent}, 0.28), rgba(${theme.accentDeep}, 0.55))` }}
                              >
                                <Music className="h-4 w-4 text-white" />
                              </div>
                            )}
                          </div>
                          <span
                            className="inline-flex h-7 min-w-7 items-center justify-center rounded-[10px] px-2 text-xs font-semibold text-white"
                            style={{ backgroundColor: `rgba(${theme.accent}, 0.82)` }}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-slate-100">{track.displayTitle || track.name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">{formatTime(track.duration)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2 rounded-[20px] border border-white/5 bg-white/[0.02] p-2.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.wma,.aiff"
                  multiple
                  className="hidden"
                />
                <button
                  onClick={() => {
                    preloadTrackMetadataParser();
                    fileInputRef.current?.click();
                  }}
                  disabled={isProcessing}
                  className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-white/5 bg-[linear-gradient(180deg,rgba(32,41,64,0.92),rgba(18,24,40,0.98))] px-3 py-3 text-sm text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>Add Audio Files</span>
                </button>

                <button
                  onClick={mergeTracks}
                  disabled={tracks.length === 0 || isProcessing}
                  className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(180deg,#6d4aff,#5630db)] px-3 py-3 text-sm text-white shadow-[0_18px_40px_rgba(86,48,219,0.32)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span className="font-semibold">{isProcessing ? 'Processing...' : 'Merge Tracks'}</span>
                </button>
              </div>

              <div className="space-y-2 rounded-[20px] border border-white/5 bg-white/[0.02] p-2.5">
                {mergeMode === 'sequential' && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">Crossfade</label>
                      <span className="text-xs font-semibold text-violet-300">{crossfade.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={crossfade}
                      onChange={(event) => {
                        setCrossfade(Number(event.target.value));
                        clearMergedOutput();
                      }}
                      className="w-full"
                      style={{ accentColor: '#6d4aff' }}
                    />
                  </div>
                )}
                <div className="rounded-[16px] border border-white/5 bg-slate-950/55 p-3 text-[11px] text-slate-400">
                  {mergeMode === 'sequential'
                    ? 'Tracks play one after another with optional crossfades.'
                    : 'Tracks start together for layered mixes.'}
                </div>
              </div>
            </aside>

            <section className="rounded-[28px] border border-white/5 bg-[linear-gradient(180deg,rgba(9,14,30,0.98),rgba(4,8,18,0.98))] p-4 md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Timeline Editor</h2>
                <p className="text-sm text-slate-500">Album art, waveform lanes, trim windows, and fade envelopes are aligned in one editing stage.</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <div className="rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">Mode: {mergeMode === 'sequential' ? 'Sequential' : 'Mix / Layer'}</div>
                <div className="rounded-xl border border-white/5 bg-slate-950/60 px-3 py-2">Tracks: {tracks.length}</div>
              </div>
              </div>

              <div className="mb-4 rounded-[24px] border border-white/5 bg-[linear-gradient(180deg,rgba(10,16,33,0.98),rgba(5,10,20,0.98))] p-4">
                <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <span>Global Timeline</span>
                  <span>{totalTimelineDuration > 0 ? formatTime(totalTimelineDuration) : '00:00'}</span>
                </div>
                <div className="relative h-16 overflow-hidden rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(6,10,20,0.92),rgba(4,7,16,0.98))]">
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:96px_100%] opacity-35" />
                  {timelineTicks.map((tick) => {
                    const left = totalTimelineDuration > 0 ? (tick / totalTimelineDuration) * 100 : 0;
                    return (
                      <div key={tick} className="absolute inset-y-0" style={{ left: `${left}%` }}>
                        <div className="h-full w-px bg-white/10" />
                        <span className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap text-[11px] text-slate-400">
                          {formatTime(tick)}
                        </span>
                      </div>
                    );
                  })}
                  {timelineSegments.map((segment, index) => {
                    const left = totalTimelineDuration > 0 ? (segment.start / totalTimelineDuration) * 100 : 0;
                    const width = totalTimelineDuration > 0 ? ((segment.end - segment.start) / totalTimelineDuration) * 100 : 0;
                    const theme = getTrackTheme(index);
                    return (
                      <div
                        key={segment.id}
                        className="absolute bottom-3 top-8 rounded-xl border"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 2)}%`,
                          background: `linear-gradient(180deg, rgba(${theme.accent}, 0.22), rgba(${theme.accentDeep}, 0.12))`,
                          borderColor: `rgba(${theme.accentSoft}, 0.26)`,
                          boxShadow: `0 10px 24px rgba(${theme.glow}, 0.12)`,
                        }}
                      />
                    );
                  })}
                  {globalPlayheadTime != null && totalTimelineDuration > 0 && (
                    <div
                      className="absolute inset-y-0 z-20 w-px bg-white/90 shadow-[0_0_14px_rgba(255,255,255,0.45)]"
                      style={{ left: `${(globalPlayheadTime / totalTimelineDuration) * 100}%` }}
                    >
                      <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-200/80 bg-violet-300 shadow-[0_0_16px_rgba(196,181,253,0.85)]" />
                    </div>
                  )}
                </div>
              </div>

              {tracks.length === 0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.5),rgba(2,6,23,0.7))] text-center text-slate-500">
                  <Music className="mb-3 h-14 w-14 opacity-20" />
                  <p className="text-lg text-slate-400">Timeline is empty</p>
                  <p className="mt-1 text-sm">Add tracks from the sidebar to start shaping the arrangement.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tracks.map((track, index) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      index={index}
                      totalTracks={tracks.length}
                      isPlaying={playingTrackId === track.id}
                      previewPosition={previewPositions[track.id] ?? track.trimStart}
                      onMove={moveTrack}
                      onPlay={playTrack}
                      onDuplicate={duplicateTrack}
                      onRemove={removeTrack}
                      onTrimChange={updateTrackTrim}
                      onFadeChange={updateTrackFade}
                      onZoomChange={updateTrackZoom}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {mergedOutput && (
          <div className="animate-in slide-in-from-bottom-4 mt-4 rounded-[24px] border border-indigo-500/25 bg-[linear-gradient(180deg,rgba(30,27,75,0.34),rgba(49,46,129,0.16))] p-4 shadow-xl fade-in md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-white md:text-lg">
                  <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-400" />
                  <span>Output Preview Ready</span>
                </h2>
                <p className="mt-1 text-xs text-slate-300 md:text-sm">
                  Use the export dropdown in the header for files. This panel stays focused on playback and status.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2">WAV ready</span>
                <span className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2">
                  {mergedOutput.mp3Status === 'ready' ? 'MP3 ready' : mergedOutput.mp3Status === 'processing' ? 'MP3 processing' : 'MP3 failed'}
                </span>
              </div>
            </div>
            <audio controls src={mergedOutput.previewUrl} className="mt-4 h-10 w-full rounded-lg md:h-12" />
          </div>
        )}

        {tracks.length > 0 && (
          <div className="mt-4 rounded-[24px] border border-white/5 bg-slate-950/50 p-4 text-sm text-slate-400">
            <p>
              Ruler ticks follow the current zoom level. Drag the white trim handles, drag the highlighted selection to reposition it, or click anywhere on the waveform to preview from that exact point.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Current session: {tracks.length} track{tracks.length === 1 ? '' : 's'} loaded, merge mode {mergeMode}, crossfade {formatTime(crossfade)}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}