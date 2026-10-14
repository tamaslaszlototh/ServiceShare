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

const IGNORED_ERROR_MESSAGES = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
];

function isIgnoredError(error: unknown, message: unknown): boolean {
  const text = typeof message === 'string' ? message : error instanceof Error ? error.message : error;
  return (
    typeof text === 'string' && IGNORED_ERROR_MESSAGES.some((ignored) => text.includes(ignored))
  );
}

export function installGlobalErrorHandlers(target: GlobalErrorTarget, bus: ErrorBus): void {
  const report = (error: unknown, message?: unknown) => {
    if (isIgnoredError(error, message)) {
      return;
    }
    bus.report(error ?? message ?? 'An unexpected error occurred');
  };
  target.addEventListener('error', (event) => {
    const { error, message } = (event ?? {}) as ErrorEventLike;
    report(error, message);
  });
  target.addEventListener('unhandledrejection', (event) => {
    const { reason, message } = (event ?? {}) as ErrorEventLike;
    report(reason, message);
  });
}
