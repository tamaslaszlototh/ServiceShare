import { useEffect, useState } from 'react';
import { AppError } from '@shared/types';
import { TOO_LONG_MESSAGE } from '@shared/limits';
import { ErrorBanner } from './ErrorBanner';

const SAMPLES: AppError[] = [
  { code: 'FormatError', message: 'Only 16- or 24-bit PCM WAV files are supported.' },
  { code: 'CorruptFile', message: 'The file could not be read.', details: 'ffprobe: Invalid data found when processing input.' },
  { code: 'PermissionError', message: 'No permission to write to that location.', details: 'Try choosing your Music or Documents folder.' },
  { code: 'DiskFull', message: 'Not enough disk space to finish rendering.', details: 'Free up some space and try again.' },
  { code: 'EngineError', message: 'FFmpeg could not be started.', details: 'Bundled binary missing; falling back to PATH.' },
  { code: 'RenderError', message: 'The preview render failed.', details: 'filter_complex: Error reinitializing filters.' },
  { code: 'NetworkError', message: 'The connection dropped during upload.' },
  { code: 'QuotaExceeded', message: 'Your YouTube upload quota has been exceeded.' },
  { code: 'AuthRevoked', message: 'Your sign-in was revoked.' },
  { code: 'UploadExpired', message: 'The upload session expired before it finished.' },
  { code: 'TooLong', message: TOO_LONG_MESSAGE },
  { code: 'UnverifiedProject', message: 'This account has not verified a project on YouTube.' },
  { code: 'TokenStorageError', message: 'Your sign-in token could not be saved.' },
];

export function ErrorPreview() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!import.meta.env.DEV || !open) {
    return null;
  }

  return (
    <div className="error-preview">
      <div className="error-preview-head">
        <strong>Error preview</strong>
        <span className="muted">dev only · Cmd/Ctrl+Shift+E to close</span>
        <span className="spacer" />
        <button className="btn ghost" type="button" onClick={() => setDismissed([])}>
          Reset
        </button>
      </div>
      {SAMPLES.filter((sample) => !dismissed.includes(sample.code)).map((sample) => (
        <ErrorBanner
          key={sample.code}
          error={sample}
          onRetry={() => {}}
          onRecheck={() => {}}
          onSignIn={() => {}}
          onDismiss={() => setDismissed((codes) => [...codes, sample.code])}
        />
      ))}
    </div>
  );
}
