import { useEffect, useMemo, useState } from 'react';
import { AppError, ExportFormat } from '@shared/types';
import { ErrorBanner } from '../errors/ErrorBanner';
import { normalizeError } from '@shared/apperror';
import { useT } from '../i18n/LocaleContext';

interface ExportDialogProps {
  onClose: () => void;
  onExported: (outputPath: string) => void;
}

export function ExportDialog({ onClose, onExported }: ExportDialogProps) {
  const t = useT();
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [exporting, setExporting] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<AppError | null>(null);

  const formats = useMemo(
    () => [
      { value: 'wav' as ExportFormat, label: t('dialog.export.wav'), hint: t('dialog.export.wavHint') },
      { value: 'mp3' as ExportFormat, label: t('dialog.export.mp3'), hint: t('dialog.export.mp3Hint') },
    ],
    [t],
  );

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
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={t('dialog.export.ariaLabel')}>
        <h3 className="modal-title">{t('dialog.export.title')}</h3>

        <div className="format-list">
          {formats.map((option) => (
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
          <span className="muted">
            {exporting ? t('dialog.export.progress', { percent: Math.round(percent) }) : t('dialog.export.choose')}
          </span>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose} disabled={exporting}>
            {t('dialog.cancel')}
          </button>
          <button className="btn primary" onClick={() => void run()} disabled={exporting}>
            {t('dialog.export.export')}
          </button>
        </div>
      </div>
    </div>
  );
}
