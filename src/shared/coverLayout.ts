/**
 * Cover geometry shared by the compositor (main) and the logo placement editor
 * (renderer). All values are cover pixels on the 1280×720 composed image.
 */
export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 720;
export const COVER_BAND_HEIGHT = 160;

/** The logo stays inside the area above the title band. */
export const LOGO_AREA_WIDTH = COVER_WIDTH;
export const LOGO_AREA_HEIGHT = COVER_HEIGHT - COVER_BAND_HEIGHT;
export const LOGO_MARGIN = 32;
export const LOGO_DEFAULT_SIZE = 128;
export const LOGO_MIN_SIZE = 48;
export const LOGO_MAX_SIZE = 400;
/** How close (cover px) the box must get to the centre line or a margin to snap onto it. */
export const LOGO_SNAP_DISTANCE = 8;

/**
 * Where the logo sits: its centre point and the length of its longer side. The
 * aspect ratio is always the logo image's own; null means the default
 * (top-centre, LOGO_DEFAULT_SIZE).
 */
export interface LogoPlacement {
  centerX: number;
  centerY: number;
  size: number;
}

export interface LogoBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LogoCorner = 'nw' | 'ne' | 'sw' | 'se';

export interface SnapGuides {
  /** x positions of vertical guide lines */
  vertical: number[];
  /** y positions of horizontal guide lines */
  horizontal: number[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

export function clampLogoSize(size: number): number {
  return clamp(Math.round(size), LOGO_MIN_SIZE, LOGO_MAX_SIZE);
}

/** Width and height of a logo of `aspect` (width / height) whose longer side is `size`. */
export function logoDimensions(size: number, aspect: number): { width: number; height: number } {
  const a = safeAspect(aspect);
  return a >= 1 ? { width: size, height: size / a } : { width: size * a, height: size };
}

export function defaultLogoPlacement(aspect: number): LogoPlacement {
  const { height } = logoDimensions(LOGO_DEFAULT_SIZE, aspect);
  return { centerX: LOGO_AREA_WIDTH / 2, centerY: LOGO_MARGIN + height / 2, size: LOGO_DEFAULT_SIZE };
}

/** Clamps the size, then pushes the box back inside the logo area. */
export function clampLogoPlacement(placement: LogoPlacement, aspect: number): LogoPlacement {
  const size = clampLogoSize(placement.size);
  const { width, height } = logoDimensions(size, aspect);
  return {
    centerX: clamp(placement.centerX, width / 2, LOGO_AREA_WIDTH - width / 2),
    centerY: clamp(placement.centerY, height / 2, LOGO_AREA_HEIGHT - height / 2),
    size,
  };
}

/** The saved placement (or the default) as it lands on the cover for a logo of `aspect`. */
export function resolveLogoPlacement(placement: LogoPlacement | null, aspect: number): LogoPlacement {
  return clampLogoPlacement(placement ?? defaultLogoPlacement(aspect), aspect);
}

export function logoBox(placement: LogoPlacement, aspect: number): LogoBox {
  const { width, height } = logoDimensions(placement.size, aspect);
  return { x: placement.centerX - width / 2, y: placement.centerY - height / 2, width, height };
}

/** Moves by a delta, without snapping (keyboard nudges). */
export function nudgeLogo(placement: LogoPlacement, dx: number, dy: number, aspect: number): LogoPlacement {
  return clampLogoPlacement(
    { ...placement, centerX: placement.centerX + dx, centerY: placement.centerY + dy },
    aspect,
  );
}

function snapAxis(
  start: number,
  targets: { line: number; offset: number }[],
): { start: number; guide: number | null } {
  let best: { start: number; guide: number; distance: number } | null = null;
  for (const { line, offset } of targets) {
    const distance = Math.abs(start + offset - line);
    if (distance <= LOGO_SNAP_DISTANCE && (!best || distance < best.distance)) {
      best = { start: line - offset, guide: line, distance };
    }
  }
  return best ? { start: best.start, guide: best.guide } : { start, guide: null };
}

/**
 * Places the logo with its centre at (centerX, centerY), snapping the box to the
 * vertical centre line and the edge margins when it comes within
 * LOGO_SNAP_DISTANCE, and reports which guide lines it snapped to.
 */
export function moveLogo(
  placement: LogoPlacement,
  centerX: number,
  centerY: number,
  aspect: number,
): { placement: LogoPlacement; guides: SnapGuides } {
  const moved = clampLogoPlacement({ ...placement, centerX, centerY }, aspect);
  const box = logoBox(moved, aspect);
  const x = snapAxis(box.x, [
    { line: LOGO_AREA_WIDTH / 2, offset: box.width / 2 },
    { line: LOGO_MARGIN, offset: 0 },
    { line: LOGO_AREA_WIDTH - LOGO_MARGIN, offset: box.width },
  ]);
  const y = snapAxis(box.y, [
    { line: LOGO_MARGIN, offset: 0 },
    { line: LOGO_AREA_HEIGHT - LOGO_MARGIN, offset: box.height },
  ]);
  return {
    placement: clampLogoPlacement(
      { ...moved, centerX: x.start + box.width / 2, centerY: y.start + box.height / 2 },
      aspect,
    ),
    guides: {
      vertical: x.guide === null ? [] : [x.guide],
      horizontal: y.guide === null ? [] : [y.guide],
    },
  };
}

/**
 * Resizes by dragging `corner` to (pointerX, pointerY) while the opposite corner
 * stays put. The aspect ratio is kept, and the size is limited both to
 * LOGO_MIN_SIZE..LOGO_MAX_SIZE and to the room left inside the logo area.
 */
export function resizeLogo(
  placement: LogoPlacement,
  corner: LogoCorner,
  pointerX: number,
  pointerY: number,
  aspect: number,
): LogoPlacement {
  const a = safeAspect(aspect);
  const box = logoBox(placement, a);
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const fixedX = west ? box.x + box.width : box.x;
  const fixedY = north ? box.y + box.height : box.y;

  const wanted = Math.max(Math.abs(pointerX - fixedX), Math.abs(pointerY - fixedY) * a);
  const roomWidth = west ? fixedX : LOGO_AREA_WIDTH - fixedX;
  const roomHeight = north ? fixedY : LOGO_AREA_HEIGHT - fixedY;
  // `wanted` and the room are widths; convert to the longer side
  const toSize = (width: number) => (a >= 1 ? width : width / a);
  const maxSize = Math.min(LOGO_MAX_SIZE, toSize(roomWidth), toSize(roomHeight * a));
  const size = Math.max(LOGO_MIN_SIZE, Math.min(Math.round(toSize(wanted)), Math.floor(maxSize)));

  const { width, height } = logoDimensions(size, a);
  const x = west ? fixedX - width : fixedX;
  const y = north ? fixedY - height : fixedY;
  return clampLogoPlacement({ centerX: x + width / 2, centerY: y + height / 2, size }, a);
}

/**
 * Reads a persisted or IPC-supplied placement, rounded to whole cover pixels
 * (as FFmpeg places it); anything malformed is null.
 */
export function parseLogoPlacement(value: unknown): LogoPlacement | null {
  if (typeof value !== 'object' || value === null) return null;
  const { centerX, centerY, size } = value as Record<string, unknown>;
  if (![centerX, centerY, size].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  return {
    centerX: Math.round(centerX as number),
    centerY: Math.round(centerY as number),
    size: clampLogoSize(size as number),
  };
}

/**
 * FFmpeg `overlay` x/y for a logo already scaled to its size. FFmpeg knows the
 * logo's real dimensions (w, h), so it does the final push back inside the
 * logo area itself: a placement saved for one logo stays valid for another.
 */
export function logoOverlayPosition(placement: LogoPlacement | null): string {
  if (!placement) {
    return `(W-w)/2:${LOGO_MARGIN}`;
  }
  const cx = Math.round(placement.centerX);
  const cy = Math.round(placement.centerY);
  return String.raw`x=clip(${cx}-w/2\,0\,W-w):y=clip(${cy}-h/2\,0\,${LOGO_AREA_HEIGHT}-h)`;
}
