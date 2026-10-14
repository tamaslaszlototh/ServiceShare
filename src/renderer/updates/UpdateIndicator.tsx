import { useEffect, useState } from 'react';
import { UpdateStatus } from '@shared/types';
import { ErrorBanner } from '../errors/ErrorBanner';
import { useT } from '../i18n/LocaleContext';
import { updateView } from './updates';

/** Live auto-update status, shared by the header badge and the error banner below it. */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });

  useEffect(() => {
    const unsubscribe = window.api.onUpdateStatus(setStatus);
    void window.api.getUpdateStatus().then(setStatus);
    return unsubscribe;
  }, []);

  const dismiss = () => setStatus({ state: 'idle' });
  return { status, dismiss };
}

interface UpdateViewProps {
  status: UpdateStatus;
  onDismiss: () => void;
}

/** Header badge for auto-update: progress, "Restart to update", and manual-check notices. */
export function UpdateIndicator({ status, onDismiss }: UpdateViewProps) {
  const t = useT();
  const view = updateView(status, t);
  if (!view || view.kind === 'error') {
    return null;
  }

  return (
    <span className="update-indicator" role="status">
      <span className="notice">{view.text}</span>
      {view.kind === 'progress' && (
        <span className="progress" role="progressbar" aria-valuenow={view.percent} aria-valuemin={0} aria-valuemax={100}>
          <span className="progress-fill" style={{ width: `${view.percent}%` }} />
        </span>
      )}
      {view.kind === 'ready' && (
        <button className="btn primary" type="button" onClick={() => void window.api.installUpdate()}>
          {view.action}
        </button>
      )}
      {view.kind === 'notice' && (
        <button className="dismiss" type="button" aria-label={t('error.dismiss')} onClick={onDismiss}>
          ×
        </button>
      )}
    </span>
  );
}

/** Full-width banner under the header for a failed manual update check. */
export function UpdateErrorBanner({ status, onDismiss }: UpdateViewProps) {
  const t = useT();
  const view = updateView(status, t);
  if (view?.kind !== 'error') {
    return null;
  }

  return <ErrorBanner error={view.error} onDismiss={onDismiss} onRetry={() => void window.api.checkForUpdates()} />;
}
