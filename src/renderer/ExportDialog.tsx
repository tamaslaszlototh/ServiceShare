import { useEffect, useState } from 'react';
import { AppError, ExportFormat } from '@shared/types';
import { ErrorBanner } from './ErrorBanner';
import { normalizeError } from '@shared/apperror';

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'wav', label: 'WAV', hint: 'Preserves source sample rate, bit depth and channels' },
  { value: 'mp3', label: 'MP3', hint: '192 kbps · smaller file, stereo down-mix if needed' },
];

interface ExportDialogProps {
  onClose: () => void;
  onExported: (outputPath: string) => void;
}

export function ExportDialog({ onClose, onExported }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [exporting, setExporting] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    return window.api.onExportProgress((event) => setPercent(event.percent));
  }, []);

  const run = async () => {
    setError(null);
    setExporting(true);
    setPercent(0);
    try {
      const result = await window.api.exportAudio(format);
      if (result.status === 'error') {
        setError(result.error);
        return;
      }
      if (result.status === 'ok') {
        onExported(result.outputPath);
      }
    } catch (e) {
      setError(normalizeError(e, 'RenderError'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Export edited audio">
        <h3 className="modal-title">Export edited audio</h3>

        <div className="format-list">
          {FORMATS.map((option) => (
            <label
              key={option.value}
              className={`format-option${format === option.value ? ' on' : ''}`}
            >
              <input
                type="radio"
                name="export-format"
                value={option.value}
                checked={format === option.value}
                disabled={exporting}
                onChange={() => setFormat(option.value)}
              />
              <span className="format-label">{option.label}</span>
              <span className="muted">{option.hint}</span>
            </label>
          ))}
        </div>

        {error && (
          <ErrorBanner
            className="modal-error"
            error={error}
            onDismiss={() => setError(null)}
            onRetry={() => void run()}
          />
        )}

        {exporting && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}

        <div className="modal-actions">
          <span className="muted">{exporting ? `Exporting… ${Math.round(percent)}%` : 'Choose a format, then a destination.'}</span>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void run()} disabled={exporting}>
            Export…
          </button>
        </div>
      </div>
    </div>
  );
}
