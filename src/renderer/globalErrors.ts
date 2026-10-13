import { AppError, ErrorCode } from '@shared/types';
import { normalizeError } from '@shared/apperror';

export type ErrorListener = (error: AppError) => void;

export interface ErrorBus {
  report(error: unknown, fallbackCode?: ErrorCode): AppError;
  subscribe(listener: ErrorListener): () => void;
}

export function createErrorBus(): ErrorBus {
  const listeners = new Set<ErrorListener>();
  return {
    report(error, fallbackCode) {
      const appError = normalizeError(error, fallbackCode);
      for (const listener of listeners) {
        listener(appError);
      }
      return appError;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface GlobalErrorTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

interface ErrorEventLike {
  error?: unknown;
  reason?: unknown;
  message?: unknown;
}

export function installGlobalErrorHandlers(target: GlobalErrorTarget, bus: ErrorBus): void {
  target.addEventListener('error', (event) => {
    const { error, message } = (event ?? {}) as ErrorEventLike;
    bus.report(error ?? message ?? 'An unexpected error occurred');
  });
  target.addEventListener('unhandledrejection', (event) => {
    const { reason } = (event ?? {}) as ErrorEventLike;
    bus.report(reason ?? 'An unexpected error occurred');
  });
}
