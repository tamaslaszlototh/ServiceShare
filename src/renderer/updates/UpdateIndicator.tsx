import { useEffect, useState } from 'react';
import { UpdateStatus } from '@shared/types';
import { ErrorBanner } from '../errors/ErrorBanner';
import { useT } from '../i18n/LocaleContext';
import { updateView } from './updates';

/** Header badge for auto-update: progress, "Restart to update", and manual-check notices. */
export function UpdateIndicator() {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });

  useEffect(() => {
    const unsubscribe = window.api.onUpdateStatus(setStatus);
    void window.api.getUpdateStatus().then(setStatus);
    return unsubscribe;
  }, []);

  const view = updateView(status, t);
  if (!view) {
    return null;
  }

  const dismiss = () => setStatus({ state: 'idle' });

  if (view.kind === 'error') {
    return (
      <div className="global-error">
        <ErrorBanner error={view.error} onDismiss={dismiss} onRetry={() => void window.api.checkForUpdates()} />
      </div>
    );
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
        <button className="dismiss" type="button" aria-label={t('error.dismiss')} onClick={dismiss}>
          ×
        </button>
      )}
    </span>
  );
}
