import React, { useEffect, useMemo, useState } from 'react';
import { Copy, MoveDown, MoveUp, Music, Pause, Play, Trash2 } from 'lucide-react';

import WaveformEditor from './WaveformEditor';
import { getTrackTheme } from '../utils/trackThemes';
import { formatTime, parseTimeString } from '../utils/timeUtils';

const formatBitrate = (bitrate) => {
  if (!bitrate) return null;
  return `${Math.round(bitrate / 1000)} kbps`;
};

const formatSampleRate = (sampleRate) => {
  if (!sampleRate) return null;
  return sampleRate >= 1000 ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz` : `${sampleRate} Hz`;
};

const TrackCard = ({
  track,
  index,
  totalTracks,
  isPlaying,
  previewPosition,
  onMove,
  onPlay,
  onDuplicate,
  onRemove,
  onTrimChange,
  onFadeChange,
  onZoomChange,
}) => {
  const theme = getTrackTheme(index);
  const artworkSources = useMemo(() => {
    return [...new Set([track.artworkUrl, ...(track.artworkFallbackUrls || [])].filter(Boolean))];
  }, [track.artworkFallbackUrls, track.artworkUrl]);
  const [artworkIndex, setArtworkIndex] = useState(0);

  useEffect(() => {
    setArtworkIndex(0);
  }, [track.id, track.artworkUrl, track.artworkFallbackUrls]);

  const activeArtwork = artworkSources[artworkIndex] || null;
  const laneBorder = `rgba(${theme.accentSoft}, 0.2)`;
  const laneGlow = `rgba(${theme.glow}, 0.18)`;
  const accentText = `rgba(${theme.accentSoft}, 0.95)`;
  const accentSurface = `rgba(${theme.accent}, 0.14)`;
  const accentOutline = `rgba(${theme.accent}, 0.3)`;

  return (
    <div
      className="group relative overflow-hidden rounded-[26px] border bg-[linear-gradient(180deg,rgba(9,14,30,0.96),rgba(5,10,22,0.98))] p-3 md:p-4"
      style={{ borderColor: laneBorder, boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 24px 50px ${laneGlow}` }}
    >
      {index < totalTracks - 1 && (
        <div className="absolute -bottom-4 left-8 hidden h-5 w-0.5 lg:block" style={{ backgroundColor: `rgba(${theme.glow}, 0.28)` }} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="relative h-24 w-24 shrink-0">
              <div
                className="absolute top-1/2 z-0 aspect-square h-[82%] -translate-x-1/2 -translate-y-1/2 transition-[left,opacity,filter] duration-500 ease-out"
                style={{
                  left: isPlaying ? '70%' : '50%',
                  opacity: isPlaying ? 1 : 0.72,
                  filter: isPlaying ? 'drop-shadow(0 18px 30px rgba(0,0,0,0.5))' : 'drop-shadow(0 10px 16px rgba(0,0,0,0.3))',
                }}
              >
                <div
                  className="relative h-full w-full rounded-full border border-slate-700/80 bg-[radial-gradient(circle_at_center,rgba(71,85,105,0.92)_0_12%,rgba(15,23,42,0.96)_12%_18%,rgba(51,65,85,0.85)_18.5%_19.5%,rgba(2,6,23,0.98)_20%_54%,rgba(51,65,85,0.72)_54.5%_55.5%,rgba(2,6,23,1)_56%_100%)] after:absolute after:inset-[9%] after:rounded-full after:border after:border-white/5 after:content-['']"
                  style={{ animation: isPlaying ? 'spin 2.4s linear infinite' : 'none' }}
                >
                  <div className="absolute left-[58%] top-[10%] h-[16%] w-[10%] rounded-sm shadow-[0_0_10px_rgba(0,0,0,0.18)]" style={{ backgroundColor: `rgba(${theme.accentSoft}, 0.88)` }} />
                  <div className="absolute left-1/2 top-1/2 h-[14%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300/40 bg-slate-200 shadow-[0_0_0_8px_rgba(30,41,59,0.45)]" />
                </div>
              </div>
              <div className="absolute inset-0 z-10 overflow-hidden rounded-2xl border border-white/10 bg-slate-800 shadow-[0_14px_24px_rgba(15,23,42,0.38)]">
                {activeArtwork ? (
                  <img
                    src={activeArtwork}
                    alt={`${track.displayTitle || track.name} cover art`}
                    className="h-full w-full object-cover"
                    onError={() => {
                      setArtworkIndex((previous) => (previous < artworkSources.length - 1 ? previous + 1 : previous));
                    }}
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{
                      background: `radial-gradient(circle at top, rgba(${theme.accent}, 0.3), transparent 45%), linear-gradient(135deg, rgba(15,23,42,0.95), rgba(${theme.accentDeep}, 0.88))`,
                    }}
                  >
                    <Music className="h-10 w-10" style={{ color: `rgba(${theme.accentSoft}, 0.88)` }} />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_28%,transparent_65%,rgba(15,23,42,0.28))]" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-xl px-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: `rgba(${theme.accent}, 0.88)` }}
                >
                  {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onMove(index, 'up')}
                    disabled={index === 0}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
                    title="Move up"
                  >
                    <MoveUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onMove(index, 'down')}
                    disabled={index === totalTracks - 1}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
                    title="Move down"
                  >
                    <MoveDown className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <h3 className="truncate text-base font-semibold leading-tight text-slate-100 md:text-lg" title={track.displayTitle || track.name}>
                {track.displayTitle || track.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                {track.artist ? <span className="truncate" style={{ color: accentText }}>{track.artist}</span> : null}
                {track.album ? <span className="truncate">{track.album}</span> : null}
                <span>{formatTime(track.duration)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                {track.codec ? <span className="rounded-full border bg-slate-800/80 px-2.5 py-1 uppercase tracking-[0.18em]" style={{ borderColor: accentOutline, color: accentText }}>{track.codec}</span> : null}
                {formatBitrate(track.bitrate) ? <span>{formatBitrate(track.bitrate)}</span> : null}
                {formatSampleRate(track.sampleRate) ? <span>{formatSampleRate(track.sampleRate)}</span> : null}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => onPlay(track)}
                  title={isPlaying ? 'Stop playback' : 'Play track'}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white transition"
                  style={{ backgroundColor: isPlaying ? `rgba(${theme.accent}, 0.92)` : 'rgba(15, 23, 42, 0.94)', boxShadow: isPlaying ? `0 12px 24px rgba(${theme.glow}, 0.28)` : 'none' }}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => onDuplicate(track.id)}
                  title="Duplicate track"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-slate-900/80 text-slate-400 transition hover:text-slate-100"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onRemove(track.id)}
                  title="Remove track"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-slate-900/80 text-slate-400 transition hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-3">
              <div className="mb-1 flex items-center justify-between text-slate-500">
                <span>Fade In</span>
                <span style={{ color: accentText }}>{formatTime(track.fadeIn ?? 0)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(0.01, track.trimEnd - track.trimStart)}
                step="0.05"
                value={track.fadeIn ?? 0}
                onChange={(event) => onFadeChange(track.id, 'fadeIn', event.target.value)}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-900"
                style={{ accentColor: `rgb(${theme.accent})` }}
              />
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-3">
              <div className="mb-1 flex items-center justify-between text-slate-500">
                <span>Fade Out</span>
                <span style={{ color: accentText }}>{formatTime(track.fadeOut ?? 0)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(0.01, track.trimEnd - track.trimStart)}
                step="0.05"
                value={track.fadeOut ?? 0}
                onChange={(event) => onFadeChange(track.id, 'fadeOut', event.target.value)}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-900"
                style={{ accentColor: `rgb(${theme.accent})` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <WaveformEditor
            track={track}
            theme={theme}
            previewPosition={previewPosition}
            isPlaying={isPlaying}
            onPreview={(time) => onPlay(track, time, false)}
            onTrimChange={onTrimChange}
            onZoomChange={onZoomChange}
          />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/5 bg-slate-950/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">Trim Range</label>
            <span className="text-xs text-slate-500">Use mm:ss.cs or hh:mm:ss</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Start</label>
              <input
                type="text"
                value={formatTime(track.trimStart)}
                onChange={(event) => onTrimChange(track.id, 'trimStart', parseTimeString(event.target.value, track.duration))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition"
                style={{ borderColor: accentOutline }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">End</label>
              <input
                type="text"
                value={formatTime(track.trimEnd)}
                onChange={(event) => onTrimChange(track.id, 'trimEnd', parseTimeString(event.target.value, track.duration))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition"
                style={{ borderColor: accentOutline }}
              />
            </div>
          </div>
        </div>

            <div className="rounded-2xl border border-white/5 p-3" style={{ backgroundColor: accentSurface }}>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-200">Lane Stats</label>
                <span className="text-xs text-slate-300">Track {index + 1}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                <div className="rounded-xl bg-slate-950/55 p-3">
                  <div className="text-slate-500">Selection</div>
                  <div className="mt-1 font-medium" style={{ color: accentText }}>{formatTime(track.trimEnd - track.trimStart)}</div>
                </div>
                <div className="rounded-xl bg-slate-950/55 p-3">
                  <div className="text-slate-500">Preview</div>
                  <div className="mt-1 font-medium" style={{ color: accentText }}>{isPlaying ? 'Playing' : 'Ready'}</div>
                </div>
                <div className="rounded-xl bg-slate-950/55 p-3">
                  <div className="text-slate-500">Start</div>
                  <div className="mt-1 font-medium">{formatTime(track.trimStart)}</div>
                </div>
                <div className="rounded-xl bg-slate-950/55 p-3">
                  <div className="text-slate-500">End</div>
                  <div className="mt-1 font-medium">{formatTime(track.trimEnd)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackCard;