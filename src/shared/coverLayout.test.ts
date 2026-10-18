import { describe, it, expect } from 'vitest';
import {
  LOGO_AREA_HEIGHT,
  LOGO_AREA_WIDTH,
  LOGO_MARGIN,
  LOGO_MAX_SIZE,
  LOGO_MIN_SIZE,
  clampLogoPlacement,
  defaultLogoPlacement,
  logoBox,
  logoDimensions,
  logoOverlayPosition,
  moveLogo,
  nudgeLogo,
  parseLogoPlacement,
  resizeLogo,
  resolveLogoPlacement,
} from './coverLayout';

const SQUARE = 1;
const WIDE = 3; // e.g. 300×100

describe('logoDimensions', () => {
  it('uses the size as the longer side and keeps the aspect ratio', () => {
    expect(logoDimensions(120, WIDE)).toEqual({ width: 120, height: 40 });
    expect(logoDimensions(120, 0.5)).toEqual({ width: 60, height: 120 });
    expect(logoDimensions(128, SQUARE)).toEqual({ width: 128, height: 128 });
  });

  it('treats an unknown aspect as square', () => {
    expect(logoDimensions(100, Number.NaN)).toEqual({ width: 100, height: 100 });
  });
});

describe('default placement', () => {
  it('is top-centre at 128 px, with the top edge on the margin', () => {
    expect(logoBox(defaultLogoPlacement(SQUARE), SQUARE)).toEqual({ x: 576, y: 32, width: 128, height: 128 });
    const wide = logoBox(defaultLogoPlacement(WIDE), WIDE);
    expect(wide.y).toBeCloseTo(LOGO_MARGIN);
    expect(wide.x + wide.width / 2).toBe(LOGO_AREA_WIDTH / 2);
  });

  it('is what a missing placement resolves to', () => {
    expect(resolveLogoPlacement(null, SQUARE)).toEqual(defaultLogoPlacement(SQUARE));
  });
});

describe('clampLogoPlacement', () => {
  it('keeps the box inside the area above the title band', () => {
    const p = clampLogoPlacement({ centerX: 5000, centerY: 5000, size: 100 }, SQUARE);
    expect(logoBox(p, SQUARE)).toEqual({ x: LOGO_AREA_WIDTH - 100, y: LOGO_AREA_HEIGHT - 100, width: 100, height: 100 });
  });

  it('limits the size', () => {
    expect(clampLogoPlacement({ centerX: 640, centerY: 280, size: 10 }, SQUARE).size).toBe(LOGO_MIN_SIZE);
    expect(clampLogoPlacement({ centerX: 640, centerY: 280, size: 9999 }, SQUARE).size).toBe(LOGO_MAX_SIZE);
  });

  it('keeps the centre for a logo of another aspect ratio, pushing it back inside', () => {
    // saved for a square logo in the top-right corner, then a wide logo is chosen
    const saved = { centerX: 1230, centerY: 50, size: 100 };
    const p = clampLogoPlacement(saved, WIDE);
    const box = logoBox(p, WIDE);
    expect(box.x + box.width).toBe(LOGO_AREA_WIDTH);
    expect(p.centerY).toBe(50);
  });
});

describe('nudgeLogo', () => {
  it('moves by the delta and stops at the edges', () => {
    const p = { centerX: 640, centerY: 280, size: 100 };
    expect(nudgeLogo(p, 10, -1, SQUARE)).toEqual({ centerX: 650, centerY: 279, size: 100 });
    expect(nudgeLogo({ ...p, centerX: 50 }, -10, 0, SQUARE).centerX).toBe(50);
  });
});

describe('moveLogo', () => {
  const p = { centerX: 300, centerY: 300, size: 100 };

  it('moves freely away from guides', () => {
    expect(moveLogo(p, 400, 250, SQUARE)).toEqual({
      placement: { centerX: 400, centerY: 250, size: 100 },
      guides: { vertical: [], horizontal: [] },
    });
  });

  it('snaps to the vertical centre line', () => {
    const { placement, guides } = moveLogo(p, 645, 250, SQUARE);
    expect(placement.centerX).toBe(640);
    expect(guides.vertical).toEqual([640]);
  });

  it('snaps the edges to the margins', () => {
    // left edge at 35 → 32, top edge at 28 → 32
    const { placement, guides } = moveLogo(p, 85, 78, SQUARE);
    expect(logoBox(placement, SQUARE)).toMatchObject({ x: 32, y: 32 });
    expect(guides).toEqual({ vertical: [32], horizontal: [32] });

    // right and bottom edges
    const far = moveLogo(p, LOGO_AREA_WIDTH - 85, LOGO_AREA_HEIGHT - 85, SQUARE);
    expect(logoBox(far.placement, SQUARE)).toMatchObject({
      x: LOGO_AREA_WIDTH - LOGO_MARGIN - 100,
      y: LOGO_AREA_HEIGHT - LOGO_MARGIN - 100,
    });
  });

  it('cannot leave the area', () => {
    const { placement } = moveLogo(p, -500, 9999, SQUARE);
    expect(logoBox(placement, SQUARE)).toMatchObject({ x: 0, y: LOGO_AREA_HEIGHT - 100 });
  });
});

describe('resizeLogo', () => {
  const p = { centerX: 300, centerY: 300, size: 100 }; // box 250..350

  it('keeps the opposite corner fixed', () => {
    const grown = logoBox(resizeLogo(p, 'se', 450, 450, SQUARE), SQUARE);
    expect(grown).toEqual({ x: 250, y: 250, width: 200, height: 200 });

    const fromNw = logoBox(resizeLogo(p, 'nw', 200, 200, SQUARE), SQUARE);
    expect(fromNw).toEqual({ x: 200, y: 200, width: 150, height: 150 });
  });

  it('keeps the aspect ratio of a wide logo', () => {
    const r = resizeLogo({ centerX: 300, centerY: 300, size: 150 }, 'se', 600, 310, WIDE);
    const box = logoBox(r, WIDE);
    expect(box.width / box.height).toBeCloseTo(WIDE);
    expect(r.size).toBe(375);
  });

  it('respects the size limits and the room left in the area', () => {
    expect(resizeLogo(p, 'se', 251, 251, SQUARE).size).toBe(LOGO_MIN_SIZE);
    const roomy = { centerX: 200, centerY: 100, size: 100 }; // fixed nw corner at (150, 50)
    expect(resizeLogo(roomy, 'se', 2000, 2000, SQUARE).size).toBe(LOGO_MAX_SIZE);
    // fixed corner at (250, 250) with the se handle: only 560 - 250 = 310 px of room below
    expect(resizeLogo(p, 'se', 2000, 2000, SQUARE).size).toBe(310);
    // fixed corner at (350, 350) with the nw handle: only 350 px of room up and left
    const cornered = { centerX: 300, centerY: 300, size: 100 };
    expect(resizeLogo(cornered, 'nw', -500, -500, SQUARE).size).toBe(350);
  });
});

describe('parseLogoPlacement', () => {
  it('accepts a well-formed placement, rounding it and clamping its size', () => {
    expect(parseLogoPlacement({ centerX: 1, centerY: 2, size: 1000 })).toEqual({ centerX: 1, centerY: 2, size: LOGO_MAX_SIZE });
    expect(parseLogoPlacement({ centerX: 120.75, centerY: 219.5011, size: 174.6 })).toEqual({ centerX: 121, centerY: 220, size: 175 });
  });

  it('rejects anything malformed', () => {
    expect(parseLogoPlacement(null)).toBeNull();
    expect(parseLogoPlacement('x')).toBeNull();
    expect(parseLogoPlacement({ centerX: 1, centerY: 2 })).toBeNull();
    expect(parseLogoPlacement({ centerX: Number.NaN, centerY: 2, size: 100 })).toBeNull();
  });
});

describe('logoOverlayPosition', () => {
  it('keeps the top-centre default', () => {
    expect(logoOverlayPosition(null)).toBe('(W-w)/2:32');
  });

  it('places by centre and lets FFmpeg push the real logo back inside the area', () => {
    expect(logoOverlayPosition({ centerX: 1230.4, centerY: 49.6, size: 100 })).toBe(
      String.raw`x=clip(1230-w/2\,0\,W-w):y=clip(50-h/2\,0\,560-h)`,
    );
  });
});
