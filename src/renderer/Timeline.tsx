import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { PeakData, Selection } from '@shared/types';
import { Ruler } from './Ruler';
import { Waveform } from './Waveform';
import { Range } from './timelineRanges';
import {
  KEYBOARD_STEP_SECONDS,
  cursorAt,
  extendSelection,
  fractionToTime,
  hitEdge,
  isCursor,
  moveSelection,
  normalizeSelection,
  timeToFraction,
  xToFraction,
} from './selection';

type Drag =
  | { mode: 'new'; anchor: number }
  | { mode: 'start' | 'end'; fixed: number };

interface TimelineProps {
  duration: number;
  sampleRate: number;
  peaks: PeakData | null;
  selection: Selection | null;
  position?: number;
  fadeIn?: number | null;
  fadeOut?: number | null;
  keptRanges?: Range[];
  removedRanges?: Range[];
  onSelectionChange: (selection: Selection) => void;
  onSeek?: (time: number) => void;
}

export function Timeline({
  duration,
  sampleRate,
  peaks,
  selection,
  position = 0,
  fadeIn = null,
  fadeOut = null,
  keptRanges = [],
  removedRanges = [],
  onSelectionChange,
  onSeek,
}: TimelineProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const timeAt = (clientX: number): number => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return 0;
    }
    return fractionToTime(xToFraction(clientX - rect.left, rect.width), duration);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);

    const edge = hitEdge(event.clientX - rect.left, rect.width, selection, duration);
    if (edge && selection) {
      dragRef.current = { mode: edge, fixed: edge === 'start' ? selection.end : selection.start };
      return;
    }

    const time = timeAt(event.clientX);
    dragRef.current = { mode: 'new', anchor: time };
    onSelectionChange(cursorAt(time, duration, sampleRate));
    onSeek?.(time);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const time = timeAt(event.clientX);
    if (drag.mode === 'new') {
      onSelectionChange(normalizeSelection(drag.anchor, time, duration, sampleRate));
    } else if (drag.mode === 'start') {
      onSelectionChange(normalizeSelection(time, drag.fixed, duration, sampleRate));
    } else {
      onSelectionChange(normalizeSelection(drag.fixed, time, duration, sampleRate));
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onSelectionChange(cursorAt(event.key === 'Home' ? 0 : duration, duration, sampleRate));
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? KEYBOARD_STEP_SECONDS : -KEYBOARD_STEP_SECONDS;
    const current = selection ?? cursorAt(0, duration, sampleRate);
    onSelectionChange(
      event.shiftKey
        ? extendSelection(current, delta, duration, sampleRate)
        : moveSelection(current, delta, duration, sampleRate),
    );
  };

  const startFraction = selection ? timeToFraction(selection.start, duration) : 0;
  const endFraction = selection ? timeToFraction(selection.end, duration) : 0;
  const playheadFraction = position > 0 ? timeToFraction(position, duration) : null;
  const fadeInFraction = fadeIn && duration > 0 ? Math.min(1, fadeIn / duration) : null;
  const fadeOutFraction = fadeOut && duration > 0 ? Math.min(1, fadeOut / duration) : null;
  const overlayBase = { position: 'absolute', top: 0, bottom: 0 } as const;

  return (
    <div className="timeline">
      <div
        ref={surfaceRef}
        role="group"
        tabIndex={0}
        aria-label="Timeline — drag to select, or click to place the cursor"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          touchAction: 'none',
        }}
      >
        <Ruler duration={duration} />
        <div className="wave-lane">
          {peaks ? <Waveform peaks={peaks} /> : <div className="wave-loading">Loading waveform…</div>}
          {removedRanges.map((range, index) => {
            const from = timeToFraction(range.start, duration);
            const to = timeToFraction(range.end, duration);
            return (
              <div
                key={`removed-${index}`}
                className="removed"
                data-testid="removed-region"
                style={{ ...overlayBase, left: `${from * 100}%`, width: `${(to - from) * 100}%` }}
              />
            );
          })}
          {keptRanges.length === 1 && removedRanges.length > 0 && (
            <div
              className="kept"
              data-testid="kept-region"
              style={{
                ...overlayBase,
                left: `${timeToFraction(keptRanges[0].start, duration) * 100}%`,
                width: `${
                  (timeToFraction(keptRanges[0].end, duration) -
                    timeToFraction(keptRanges[0].start, duration)) *
                  100
                }%`,
              }}
            >
              <span className="kept-label">kept {formatSpan(keptRanges[0].end - keptRanges[0].start)}</span>
            </div>
          )}
          {fadeInFraction !== null && (
            <div
              className="fade in"
              data-testid="fade-in-overlay"
              style={{ width: `${fadeInFraction * 100}%` }}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points="0,0 0,100 100,0" fill="rgba(45, 212, 167, 0.16)" />
                <line
                  x1="0"
                  y1="100"
                  x2="100"
                  y2="0"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="fade-label">fade in {formatFade(fadeIn)}</span>
            </div>
          )}
          {fadeOutFraction !== null && (
            <div
              className="fade out"
              data-testid="fade-out-overlay"
              style={{ width: `${fadeOutFraction * 100}%` }}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points="100,0 100,100 0,0" fill="rgba(45, 212, 167, 0.16)" />
                <line
                  x1="0"
                  y1="0"
                  x2="100"
                  y2="100"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="fade-label">fade out {formatFade(fadeOut)}</span>
            </div>
          )}
          {selection &&
            (isCursor(selection) ? (
              <div
                style={{
                  ...overlayBase,
                  left: `${startFraction * 100}%`,
                  width: '2px',
                  background: 'var(--accent)',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <div
                style={{
                  ...overlayBase,
                  left: `${startFraction * 100}%`,
                  width: `${(endFraction - startFraction) * 100}%`,
                  background: 'rgba(45, 212, 167, 0.16)',
                  borderLeft: '2px solid var(--accent)',
                  borderRight: '2px solid var(--accent)',
                  pointerEvents: 'none',
                }}
              />
            ))}
        </div>
        {playheadFraction !== null && (
          <div
            aria-hidden="true"
            style={{
              ...overlayBase,
              left: `${playheadFraction * 100}%`,
              width: '2px',
              background: 'var(--warn)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}

function formatFade(seconds: number | null): string {
  return `${(seconds ?? 0).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}s`;
}

function formatSpan(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
