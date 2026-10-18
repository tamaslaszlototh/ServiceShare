import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  LOGO_AREA_HEIGHT,
  LogoCorner,
  LogoPlacement,
  SnapGuides,
  logoBox,
  moveLogo,
  nudgeLogo,
  resizeLogo,
  resolveLogoPlacement,
} from '@shared/coverLayout';
import { useT } from '../i18n/LocaleContext';

const CORNERS: LogoCorner[] = ['nw', 'ne', 'sw', 'se'];
const NUDGE_PX = 1;
const NUDGE_SHIFT_PX = 10;
const NO_GUIDES: SnapGuides = { vertical: [], horizontal: [] };

type Drag =
  | { mode: 'move'; offsetX: number; offsetY: number }
  | { mode: 'resize'; corner: LogoCorner; start: LogoPlacement };

interface LogoPlacementEditorProps {
  /** The cover composed without the logo. */
  coverUrl: string | null;
  logoUrl: string;
  placement: LogoPlacement | null;
  onDone: (placement: LogoPlacement) => void;
  onCancel: () => void;
}

const pctX = (value: number) => `${(value / COVER_WIDTH) * 100}%`;
const pctY = (value: number) => `${(value / COVER_HEIGHT) * 100}%`;

/**
 * Drag/resize editor for the logo placement, drawn over the logo-less cover
 * preview. Works in cover pixels and positions everything in percentages of the
 * 16:9 preview, so it matches the composed cover at any preview size.
 */
export function LogoPlacementEditor({ coverUrl, logoUrl, placement, onDone, onCancel }: LogoPlacementEditorProps) {
  const t = useT();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [draft, setDraft] = useState<LogoPlacement | null>(null);
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES);

  // the logo's own aspect ratio decides the box shape
  useEffect(() => {
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      const ratio = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1;
      setAspect(ratio);
      setDraft((current) => current ?? resolveLogoPlacement(placement, ratio));
    };
    image.onerror = () => {
      if (!alive) return;
      setAspect(1);
      setDraft((current) => current ?? resolveLogoPlacement(placement, 1));
    };
    image.src = logoUrl;
    return () => {
      alive = false;
    };
  }, [logoUrl, placement]);

  // focus the box once it appears so the arrow keys, Enter and Esc work right away
  const ready = draft !== null;
  useEffect(() => {
    if (ready) boxRef.current?.focus();
  }, [ready]);

  const toCover = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * COVER_WIDTH,
      y: ((clientY - rect.top) / rect.height) * COVER_HEIGHT,
    };
  };

  const beginDrag = (event: PointerEvent<HTMLElement>, drag: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    boxRef.current?.focus();
    surfaceRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = drag;
  };

  const handleBoxPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = toCover(event.clientX, event.clientY);
    if (!point || !draft) return;
    beginDrag(event, { mode: 'move', offsetX: point.x - draft.centerX, offsetY: point.y - draft.centerY });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const point = toCover(event.clientX, event.clientY);
    if (!drag || !point || !draft || aspect === null) return;
    if (drag.mode === 'move') {
      const moved = moveLogo(draft, point.x - drag.offsetX, point.y - drag.offsetY, aspect);
      setDraft(moved.placement);
      setGuides(moved.guides);
    } else {
      setDraft(resizeLogo(drag.start, drag.corner, point.x, point.y, aspect));
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setGuides(NO_GUIDES);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!draft || aspect === null) return;
    const step = event.shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (delta) {
      event.preventDefault();
      setDraft(nudgeLogo(draft, delta[0], delta[1], aspect));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onDone(draft);
    }
  };

  const box = draft && aspect !== null ? logoBox(draft, aspect) : null;

  return (
    <div className="logo-editor">
      <div
        ref={surfaceRef}
        className="cover-preview logo-editor-surface"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {coverUrl ? (
          <img src={coverUrl} alt={t('publish.coverAlt')} draggable={false} />
        ) : (
          <span className="muted">{t('publish.updatingPreview')}</span>
        )}
        <div
          className="logo-editor-band"
          aria-hidden="true"
          style={{ top: pctY(LOGO_AREA_HEIGHT) }}
        />
        {guides.vertical.map((x) => (
          <div
            key={`v${x}`}
            className="logo-guide vertical"
            aria-hidden="true"
            style={{ left: pctX(x), height: pctY(LOGO_AREA_HEIGHT) }}
          />
        ))}
        {guides.horizontal.map((y) => (
          <div key={`h${y}`} className="logo-guide horizontal" aria-hidden="true" style={{ top: pctY(y) }} />
        ))}
        {box && (
          <div
            ref={boxRef}
            className="logo-box"
            role="group"
            tabIndex={0}
            aria-label={t('publish.logoPlacement.boxLabel')}
            onPointerDown={handleBoxPointerDown}
            onKeyDown={handleKeyDown}
            style={{ left: pctX(box.x), top: pctY(box.y), width: pctX(box.width), height: pctY(box.height) }}
          >
            <img src={logoUrl} alt="" draggable={false} />
            {CORNERS.map((corner) => (
              <span
                key={corner}
                className={`logo-handle ${corner}`}
                aria-hidden="true"
                onPointerDown={(event) => draft && beginDrag(event, { mode: 'resize', corner, start: draft })}
              />
            ))}
          </div>
        )}
      </div>
      <div className="logo-editor-actions">
        <span className="muted logo-editor-hint">{t('publish.logoPlacement.hint')}</span>
        <span className="spacer" />
        <button className="btn ghost" type="button" onClick={onCancel}>
          {t('publish.logoPlacement.cancel')}
        </button>
        <button className="btn primary" type="button" disabled={!draft} onClick={() => draft && onDone(draft)}>
          {t('publish.logoPlacement.done')}
        </button>
      </div>
    </div>
  );
}
