import { describe, it, expect, vi } from 'vitest';
import { createErrorBus, installGlobalErrorHandlers, GlobalErrorTarget } from './globalErrors';

describe('createErrorBus', () => {
  it('normalizes and delivers errors to subscribers', () => {
    const bus = createErrorBus();
    const seen: unknown[] = [];
    bus.subscribe((error) => seen.push(error));

    const result = bus.report(new Error('boom'), 'RenderError');

    expect(result).toEqual({ code: 'RenderError', message: 'boom' });
    expect(seen).toEqual([{ code: 'RenderError', message: 'boom' }]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createErrorBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.report('later');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('installGlobalErrorHandlers', () => {
  function fakeTarget(): { target: GlobalErrorTarget; fire: (type: string, event: unknown) => void } {
    const handlers = new Map<string, ((event: unknown) => void)[]>();
    return {
      target: {
        addEventListener(type, listener) {
          handlers.set(type, [...(handlers.get(type) ?? []), listener]);
        },
      },
      fire(type, event) {
        for (const handler of handlers.get(type) ?? []) handler(event);
      },
    };
  }

  it('reports window errors and unhandled rejections', () => {
    const bus = createErrorBus();
    const error = vi.fn();
    bus.subscribe(error);
    const { target, fire } = fakeTarget();

    installGlobalErrorHandlers(target, bus);
    fire('error', { error: new Error('kaboom') });
    fire('unhandledrejection', { reason: 'nope' });

    expect(error).toHaveBeenCalledWith({ code: 'EngineError', message: 'kaboom' });
    expect(error).toHaveBeenCalledWith({ code: 'EngineError', message: 'nope' });
  });
});
