import { AppError } from '@shared/types';
import { ErrorAction, errorAction } from './errors';

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

function bodyText(error: AppError): string {
  const prefix = `${error.code}: `;
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message;
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
  const effective = action === undefined ? errorAction(error.code) : action;

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
        <span className="code">{error.code}</span> {bodyText(error)}
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
        <button className="dismiss" type="button" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
