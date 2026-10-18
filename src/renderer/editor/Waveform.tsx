import { useLayoutEffect, useRef } from 'react';
import { PeakData } from '@shared/types';
import { useT } from '../i18n/LocaleContext';
import { channelLabel } from './labels';
import { ZoomView, bucketRange } from './zoom';

function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: PeakData,
  width: number,
  height: number,
  view: ZoomView,
): void {
  ctx.clearRect(0, 0, width, height);
  const lanes = Math.max(1, peaks.channels);
  const laneHeight = height / lanes;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#4aa8ff');
  gradient.addColorStop(1, '#2b6aa0');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;

  peaks.buckets.forEach((channel, lane) => {
    const middle = lane * laneHeight + laneHeight / 2;
    const amplitude = (laneHeight / 2) * 0.92;
    const count = channel.length;
    if (count === 0) {
      return;
    }

    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const [from, to] = bucketRange(x, width, view, count);
      let min = channel[from].min;
      let max = channel[from].max;
      for (let i = from + 1; i < to; i++) {
        min = Math.min(min, channel[i].min);
        max = Math.max(max, channel[i].max);
      }
      ctx.moveTo(x + 0.5, middle - max * amplitude);
      ctx.lineTo(x + 0.5, middle - min * amplitude);
    }
    ctx.stroke();
  });
}

/**
 * Draws the `view` window of the clip. The canvas spans only that window of the
 * lane, so it stays viewport-sized however far the timeline is zoomed in.
 */
export function Waveform({ peaks, view }: { peaks: PeakData; view: ZoomView }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPeaks(ctx, peaks, width, height, view);
    };

    render();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [peaks, view.start, view.end]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t('waveform.label', { channels: channelLabel(peaks.channels, t) })}
      style={{
        position: 'absolute',
        top: 0,
        left: `${view.start * 100}%`,
        width: `${(view.end - view.start) * 100}%`,
        height: '100%',
        display: 'block',
      }}
    />
  );
}
