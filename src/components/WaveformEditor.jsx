import React, { useEffect, useMemo, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

import { buildWaveformAreaPath, WAVEFORM_VIEWBOX_WIDTH } from '../utils/audioUtils';
import { formatTime } from '../utils/timeUtils';

const MIN_TRIM_DURATION = 0.01;
const MAX_WAVEFORM_ZOOM = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getTickStep = (windowDuration) => {
  if (windowDuration <= 8) return 0.5;
  if (windowDuration <= 20) return 1;
  if (windowDuration <= 45) return 2;
  if (windowDuration <= 90) return 5;
  if (windowDuration <= 180) return 10;
  if (windowDuration <= 420) return 30;
  if (windowDuration <= 900) return 60;
  return 120;
};

const WaveformEditor = ({
  track,
  theme,
  previewPosition,
  isPlaying,
  onPreview,
  onTrimChange,
  onZoomChange,
}) => {
  const containerRef = useRef(null);
  const dragStateRef = useRef(null);

  const trimDuration = Math.max(MIN_TRIM_DURATION, track.trimEnd - track.trimStart);
  const zoom = clamp(track.zoom ?? 1, 1, MAX_WAVEFORM_ZOOM);
  const visibleDuration = track.duration / zoom;
  const selectionMidpoint = (track.trimStart + track.trimEnd) / 2;
  const viewStart = clamp(selectionMidpoint - visibleDuration / 2, 0, Math.max(0, track.duration - visibleDuration));
  const viewEnd = Math.min(track.duration, viewStart + visibleDuration);
  const visibleRange = Math.max(MIN_TRIM_DURATION, viewEnd - viewStart);

  const timeToPercent = (time) => clamp(((time - viewStart) / visibleRange) * 100, 0, 100);
  const percentToTime = (percent) => viewStart + (clamp(percent, 0, 100) / 100) * visibleRange;
  const timeToX = (time) => (timeToPercent(time) / 100) * WAVEFORM_VIEWBOX_WIDTH;

  const visiblePeaks = useMemo(() => {
    if (!track.waveformPeaks?.length) return [];

    const totalPeaks = track.waveformPeaks.length;
    const startIndex = Math.floor((viewStart / track.duration) * totalPeaks);
    const endIndex = Math.ceil((viewEnd / track.duration) * totalPeaks);
    const peaks = track.waveformPeaks.slice(
      clamp(startIndex, 0, totalPeaks - 1),
      clamp(Math.max(startIndex + 2, endIndex), 1, totalPeaks),
    );

    return peaks.length ? peaks : track.waveformPeaks;
  }, [track.duration, track.waveformPeaks, viewEnd, viewStart]);

  const waveformPath = useMemo(() => buildWaveformAreaPath(visiblePeaks), [visiblePeaks]);

  const ticks = useMemo(() => {
    const step = getTickStep(visibleRange);
    const firstTick = Math.ceil(viewStart / step) * step;
    const values = [];

    for (let tick = firstTick; tick <= viewEnd + step / 2; tick += step) {
      values.push(Number(tick.toFixed(3)));
    }

    return values;
  }, [viewEnd, viewStart, visibleRange]);

  const buildFadeEnvelopePath = (type) => {
    const fadeDuration = type === 'in' ? (track.fadeIn ?? 0) : (track.fadeOut ?? 0);
    if (fadeDuration <= 0 || track.duration <= 0) return '';

    const startX = timeToX(track.trimStart);
    const endX = timeToX(track.trimEnd);
    const fadeWidth = Math.min(Math.abs(timeToX(track.trimStart + fadeDuration) - startX), Math.max(0, endX - startX));

    if (fadeWidth <= 0 || endX < 0 || startX > WAVEFORM_VIEWBOX_WIDTH) return '';

    if (type === 'in') {
      return `M ${startX} 88 C ${startX + fadeWidth * 0.22} 88, ${startX + fadeWidth * 0.72} 16, ${startX + fadeWidth} 16`;
    }

    return `M ${endX - fadeWidth} 16 C ${endX - fadeWidth * 0.28} 16, ${endX - fadeWidth * 0.22} 88, ${endX} 88`;
  };

  const buildFadeEnvelopeFillPath = (type) => {
    const fadeDuration = type === 'in' ? (track.fadeIn ?? 0) : (track.fadeOut ?? 0);
    if (fadeDuration <= 0 || track.duration <= 0) return '';

    const startX = timeToX(track.trimStart);
    const endX = timeToX(track.trimEnd);
    const fadeWidth = Math.min(Math.abs(timeToX(track.trimStart + fadeDuration) - startX), Math.max(0, endX - startX));

    if (fadeWidth <= 0 || endX < 0 || startX > WAVEFORM_VIEWBOX_WIDTH) return '';

    if (type === 'in') {
      const fadeEndX = startX + fadeWidth;
      return [
        `M ${startX} 88`,
        `C ${startX + fadeWidth * 0.22} 88, ${startX + fadeWidth * 0.72} 16, ${fadeEndX} 16`,
        `L ${fadeEndX} 100`,
        `L ${startX} 100`,
        'Z',
      ].join(' ');
    }

    const fadeStartX = endX - fadeWidth;
    return [
      `M ${fadeStartX} 16`,
      `C ${endX - fadeWidth * 0.28} 16, ${endX - fadeWidth * 0.22} 88, ${endX} 88`,
      `L ${endX} 100`,
      `L ${fadeStartX} 100`,
      'Z',
    ].join(' ');
  };

  const leftPercent = timeToPercent(track.trimStart);
  const rightPercent = 100 - timeToPercent(track.trimEnd);
  const playheadPercent = previewPosition == null ? null : timeToPercent(previewPosition);
  const accentFill = `rgba(${theme.accent}, 0.92)`;
  const accentStroke = `rgba(${theme.accentSoft}, 0.56)`;
  const accentGlow = `rgba(${theme.glow}, 0.14)`;
  const accentBorder = `rgba(${theme.accentSoft}, 0.45)`;
  const accentMuted = `rgba(${theme.accent}, 0.14)`;
  const accentRamp = `rgba(${theme.accentDeep}, 0.22)`;
  const accentLabel = `rgba(${theme.accentSoft}, 0.92)`;
  const accentLine = `rgba(${theme.accent}, 0.95)`;

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const getTimeFromEvent = (event) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return track.trimStart;

    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    return percentToTime(percent);
  };

  const handlePointerMove = (event) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    const currentTime = getTimeFromEvent(event);

    if (drag.mode === 'start') {
      onTrimChange(track.id, 'trimStart', Math.min(currentTime, track.trimEnd - MIN_TRIM_DURATION));
      return;
    }

    if (drag.mode === 'end') {
      onTrimChange(track.id, 'trimEnd', Math.max(currentTime, track.trimStart + MIN_TRIM_DURATION));
      return;
    }

    if (drag.mode === 'range') {
      const delta = currentTime - drag.pointerStartTime;
      const selectionDuration = drag.initialTrimEnd - drag.initialTrimStart;
      let nextStart = clamp(drag.initialTrimStart + delta, 0, Math.max(0, track.duration - selectionDuration));
      let nextEnd = nextStart + selectionDuration;

      if (nextEnd > track.duration) {
        nextEnd = track.duration;
        nextStart = Math.max(0, nextEnd - selectionDuration);
      }

      onTrimChange(track.id, 'trimStart', nextStart);
      onTrimChange(track.id, 'trimEnd', nextEnd);
    }
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  const beginDrag = (mode, event) => {
    event.preventDefault();
    event.stopPropagation();

    dragStateRef.current = {
      mode,
      pointerStartTime: getTimeFromEvent(event),
      initialTrimStart: track.trimStart,
      initialTrimEnd: track.trimEnd,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleWaveformClick = (event) => {
    if (dragStateRef.current) return;
    onPreview(getTimeFromEvent(event));
  };

  const adjustZoom = (direction) => {
    const nextZoom = direction === 'in' ? zoom * 2 : zoom / 2;
    onZoomChange(track.id, clamp(Number(nextZoom.toFixed(2)), 1, MAX_WAVEFORM_ZOOM));
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="text-xs font-medium text-slate-400">Crop Window</label>
          <p className="text-xs" style={{ color: accentLabel }}>Selection: {formatTime(trimDuration)}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-300">
          <button
            type="button"
            onClick={() => adjustZoom('out')}
            disabled={zoom <= 1}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-35"
            title="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-10 text-center font-medium">{zoom.toFixed(1)}x</span>
          <button
            type="button"
            onClick={() => adjustZoom('in')}
            disabled={zoom >= MAX_WAVEFORM_ZOOM}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-35"
            title="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-500/15 bg-[#07131b] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="relative mb-2 h-6 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/70">
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-y-0"
              style={{ left: `${timeToPercent(tick)}%` }}
            >
              <div className="h-2 w-px bg-slate-500/60" />
              <span className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-500">
                {formatTime(tick)}
              </span>
            </div>
          ))}
          <div className="absolute inset-y-0 left-0 w-px bg-cyan-300/35" />
          <div className="absolute inset-y-0 right-0 w-px bg-cyan-300/35" />
        </div>

        <div
          ref={containerRef}
          className="relative h-24 cursor-pointer overflow-hidden rounded-2xl border border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_48%),linear-gradient(180deg,rgba(6,23,31,0.96),rgba(3,12,18,0.98))]"
          onClick={handleWaveformClick}
          title="Click to preview. Drag trim handles or the highlighted region to edit the selection."
        >
          <div className="absolute inset-y-[7px] left-3 right-3 rounded-xl border border-cyan-400/8 bg-black/10" />

          <svg
            viewBox={`0 0 ${WAVEFORM_VIEWBOX_WIDTH} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full opacity-75"
            aria-hidden="true"
          >
            <path d={waveformPath} fill={accentMuted} />
          </svg>

          <div className="absolute inset-y-0 left-0 bg-slate-950/65" style={{ width: `${leftPercent}%` }} />
          <div className="absolute inset-y-0 right-0 bg-slate-950/65" style={{ width: `${rightPercent}%` }} />

          <div
            className="absolute inset-y-1 overflow-hidden rounded-[18px] border border-cyan-300/45 bg-cyan-400/8 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_22px_rgba(34,211,238,0.12)]"
            style={{
              left: `${leftPercent}%`,
              right: `${rightPercent}%`,
              borderColor: accentBorder,
              backgroundColor: `rgba(${theme.accent}, 0.08)`,
              boxShadow: `0 0 0 1px rgba(${theme.accent}, 0.08), 0 0 22px ${accentGlow}`,
            }}
            onPointerDown={(event) => beginDrag('range', event)}
          >
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(${theme.accentDeep}, 0.18), ${accentRamp})` }} />
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, rgba(${theme.accent}, 0.18), transparent 64%)` }} />
            <svg
              viewBox={`0 0 ${WAVEFORM_VIEWBOX_WIDTH} 100`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <path d={waveformPath} fill={accentFill} />
              <path
                d={waveformPath}
                fill="none"
                stroke={accentStroke}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              {(track.fadeIn ?? 0) > 0 && (
                <>
                  <path
                    d={buildFadeEnvelopeFillPath('in')}
                    fill="rgba(3, 15, 23, 0.64)"
                  />
                  <path
                    d={buildFadeEnvelopePath('in')}
                    fill="none"
                    stroke={accentLine}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </>
              )}
              {(track.fadeOut ?? 0) > 0 && (
                <>
                  <path
                    d={buildFadeEnvelopeFillPath('out')}
                    fill="rgba(3, 15, 23, 0.64)"
                  />
                  <path
                    d={buildFadeEnvelopePath('out')}
                    fill="none"
                    stroke={accentLine}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </>
              )}
            </svg>
          </div>

          <div
            className="absolute inset-y-0 rounded-full border border-white/70 bg-white/95 shadow-[0_0_18px_rgba(255,255,255,0.25)]"
            style={{ left: `calc(${leftPercent}% - 7px)`, width: '14px', boxShadow: `0 0 18px rgba(${theme.accentSoft}, 0.35)` }}
            onPointerDown={(event) => beginDrag('start', event)}
          >
            <div className="absolute inset-y-3 left-[5px] w-px bg-slate-600" />
            <div className="absolute inset-y-3 right-[5px] w-px bg-slate-600" />
          </div>

          <div
            className="absolute inset-y-0 rounded-full border border-white/70 bg-white/95 shadow-[0_0_18px_rgba(255,255,255,0.25)]"
            style={{ left: `calc(${100 - rightPercent}% - 7px)`, width: '14px', boxShadow: `0 0 18px rgba(${theme.accentSoft}, 0.35)` }}
            onPointerDown={(event) => beginDrag('end', event)}
          >
            <div className="absolute inset-y-3 left-[5px] w-px bg-slate-600" />
            <div className="absolute inset-y-3 right-[5px] w-px bg-slate-600" />
          </div>

          {playheadPercent != null && playheadPercent >= 0 && playheadPercent <= 100 && (
            <div
              className="absolute inset-y-0 z-20 w-px bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.6)]"
              style={{ left: `${playheadPercent}%` }}
            >
              <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-cyan-200/80 bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>View start {formatTime(viewStart)}</span>
          <span>{isPlaying ? 'Previewing selection' : 'Click waveform to audition from any point'}</span>
          <span>View end {formatTime(viewEnd)}</span>
        </div>
      </div>
    </div>
  );
};

export default WaveformEditor;