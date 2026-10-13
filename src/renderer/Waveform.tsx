import { useEffect, useRef } from 'react';
import { PeakData } from '@shared/types';
import { useT } from './LocaleContext';
import { channelLabel } from './labels';

function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: PeakData,
  width: number,
  height: number,
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

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = count <= 1 ? 0 : (i / (count - 1)) * (width - 1);
      const bucket = channel[i];
      ctx.moveTo(x, middle - bucket.max * amplitude);
      ctx.lineTo(x, middle - bucket.min * amplitude);
    }
    ctx.stroke();
  });
}

export function Waveform({ peaks }: { peaks: PeakData }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
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
      drawPeaks(ctx, peaks, width, height);
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
  }, [peaks]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t('waveform.label', { channels: channelLabel(peaks.channels, t) })}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
