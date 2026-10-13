import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { PeakData, Selection } from '@shared/types';
import { Ruler } from './Ruler';
import { Waveform } from './Waveform';
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
  onSelectionChange: (selection: Selection) => void;
}

export function Timeline({
  duration,
  sampleRate,
  peaks,
  selection,
  onSelectionChange,
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
  const overlayBase = { position: 'absolute', top: 0, bottom: 0 } as const;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #ccc',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
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
        <div style={{ flex: 1, position: 'relative', minHeight: '120px' }}>
          {peaks ? <Waveform peaks={peaks} /> : <div style={{ padding: '16px', color: '#666' }}>Loading waveform…</div>}
          {selection &&
            (isCursor(selection) ? (
              <div
                style={{
                  ...overlayBase,
                  left: `${startFraction * 100}%`,
                  width: '2px',
                  background: '#2dd4a7',
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
                  borderLeft: '2px solid #2dd4a7',
                  borderRight: '2px solid #2dd4a7',
                  pointerEvents: 'none',
                }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
