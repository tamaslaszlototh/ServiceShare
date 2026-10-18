export const ZOOM_MIN = 1;
export const ZOOM_MAX = 32;
export const ZOOM_BUTTON_FACTOR = 2;
// exp(-deltaY * sensitivity): one ~100px mouse-wheel notch zooms by ~1.2x
const WHEEL_SENSITIVITY = 0.002;

/** Visible window of the timeline, as fractions of the full duration. */
export interface ZoomView {
  start: number;
  end: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return ZOOM_MIN;
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function zoomIn(zoom: number): number {
  return clampZoom(zoom * ZOOM_BUTTON_FACTOR);
}

export function zoomOut(zoom: number): number {
  return clampZoom(zoom / ZOOM_BUTTON_FACTOR);
}

export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-deltaY * WHEEL_SENSITIVITY));
}

/**
 * Scroll offset that keeps the content under `anchorX` (px from the viewport's
 * left edge) in place when the zoom changes from `oldZoom` to `newZoom`.
 */
export function anchoredScroll(
  scrollLeft: number,
  anchorX: number,
  oldZoom: number,
  newZoom: number,
  viewportWidth: number,
): number {
  const target = ((scrollLeft + anchorX) * newZoom) / oldZoom - anchorX;
  const max = Math.max(0, viewportWidth * newZoom - viewportWidth);
  return Math.min(max, Math.max(0, target));
}

export function visibleView(scrollLeft: number, viewportWidth: number, zoom: number): ZoomView {
  const contentWidth = viewportWidth * zoom;
  if (contentWidth <= 0) {
    return { start: 0, end: 1 };
  }
  const start = Math.min(1, Math.max(0, scrollLeft / contentWidth));
  const end = Math.min(1, Math.max(start, (scrollLeft + viewportWidth) / contentWidth));
  return { start, end };
}

/** Half-open bucket index range [from, to) covered by pixel column `x` of a `width`-px view. */
export function bucketRange(
  x: number,
  width: number,
  view: ZoomView,
  count: number,
): [number, number] {
  const span = view.end - view.start;
  const f0 = view.start + (x / width) * span;
  const f1 = view.start + ((x + 1) / width) * span;
  const from = Math.min(count - 1, Math.max(0, Math.floor(f0 * count)));
  const to = Math.min(count, Math.max(from + 1, Math.floor(f1 * count)));
  return [from, to];
}
