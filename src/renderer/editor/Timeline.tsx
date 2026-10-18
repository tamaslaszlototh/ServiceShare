import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { PeakData, Selection } from '@shared/types';
import { Ruler } from './Ruler';
import { Waveform } from './Waveform';
import { useLocale } from '../i18n/LocaleContext';
import {
  KEYBOARD_STEP_SECONDS,
  cursorAt,
  extendSelection,
  formatFadeSeconds,
  fractionToTime,
  hitEdge,
  isCursor,
  moveSelection,
  normalizeSelection,
  timeToFraction,
  xToFraction,
} from './selection';
import { anchoredScroll, visibleView, wheelZoom } from './zoom';

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
  zoom?: number;
  onSelectionChange: (selection: Selection) => void;
  onSeek?: (time: number) => void;
  onZoomChange?: (zoom: number) => void;
}

// a WheelEvent in DOM_DELTA_LINE mode reports lines; convert to roughly pixels
const WHEEL_LINE_PX = 40;
// when the playhead leaves the view, re-scroll so it sits this far into it
const FOLLOW_LEAD = 0.1;

export function Timeline({
  duration,
  sampleRate,
  peaks,
  selection,
  position = 0,
  fadeIn = null,
  fadeOut = null,
  zoom = 1,
  onSelectionChange,
  onSeek,
  onZoomChange,
}: TimelineProps) {
  const { locale, t } = useLocale();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  // scrollLeft as last observed, before a zoom-out shrinks the content and clamps it
  const scrollLeftRef = useRef(0);
  const zoomRef = useRef(zoom);
  const appliedZoomRef = useRef(zoom);
  // viewport x to keep fixed across the next zoom change (null: the centre)
  const zoomAnchorRef = useRef<number | null>(null);
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const setScroll = (value: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    scroller.scrollLeft = value;
    scrollLeftRef.current = scroller.scrollLeft;
    setScrollLeft(scroller.scrollLeft);
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    setViewportWidth(scroller.clientWidth);
    const observer = new ResizeObserver(() => setViewportWidth(scroller.clientWidth));
    observer.observe(scroller);

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const deltaY =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
      const next = wheelZoom(zoomRef.current, deltaY);
      if (next === zoomRef.current) {
        return;
      }
      zoomRef.current = next;
      zoomAnchorRef.current = event.clientX - scroller.getBoundingClientRect().left;
      onZoomChangeRef.current?.(next);
    };
    scroller.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // runs after the surface has its new width, before paint
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const previous = appliedZoomRef.current;
    appliedZoomRef.current = zoom;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    const scroller = scrollerRef.current;
    if (previous === zoom || !scroller) {
      return;
    }
    const width = scroller.clientWidth;
    setScroll(anchoredScroll(scrollLeftRef.current, anchor ?? width / 2, previous, zoom, width));
  }, [zoom]);

  // keep the playhead in view while playing through a zoomed-in clip (not on zoom
  // changes: those keep their own anchor)
  useEffect(() => {
    const scroller = scrollerRef.current;
    const zoom = zoomRef.current;
    if (!scroller || zoom <= 1 || position <= 0 || duration <= 0) {
      return;
    }
    const width = scroller.clientWidth;
    const x = timeToFraction(position, duration) * width * zoom;
    const left = scrollLeftRef.current;
    if (x < left || x > left + width) {
      setScroll(x - width * FOLLOW_LEAD);
    }
  }, [position, duration]);

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
  const view = visibleView(scrollLeft, viewportWidth, zoom);

  return (
    <div className="timeline">
      <div
        ref={scrollerRef}
        className="timeline-scroll"
        onScroll={(event) => {
          scrollLeftRef.current = event.currentTarget.scrollLeft;
          setScrollLeft(event.currentTarget.scrollLeft);
        }}
      >
        <div
          ref={surfaceRef}
          role="group"
          tabIndex={0}
          aria-label={t('timeline.ariaLabel')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            width: `${zoom * 100}%`,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            touchAction: 'none',
          }}
        >
          <Ruler duration={duration} zoom={zoom} />
          <div className="wave-lane">
            {peaks ? (
              <Waveform peaks={peaks} view={view} />
            ) : (
              <div className="wave-loading">{t('timeline.loading')}</div>
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
                <span className="fade-label">
                  {t('timeline.fadeIn', { seconds: formatFadeSeconds(fadeIn, locale) })}
                </span>
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
                <span className="fade-label">
                  {t('timeline.fadeOut', { seconds: formatFadeSeconds(fadeOut, locale) })}
                </span>
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
    </div>
  );
}
