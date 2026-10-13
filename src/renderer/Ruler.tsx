import { rulerTicks } from './ticks';

export function Ruler({ duration }: { duration: number }) {
  const ticks = rulerTicks(duration);

  return (
    <div
      role="presentation"
      style={{
        position: 'relative',
        height: '20px',
        fontSize: '11px',
        color: '#666',
        fontFamily: 'ui-monospace, Menlo, monospace',
      }}
    >
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
