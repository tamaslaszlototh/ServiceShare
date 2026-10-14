import { AppError, UpdateStatus } from '@shared/types';
import { Translator } from '@shared/i18n';

export type UpdateView =
  | { kind: 'notice'; text: string }
  | { kind: 'progress'; text: string; percent: number }
  | { kind: 'ready'; text: string; action: string }
  | { kind: 'error'; error: AppError };

/**
 * What the header shows for an update status. Launch checks stay silent unless
 * they find an update; only a manual "Check for updates…" reports the rest.
 */
export function updateView(status: UpdateStatus, t: Translator): UpdateView | null {
  switch (status.state) {
    case 'idle':
      return null;
    case 'checking':
      return status.manual ? { kind: 'notice', text: t('update.checking') } : null;
    case 'upToDate':
      return status.manual ? { kind: 'notice', text: t('update.upToDate', { version: status.version }) } : null;
    case 'unsupported':
      return status.manual ? { kind: 'notice', text: t('update.unsupported') } : null;
    case 'downloading':
      return {
        kind: 'progress',
        text: t('update.downloading', { version: status.version, percent: status.percent }),
        percent: status.percent,
      };
    case 'ready':
      return { kind: 'ready', text: t('update.ready', { version: status.version }), action: t('update.restart') };
    case 'error':
      return status.manual ? { kind: 'error', error: status.error } : null;
  }
}
