import { AppError } from '@shared/types';
import { ErrorAction, errorAction, localizedErrorLabel } from './errors';
import { useT } from '../i18n/LocaleContext';

export interface ErrorBannerProps {
  error: AppError;
  onDismiss?: () => void;
  action?: ErrorAction | null;
  onRetry?: () => void;
  onRecheck?: () => void;
  onSignIn?: () => void;
  className?: string;
  heading?: string;
}

export function ErrorBanner({
  error,
  onDismiss,
  action,
  onRetry,
  onRecheck,
  onSignIn,
  className = '',
  heading,
}: ErrorBannerProps) {
  const t = useT();
  const effective = action === undefined ? errorAction(error.code, t) : action;

  const handleAction = () => {
    if (!effective) return;
    if (effective.kind === 'retry') {
      onRetry ? onRetry() : onDismiss?.();
      return;
    }
    if (effective.kind === 'recheck') {
      onRecheck ? onRecheck() : void window.api.checkEngine();
      onDismiss?.();
      return;
    }
    if (effective.kind === 'signin') {
      if (onSignIn) {
        onSignIn();
      } else {
        void window.api.signIn();
        onDismiss?.();
      }
    }
  };

  return (
    <div role="alert" className={`banner ${className}`.trim()}>
      <span className="message">
        {heading ? <strong>{heading} </strong> : null}
        {localizedErrorLabel(error, t)}
        {error.details ? `\n${error.details}` : ''}
      </span>
      {effective?.kind === 'link' && effective.href && (
        <a className="btn ghost" href={effective.href} target="_blank" rel="noreferrer">
          {effective.label}
        </a>
      )}
      {effective && effective.kind !== 'link' && (
        <button className="btn ghost" type="button" onClick={handleAction}>
          {effective.label}
        </button>
      )}
      {onDismiss && (
        <button className="dismiss" type="button" aria-label={t('error.dismiss')} onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
