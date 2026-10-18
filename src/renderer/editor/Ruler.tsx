import { rulerTicks } from './ticks';

export function Ruler({ duration, zoom = 1 }: { duration: number; zoom?: number }) {
  const ticks = rulerTicks(duration, zoom);

  return (
    <div role="presentation" className="ruler">
      {ticks.map((tick, index) => (
        <span
          key={index}
          style={{
            position: 'absolute',
            left: `${tick.position * 100}%`,
            transform:
              tick.position === 0
                ? 'none'
                : tick.position === 1
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
}
