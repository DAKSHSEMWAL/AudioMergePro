import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Scissors, Trash2, Sliders, Download, MoveUp, MoveDown, Music, Loader2, Info, Copy, Layers, List } from 'lucide-react';
import lamejsSource from 'lamejs/lame.all.js?raw';

const lamejs = new Function(`${lamejsSource}; return lamejs;`)();

export default function AudioMerger() {
  const [tracks, setTracks] = useState([]);
  const [crossfade, setCrossfade] = useState(2); // Crossfade duration in seconds
  const [mergeMode, setMergeMode] = useState('sequential'); // 'sequential' | 'mix'
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergedOutput, setMergedOutput] = useState(null);
  const [error, setError] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState(null);
  
  const fileInputRef = useRef(null);
  const trackAudioRefs = useRef({});

  const clearMergedOutput = () => {
    setMergedOutput((previousOutput) => {
      if (previousOutput) {
        URL.revokeObjectURL(previousOutput.wavUrl);
        URL.revokeObjectURL(previousOutput.mp3Url);
      }

      return null;
    });
  };

  useEffect(() => {
    return () => {
      Object.values(trackAudioRefs.current).forEach((sourceNode) => {
        if (typeof sourceNode.stop === 'function') {
          try {
            sourceNode.stop();
          } catch {
            // Ignore already-stopped preview sources.
          }
        }
      });

      if (mergedOutput) {
        URL.revokeObjectURL(mergedOutput.wavUrl);
        URL.revokeObjectURL(mergedOutput.mp3Url);
      }
    };
  }, [mergedOutput]);

  // Initialize Audio Context just for decoding
  const getAudioContext = () => {
    return new (window.AudioContext || window.webkitAudioContext)();
  };

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setError('');

    try {
      const audioCtx = getAudioContext();
      const newTracks = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        newTracks.push({
          id: Math.random().toString(36).substr(2, 9),
          file: file,
          name: file.name,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
          trimStart: 0,
          trimEnd: audioBuffer.duration,
          fadeIn: 0,
          fadeOut: 0,
        });
      }

      setTracks(prev => [...prev, ...newTracks]);
      // Reset merged output if we change tracks
      clearMergedOutput(); 
    } catch (err) {
      console.error("Error decoding audio:", err);
      setError("Failed to decode one or more audio files. Please ensure they are valid, supported audio formats.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const normalizeTrackFades = (track) => {
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

  const updateTrackTrim = (id, type, value) => {
    setTracks(tracks.map(track => {
      if (track.id === id) {
        let val = Number(value);
        if (isNaN(val)) return track;
        
        // Clamp to valid boundaries (allow fine precision)
        if (val < 0) val = 0;
        if (val > track.duration) val = track.duration;

        let newTrack = { ...track, [type]: val };
        
        // Ensure start is not after end and vice versa
        if (type === 'trimStart' && newTrack.trimStart >= newTrack.trimEnd) {
           newTrack.trimStart = Math.max(0, newTrack.trimEnd - 0.01);
        }
        if (type === 'trimEnd' && newTrack.trimEnd <= newTrack.trimStart) {
           newTrack.trimEnd = Math.min(track.duration, newTrack.trimStart + 0.01);
        }
        return normalizeTrackFades(newTrack);
      }
      return track;
    }));
    clearMergedOutput();
  };

  const updateTrackFade = (id, type, value) => {
    setTracks(tracks.map(track => {
      if (track.id !== id) return track;

      const fadeValue = Number(value);
      if (isNaN(fadeValue)) return track;

      return normalizeTrackFades({
        ...track,
        [type]: Math.max(0, fadeValue),
      });
    }));
    clearMergedOutput();
  };

  const removeTrack = (id) => {
    setTracks(tracks.filter(t => t.id !== id));
    clearMergedOutput();
  };

  const duplicateTrack = (id) => {
    const trackToCopy = tracks.find(t => t.id === id);
    if (trackToCopy) {
      const newTrack = { ...trackToCopy, id: Math.random().toString(36).substr(2, 9) };
      const index = tracks.findIndex(t => t.id === id);
      const newTracks = [...tracks];
      newTracks.splice(index + 1, 0, newTrack); // Insert right after original
      setTracks(newTracks);
      clearMergedOutput();
    }
  };

  const moveTrack = (index, direction) => {
    if (direction === 'up' && index > 0) {
      const newTracks = [...tracks];
      [newTracks[index - 1], newTracks[index]] = [newTracks[index], newTracks[index - 1]];
      setTracks(newTracks);
      clearMergedOutput();
    } else if (direction === 'down' && index < tracks.length - 1) {
      const newTracks = [...tracks];
      [newTracks[index + 1], newTracks[index]] = [newTracks[index], newTracks[index + 1]];
      setTracks(newTracks);
      clearMergedOutput();
    }
  };

  // Utility to convert AudioBuffer to WAV Blob
  const bufferToWav = (abuffer) => {
    let numOfChan = abuffer.numberOfChannels,
        length = abuffer.length * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample,
        offset = 0,
        pos = 0;

    const setUint16 = (data) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"
    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit
    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    for(i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));

    while(offset < abuffer.length) {
      for(i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); 
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; 
        view.setInt16(pos, sample, true);          
        pos += 2;
      }
      offset++;
    }
    return new Blob([buffer], {type: "audio/wav"});
  };

  const float32ToInt16 = (input) => {
    const output = new Int16Array(input.length);

    for (let index = 0; index < input.length; index++) {
      const sample = Math.max(-1, Math.min(1, input[index]));
      output[index] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    return output;
  };

  const bufferToMp3 = (audioBuffer, kbps = 320) => {
    const channels = Math.min(audioBuffer.numberOfChannels, 2);
    const encoder = new lamejs.Mp3Encoder(channels, audioBuffer.sampleRate, kbps);
    const leftChannel = float32ToInt16(audioBuffer.getChannelData(0));
    const rightChannel = channels > 1
      ? float32ToInt16(audioBuffer.getChannelData(1))
      : null;
    const blockSize = 1152;
    const mp3Chunks = [];

    for (let index = 0; index < leftChannel.length; index += blockSize) {
      const leftChunk = leftChannel.subarray(index, index + blockSize);
      const mp3Buffer = channels > 1
        ? encoder.encodeBuffer(leftChunk, rightChannel.subarray(index, index + blockSize))
        : encoder.encodeBuffer(leftChunk);

      if (mp3Buffer.length > 0) {
        mp3Chunks.push(new Int8Array(mp3Buffer));
      }
    }

    const finalChunk = encoder.flush();
    if (finalChunk.length > 0) {
      mp3Chunks.push(new Int8Array(finalChunk));
    }

    return new Blob(mp3Chunks, { type: 'audio/mpeg' });
  };

  const getTrackFadeDurations = (track, overlapWithPrevious = 0, overlapWithNext = 0) => {
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

  const getSafeTrackSegment = (track) => {
    const bufferDuration = track.buffer?.duration ?? track.duration ?? 0;
    const safeTrimStart = Math.max(0, Math.min(track.trimStart, bufferDuration));
    const safeTrimEnd = Math.max(safeTrimStart + 0.001, Math.min(track.trimEnd, bufferDuration));

    return {
      safeTrimStart,
      safeTrimEnd,
      safeTrimDuration: Math.max(0.001, safeTrimEnd - safeTrimStart),
    };
  };

  const applyGainEnvelope = (gainNode, startTime, endTime, peakGain, fadeInDuration, fadeOutDuration) => {
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

  const mergeTracks = async () => {
    if (tracks.length === 0) return;
    
    setIsProcessing(true);
    setError('');
    
    try {
      // Calculate total required duration by simulating track positioning
      let totalDuration = 0;
      let currentTimeInCtx = 0;

      const getSequentialOverlap = (currentTrack, nextTrack) => {
        if (!nextTrack || crossfade <= 0) return 0;

        const currentDuration = currentTrack.trimEnd - currentTrack.trimStart;
        const nextDuration = nextTrack.trimEnd - nextTrack.trimStart;

        return Math.max(0, Math.min(crossfade, currentDuration, nextDuration));
      };
      
      if (mergeMode === 'sequential') {
        // First, calculate where all tracks will end up
        for (let i = 0; i < tracks.length; i++) {
          const { safeTrimDuration } = getSafeTrackSegment(tracks[i]);
          const trimDur = safeTrimDuration;
          const trackEndTime = currentTimeInCtx + trimDur;
          totalDuration = trackEndTime;

          const overlap = getSequentialOverlap(tracks[i], tracks[i + 1]);
          currentTimeInCtx = trackEndTime - overlap;
        }
      } else {
        // Mix mode: all play at once, so total duration is the longest track
        tracks.forEach(t => {
          const { safeTrimDuration } = getSafeTrackSegment(t);
          const dur = safeTrimDuration;
          if (dur > totalDuration) totalDuration = dur;
        });
      }
      
      totalDuration = Math.max(0.1, totalDuration); // Ensure valid length

      console.log('Merging tracks:');
      console.log('Total calculated duration:', totalDuration.toFixed(2));
      console.log('Merge mode:', mergeMode);
      console.log('Crossfade duration:', crossfade);
      
      tracks.forEach((t, i) => {
        const { safeTrimStart, safeTrimEnd, safeTrimDuration } = getSafeTrackSegment(t);
        console.log(`Track ${i + 1}: ${safeTrimDuration.toFixed(2)}s (${formatTime(safeTrimStart)} - ${formatTime(safeTrimEnd)})`);
      });

      const audioCtx = getAudioContext();
      const offlineCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * totalDuration), audioCtx.sampleRate);

      // Reset currentTimeInCtx for the track scheduling loop
      currentTimeInCtx = 0;

      tracks.forEach((track, index) => {
        const source = offlineCtx.createBufferSource();
        source.buffer = track.buffer;

        const gainNode = offlineCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        const { safeTrimStart, safeTrimEnd, safeTrimDuration } = getSafeTrackSegment(track);
        const trimDur = safeTrimDuration;
        const startTimeInCtx = mergeMode === 'sequential' ? currentTimeInCtx : 0;
        const endTimeInCtx = startTimeInCtx + trimDur;
        const overlapWithPrevious =
          mergeMode === 'sequential' && index > 0
            ? getSequentialOverlap(tracks[index - 1], track)
            : 0;
        const overlapWithNext =
          mergeMode === 'sequential' ? getSequentialOverlap(track, tracks[index + 1]) : 0;
        const { fadeInDuration, fadeOutDuration } = getTrackFadeDurations(
          track,
          overlapWithPrevious,
          overlapWithNext,
        );
        const peakGain = mergeMode === 'mix' ? 0.8 : 1;

        console.log(`Scheduling track ${index + 1}: context time ${startTimeInCtx.toFixed(2)}s - ${endTimeInCtx.toFixed(2)}s (${trimDur.toFixed(2)}s), buffer offset ${safeTrimStart.toFixed(2)}s to ${safeTrimEnd.toFixed(2)}s`);

        // Use proper start parameters: when, offset, duration
        // This ensures we play ONLY the trimmed portion
        source.start(startTimeInCtx, safeTrimStart, trimDur);

        applyGainEnvelope(
          gainNode,
          startTimeInCtx,
          endTimeInCtx,
          peakGain,
          fadeInDuration,
          fadeOutDuration,
        );

        if (mergeMode === 'sequential') {
          currentTimeInCtx = endTimeInCtx - overlapWithNext;
        }
      });

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = bufferToWav(renderedBuffer);
      const mp3Blob = bufferToMp3(renderedBuffer, 320);
      const wavUrl = URL.createObjectURL(wavBlob);
      const mp3Url = URL.createObjectURL(mp3Blob);

      clearMergedOutput();
      setMergedOutput({
        wavUrl,
        mp3Url,
        previewUrl: wavUrl,
      });
    } catch (err) {
      console.error("Merging failed:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to merge audio: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds) => {
    // Ensure we have a valid number
    let totalSeconds = Number(seconds) || 0;
    if (totalSeconds < 0) totalSeconds = 0;
    
    const hours = Math.floor(totalSeconds / 3600);
    const remainingAfterHours = totalSeconds % 3600;
    const mins = Math.floor(remainingAfterHours / 60);
    const secs = Math.floor(remainingAfterHours % 60);
    const centisecs = Math.floor((remainingAfterHours % 1) * 100);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
  };

  // Convert hh:mm:ss or mm:ss.cs to seconds
  const parseTimeString = (timeStr, maxDuration) => {
    try {
      // Remove extra whitespace
      const trimmed = timeStr.trim();
      if (!trimmed) return 0;
      
      const parts = trimmed.split(':');
      let seconds = 0;
      
      if (parts.length === 3) {
        // hh:mm:ss format
        const hours = parseInt(parts[0]) || 0;
        const mins = parseInt(parts[1]) || 0;
        const secs = parseFloat(parts[2]) || 0;
        // Normalize: convert excess seconds to minutes, etc.
        seconds = hours * 3600 + mins * 60 + secs;
      } else if (parts.length === 2) {
        // mm:ss.cs format
        const mins = parseInt(parts[0]) || 0;
        const secs = parseFloat(parts[1]) || 0;
        // Normalize: convert excess seconds to minutes
        seconds = mins * 60 + secs;
      }
      
      // Ensure valid range
      return Math.max(0, Math.min(maxDuration, seconds));
    } catch {
      return 0;
    }
  };

  // Play individual track
  const playTrack = async (track) => {
    try {
      // Stop previous track if playing
      if (playingTrackId && trackAudioRefs.current[playingTrackId]) {
        try {
          trackAudioRefs.current[playingTrackId].stop();
        } catch {
          // Ignore already-stopped preview sources.
        }
      }

      if (playingTrackId === track.id) {
        // Toggle off if same track
        setPlayingTrackId(null);
        return;
      }

      const audioCtx = getAudioContext();
      
      // Calculate trim duration
      const trimDur = track.trimEnd - track.trimStart;
      const gainNode = audioCtx.createGain();
      const { fadeInDuration, fadeOutDuration } = getTrackFadeDurations(track, 0, 0);
      
      // Create buffer source for playback using Web Audio API
      const source = audioCtx.createBufferSource();
      source.buffer = track.buffer;
      
      // Connect to destination
      source.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      trackAudioRefs.current[track.id] = source;
      
      // Set playing state
      setPlayingTrackId(track.id);
      
      // Start playback from trim start position
      const now = audioCtx.currentTime;
      applyGainEnvelope(gainNode, now, now + trimDur, 1, fadeInDuration, fadeOutDuration);
      source.start(now, track.trimStart, trimDur);
      
      // Stop after trim duration
      source.stop(now + trimDur);
      
      // Reset when playback ends
      source.onended = () => {
        if (trackAudioRefs.current[track.id] === source) {
          delete trackAudioRefs.current[track.id];
        }
        setPlayingTrackId(null);
      };
    } catch (err) {
      console.error("Error playing track:", err);
      setError("Failed to play track");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-3 md:p-4 lg:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        
        {/* Header */}
        <header className="flex items-center space-x-2 md:space-x-3 mb-4 md:mb-8">
          <div className="p-2 md:p-3 bg-indigo-600 rounded-lg shrink-0">
            <Music className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white tracking-tight">AudioMerge Pro</h1>
            <p className="text-slate-400 text-xs md:text-sm truncate">Trim, crossfade, and join your tracks locally.</p>
          </div>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 md:p-4 rounded-xl flex items-start gap-2 md:gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm md:text-base">{error}</p>
          </div>
        )}

        {/* Main Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          
          {/* Settings Panel */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            <div className="bg-slate-800 p-4 md:p-6 rounded-2xl border border-slate-700 shadow-xl">
              <h2 className="text-base md:text-lg font-semibold flex items-center space-x-2 mb-4">
                <Sliders className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <span>Global Settings</span>
              </h2>
              
              <div className="space-y-5">
                
                {/* Merge Mode Toggle */}
                <div>
                  <label className="text-sm text-slate-400 font-medium mb-3 block">Merge Mode</label>
                  <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700/50">
                    <button
                      onClick={() => { setMergeMode('sequential'); clearMergedOutput(); }}
                      className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm transition-colors ${mergeMode === 'sequential' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                    >
                      <List className="w-4 h-4" />
                      <span>Sequential</span>
                    </button>
                    <button
                      onClick={() => { setMergeMode('mix'); clearMergedOutput(); }}
                      className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm transition-colors ${mergeMode === 'mix' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                    >
                      <Layers className="w-4 h-4" />
                      <span>Mix / Layer</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {mergeMode === 'sequential' ? 'Plays tracks one after another (End-to-End).' : 'Plays all tracks simultaneously (Overlay).'}
                  </p>
                </div>

                {mergeMode === 'sequential' && (
                  <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex justify-between mb-2">
                      <label className="text-sm text-slate-400 font-medium">Crossfade Duration</label>
                      <span className="text-sm text-indigo-400 font-bold">{crossfade}s</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="10" 
                      step="0.5" 
                      value={crossfade}
                      onChange={(e) => { setCrossfade(Number(e.target.value)); clearMergedOutput(); }}
                      className="w-full accent-indigo-500"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Smooth overlap between tracks. Set to 0s for a hard cut.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions Panel */}
            <div className="bg-slate-800 p-4 md:p-6 rounded-2xl border border-slate-700 shadow-xl">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.wma,.aiff" 
                multiple 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-xl transition-colors mb-4 disabled:opacity-50"
              >
                <Upload className="w-5 h-5" />
                <span>Add Audio Files</span>
              </button>

              <button 
                onClick={mergeTracks}
                disabled={tracks.length === 0 || isProcessing}
                className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:shadow-none"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                <span className="font-semibold">{isProcessing ? 'Processing...' : 'Merge Tracks'}</span>
              </button>
            </div>
          </div>

          {/* Track List Panel */}
          <div className="lg:col-span-2 bg-slate-800 rounded-2xl border border-slate-700 p-4 md:p-6 shadow-xl min-h-[400px]">
             <h2 className="text-base md:text-lg font-semibold flex items-center space-x-2 mb-4 md:mb-6">
                <Scissors className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <span className="truncate">Track Sequence ({tracks.length})</span>
              </h2>

              {tracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-700 rounded-xl">
                  <Music className="w-12 h-12 mb-3 opacity-20" />
                  <p>No tracks added yet.</p>
                  <p className="text-sm mt-1">Upload audio files to get started.</p>
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4">
                  {tracks.map((track, index) => (
                    <div key={track.id} className="bg-slate-900 border border-slate-700 p-3 md:p-4 rounded-xl flex flex-col gap-4 relative overflow-visible group">
                      
                      {/* Connection Line */}
                      {index < tracks.length - 1 && (
                         <div className="hidden lg:block absolute -bottom-4 left-8 w-0.5 h-5 bg-indigo-500/30 z-0"></div>
                      )}

                      {/* Top Row: Reorder Controls + Title + Actions */}
                      <div className="flex flex-row items-start justify-between gap-3 z-10">
                        {/* Reorder Controls */}
                        <div className="flex flex-row items-center gap-1 bg-slate-800 p-2 rounded-lg flex-shrink-0">
                          <button 
                            onClick={() => moveTrack(index, 'up')}
                            disabled={index === 0}
                            className="p-2 hover:bg-slate-700 rounded disabled:opacity-30 active:bg-slate-600 transition-colors"
                            title="Move up"
                          >
                            <MoveUp className="w-4 h-4 text-slate-300" />
                          </button>
                          <span className="text-xs font-bold text-slate-500 w-5 text-center px-1">{index + 1}</span>
                          <button 
                            onClick={() => moveTrack(index, 'down')}
                            disabled={index === tracks.length - 1}
                            className="p-2 hover:bg-slate-700 rounded disabled:opacity-30 active:bg-slate-600 transition-colors"
                            title="Move down"
                          >
                            <MoveDown className="w-4 h-4 text-slate-300" />
                          </button>
                        </div>

                        {/* Track Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-200 truncate text-sm md:text-base" title={track.name}>{track.name}</h3>
                          <p className="text-xs text-slate-500">Duration: {formatTime(track.duration)}</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => playTrack(track)}
                            title={playingTrackId === track.id ? "Stop playback" : "Play track"}
                            className={`p-2 rounded transition-colors ${playingTrackId === track.id ? 'text-green-400 bg-slate-700' : 'text-slate-400 hover:text-green-400 hover:bg-slate-800'}`}
                          >
                            {playingTrackId === track.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => duplicateTrack(track.id)}
                            title="Duplicate track"
                            className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => removeTrack(track.id)}
                            title="Remove track"
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Trim Controls - Visual Crop Window */}
                      <div className="flex flex-col space-y-3 bg-slate-800/50 p-3 md:p-4 rounded-lg border border-slate-700/50">
                        
                        {/* Timeline Visual */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-slate-400 font-medium">Crop Window</label>
                            <span className="text-xs text-indigo-400">
                              {formatTime(track.trimEnd - track.trimStart)}
                            </span>
                          </div>
                          
                          {/* Visual Timeline Bar */}
                          <div className="relative bg-slate-900 h-8 rounded-lg overflow-hidden border border-slate-600">
                            {/* Total duration background */}
                            <div className="absolute inset-0 bg-gradient-to-r from-slate-700 to-slate-800"></div>
                            
                            {/* Selected portion highlight */}
                            <div 
                              className="absolute h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all"
                              style={{
                                left: `${(track.trimStart / track.duration) * 100}%`,
                                right: `${100 - (track.trimEnd / track.duration) * 100}%`,
                              }}
                            ></div>
                            
                            {/* Start handle */}
                            <input 
                              type="range" 
                              min="0" 
                              max={track.duration} 
                              step="0.01" 
                              value={track.trimStart}
                              onChange={(e) => updateTrackTrim(track.id, 'trimStart', e.target.value)}
                              className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            
                            {/* End handle */}
                            <input 
                              type="range" 
                              min="0" 
                              max={track.duration} 
                              step="0.01" 
                              value={track.trimEnd}
                              onChange={(e) => updateTrackTrim(track.id, 'trimEnd', e.target.value)}
                              className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10 [direction:rtl]"
                            />
                            
                            {/* Visual handles */}
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-6 bg-emerald-400 cursor-col-resize pointer-events-none"
                              style={{left: `${(track.trimStart / track.duration) * 100}%`}}
                            ></div>
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-6 bg-rose-400 cursor-col-resize pointer-events-none"
                              style={{right: `${(1 - track.trimEnd / track.duration) * 100}%`}}
                            ></div>
                          </div>
                          
                          {/* Time labels */}
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{formatTime(0)}</span>
                            <span>{formatTime(track.duration)}</span>
                          </div>
                        </div>

                        {/* Time Input Fields */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col space-y-1">
                            <label className="text-xs text-slate-400 font-medium">Start (↑↓ adjust)</label>
                            <input 
                              type="text" 
                              placeholder="mm:ss.cs"
                              value={formatTime(track.trimStart)}
                              onChange={(e) => updateTrackTrim(track.id, 'trimStart', parseTimeString(e.target.value, track.duration))}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  updateTrackTrim(track.id, 'trimStart', Math.min(track.duration - 0.01, track.trimStart + 0.1));
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  updateTrackTrim(track.id, 'trimStart', Math.max(0, track.trimStart - 0.1));
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                            />
                          </div>
                          <div className="flex flex-col space-y-1">
                            <label className="text-xs text-slate-400 font-medium">End (↑↓ adjust)</label>
                            <input 
                              type="text" 
                              placeholder="mm:ss.cs"
                              value={formatTime(track.trimEnd)}
                              onChange={(e) => updateTrackTrim(track.id, 'trimEnd', parseTimeString(e.target.value, track.duration))}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  updateTrackTrim(track.id, 'trimEnd', Math.min(track.duration, track.trimEnd + 0.1));
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  updateTrackTrim(track.id, 'trimEnd', Math.max(0.01, track.trimEnd - 0.1));
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-slate-400 font-medium">Fade In</label>
                              <span className="text-xs text-emerald-400">{formatTime(track.fadeIn ?? 0)}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={Math.max(0.01, track.trimEnd - track.trimStart)}
                              step="0.01"
                              value={track.fadeIn ?? 0}
                              onChange={(e) => updateTrackFade(track.id, 'fadeIn', e.target.value)}
                              className="w-full accent-emerald-500"
                            />
                            <input
                              type="text"
                              placeholder="0:00.00"
                              value={formatTime(track.fadeIn ?? 0)}
                              onChange={(e) => updateTrackFade(track.id, 'fadeIn', parseTimeString(e.target.value, track.trimEnd - track.trimStart))}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  updateTrackFade(track.id, 'fadeIn', (track.fadeIn ?? 0) + 0.1);
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  updateTrackFade(track.id, 'fadeIn', Math.max(0, (track.fadeIn ?? 0) - 0.1));
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                            />
                          </div>
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-slate-400 font-medium">Fade Out</label>
                              <span className="text-xs text-rose-400">{formatTime(track.fadeOut ?? 0)}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={Math.max(0.01, track.trimEnd - track.trimStart)}
                              step="0.01"
                              value={track.fadeOut ?? 0}
                              onChange={(e) => updateTrackFade(track.id, 'fadeOut', e.target.value)}
                              className="w-full accent-rose-500"
                            />
                            <input
                              type="text"
                              placeholder="0:00.00"
                              value={formatTime(track.fadeOut ?? 0)}
                              onChange={(e) => updateTrackFade(track.id, 'fadeOut', parseTimeString(e.target.value, track.trimEnd - track.trimStart))}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  updateTrackFade(track.id, 'fadeOut', (track.fadeOut ?? 0) + 0.1);
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  updateTrackFade(track.id, 'fadeOut', Math.max(0, (track.fadeOut ?? 0) - 0.1));
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Result Area */}
        {mergedOutput && (
          <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 p-4 md:p-6 rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-lg md:text-xl font-bold text-white mb-4 flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></div>
              <span>Merged Audio Ready</span>
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mb-4">
              WAV is lossless. MP3 is exported at 320 kbps, which is high quality but not lossless.
            </p>
            <div className="flex flex-col gap-3 md:gap-4">
              <audio 
                controls 
                src={mergedOutput.previewUrl} 
                className="w-full h-10 md:h-12 rounded-lg"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <a 
                  href={mergedOutput.wavUrl} 
                  download="merged_audio.wav"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl transition-colors shadow-lg shadow-emerald-600/20 font-semibold text-sm md:text-base"
                >
                  <Download className="w-4 h-4 md:w-5 md:h-5" />
                  <span>Download WAV</span>
                </a>
                <a 
                  href={mergedOutput.mp3Url} 
                  download="merged_audio_320kbps.mp3"
                  className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 md:px-6 py-2 md:py-3 rounded-xl transition-colors shadow-lg shadow-sky-600/20 font-semibold text-sm md:text-base"
                >
                  <Download className="w-4 h-4 md:w-5 md:h-5" />
                  <span>Download MP3 (320 kbps)</span>
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
