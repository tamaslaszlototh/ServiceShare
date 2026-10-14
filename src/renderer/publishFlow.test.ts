import { describe, it, expect, vi } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import { AppError, PublishEvent, PublishRequest, PublishResult } from '@shared/types';
import { PublishIpc, createPublishFlow } from './publishFlow';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFakeIpc(overrides: Partial<PublishIpc> = {}) {
  const progressListeners = new Set<(event: PublishEvent) => void>();
  const ipc: PublishIpc = {
    getAccount: vi.fn(async () => ({ signedIn: false, account: null, canSendEmail: false })),
    signIn: vi.fn(async () => ({ status: 'ok' as const, account: { email: 'me@example.com' } })),
    signOut: vi.fn(async () => ({ status: 'ok' as const })),
    publish: vi.fn(
      async (): Promise<PublishResult> => ({
        status: 'ok',
        videoId: 'vid-1',
        url: 'https://youtu.be/vid-1',
      }),
    ),
    cancelPublish: vi.fn(),
    onPublishProgress: vi.fn((cb: (event: PublishEvent) => void) => {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    }),
    composeCoverPreview: vi.fn(async () => ({ status: 'ok' as const, url: 'blob:cover' })),
    getDefaultLogo: vi.fn(async () => ({ url: null, custom: false })),
    chooseDefaultLogo: vi.fn(async () => ({ status: 'ok' as const, url: 'blob:logo' })),
    clearDefaultLogo: vi.fn(async () => ({ status: 'ok' as const })),
    sendEmail: vi.fn(async () => ({ status: 'ok' as const })),
    copyText: vi.fn(async () => ({ status: 'ok' as const })),
    getPathForFile: vi.fn(() => '/tmp/pic.png'),
    ...overrides,
  };
  const emit = (event: PublishEvent) => {
    for (const listener of progressListeners) listener(event);
  };
  return { ipc, emit };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const signedInIpc = (overrides: Partial<PublishIpc> = {}) =>
  createFakeIpc({
    getAccount: vi.fn(async () => ({
      signedIn: true,
      account: { email: 'me@example.com', channelTitle: 'Studio' },
      canSendEmail: true,
    })),
    ...overrides,
  });

function makeFlow(ipc: PublishIpc, sourceFile = '/audio/My Song.wav') {
  const flow = createPublishFlow({
    ipc,
    translate: () => tFor('en'),
    sourceFile,
    coverDebounceMs: 0,
  });
  flow.start();
  return flow;
}

const publishError = (code: AppError['code']): PublishResult => ({
  status: 'error',
  error: { code, message: code },
});

describe('happy path', () => {
  it('seeds the title from the file and reaches done with the result', async () => {
    const { ipc } = signedInIpc();
    const flow = makeFlow(ipc);
    await flush();

    expect(flow.getState().form.title).toBe('My Song');
    expect(flow.getState().signedIn).toBe(true);

    await flow.publish();

    const state = flow.getState();
    expect(state.phase).toBe('done');
    expect(state.result).toMatchObject({ url: 'https://youtu.be/vid-1' });
    expect(ipc.publish).toHaveBeenCalledWith(
      expect.objectContaining<PublishRequest>({ title: 'My Song', privacyStatus: 'unlisted' }),
    );
  });

  it('finishes from the done progress event before publish resolves', async () => {
    const pending = deferred<PublishResult>();
    const { ipc, emit } = signedInIpc();
    const flow = makeFlow(ipc);
    void (ipc.publish as ReturnType<typeof vi.fn>).mockImplementation(() => pending.promise);
    await flush();

    void flow.publish();
    emit({ stage: 'upload', percent: 42 });
    expect(flow.getState().phase).toBe('publishing');
    expect(flow.getState().stage).toEqual({ stage: 'upload', percent: 42 });

    emit({ stage: 'done', videoId: 'v', url: 'https://youtu.be/v' });
    expect(flow.getState().phase).toBe('done');
    expect(flow.getState().result).toMatchObject({ url: 'https://youtu.be/v' });
  });
});

describe('cancellation', () => {
  it('asks the ipc to cancel and returns to edit on the cancelled event', async () => {
    const pending = deferred<PublishResult>();
    const { ipc, emit } = signedInIpc({
      publish: vi.fn(() => pending.promise),
    });
    const flow = makeFlow(ipc);
    await flush();

    void flow.publish();
    emit({ stage: 'upload', percent: 10 });
    flow.cancel();

    expect(ipc.cancelPublish).toHaveBeenCalledTimes(1);
    expect(flow.getState().cancelling).toBe(true);

    emit({ stage: 'cancelled' });

    const state = flow.getState();
    expect(state.phase).toBe('edit');
    expect(state.notice).toBe('Publish cancelled');
    expect(state.cancelling).toBe(false);
  });

  it('returns to edit when publish itself resolves cancelled', async () => {
    const { ipc } = signedInIpc({ publish: vi.fn(async () => ({ status: 'cancelled' as const })) });
    const flow = makeFlow(ipc);
    await flush();

    await flow.publish();

    expect(flow.getState().phase).toBe('edit');
    expect(flow.getState().notice).toBe('Publish cancelled');
  });
});

describe('failures per stage', () => {
  it('fails the phase and keeps the structured error', async () => {
    const { ipc } = signedInIpc({ publish: vi.fn(async () => publishError('QuotaExceeded')) });
    const flow = makeFlow(ipc);
    await flush();

    await flow.publish();

    expect(flow.getState().phase).toBe('failed');
    expect(flow.getState().error).toMatchObject({ code: 'QuotaExceeded' });
  });

  it('falls back to EngineError when publish rejects', async () => {
    const { ipc } = signedInIpc({ publish: vi.fn(async () => Promise.reject(new Error('boom'))) });
    const flow = makeFlow(ipc);
    await flush();

    await flow.publish();

    expect(flow.getState().phase).toBe('failed');
    expect(flow.getState().error).toMatchObject({ code: 'EngineError', message: 'boom' });
  });

  it('clears the account when auth is revoked', async () => {
    const { ipc } = signedInIpc({ publish: vi.fn(async () => publishError('AuthRevoked')) });
    const flow = makeFlow(ipc);
    await flush();

    await flow.publish();

    expect(flow.getState().signedIn).toBe(false);
    expect(flow.getState().account).toBeNull();
  });
});

describe('email step', () => {
  async function doneFlow(overrides: Partial<PublishIpc> = {}) {
    const fake = signedInIpc(overrides);
    const flow = makeFlow(fake.ipc);
    await flush();
    await flow.publish();
    return { flow, ...fake };
  }

  it('pre-fills the defaults and sends validated recipients', async () => {
    const { flow, ipc } = await doneFlow();

    flow.toggleEmail();

    let state = flow.getState();
    expect(state.emailOpen).toBe(true);
    expect(state.emailSubject).toBe('My Song');
    expect(state.emailBody).toContain('https://youtu.be/vid-1');

    flow.setEmailTo('a@b.co, c@d.co');
    await flow.sendEmail();

    expect(ipc.sendEmail).toHaveBeenCalledWith({
      to: ['a@b.co', 'c@d.co'],
      subject: 'My Song',
      body: expect.stringContaining('https://youtu.be/vid-1'),
    });
    state = flow.getState();
    expect(state.emailSent).toBe(true);
    expect(state.emailSending).toBe(false);
  });

  it('rejects malformed recipients before calling the ipc', async () => {
    const { flow, ipc } = await doneFlow();

    flow.toggleEmail();
    flow.setEmailTo('not-an-address');
    await flow.sendEmail();

    expect(ipc.sendEmail).not.toHaveBeenCalled();
    expect(flow.getState().emailError).toMatchObject({ code: 'InvalidRecipient' });
  });

  it('surfaces a send failure and clears the account on revoked auth', async () => {
    const { flow } = await doneFlow({
      sendEmail: vi.fn(async () => ({
        status: 'error' as const,
        error: { code: 'AuthRevoked' as const, message: 'nope' },
      })),
    });

    flow.toggleEmail();
    flow.setEmailTo('a@b.co');
    await flow.sendEmail();

    expect(flow.getState().emailError).toMatchObject({ code: 'AuthRevoked' });
    expect(flow.getState().signedIn).toBe(false);
    expect(flow.getState().hasEmailScope).toBe(false);
  });
});

describe('account and cover side effects', () => {
  it('signs in, refreshes the email scope and clears the errors', async () => {
    const { ipc } = createFakeIpc({
      getAccount: vi
        .fn()
        .mockResolvedValueOnce({ signedIn: false, account: null, canSendEmail: false })
        .mockResolvedValueOnce({ signedIn: true, account: { email: 'me@example.com' }, canSendEmail: true }),
    });
    const flow = makeFlow(ipc);
    await flush();

    await flow.signIn();

    const state = flow.getState();
    expect(state.signedIn).toBe(true);
    expect(state.hasEmailScope).toBe(true);
    expect(state.signingIn).toBe(false);
    expect(ipc.signIn).toHaveBeenCalledTimes(1);
  });

  it('recomposes the cover preview when the title changes', async () => {
    const { ipc } = createFakeIpc();
    const flow = makeFlow(ipc);
    await flush();
    (ipc.composeCoverPreview as ReturnType<typeof vi.fn>).mockClear();

    flow.setForm({ title: 'New name' });
    await flush();

    expect(ipc.composeCoverPreview).toHaveBeenCalledWith({ title: 'New name', coverImagePath: undefined });
  });

  it('resolves a picked cover file to a path through the ipc', async () => {
    const { ipc } = createFakeIpc();
    const flow = makeFlow(ipc);
    await flush();

    flow.setCoverFile({} as File);

    expect(ipc.getPathForFile).toHaveBeenCalled();
    expect(flow.getState().form.coverImagePath).toBe('/tmp/pic.png');
  });

  it('stops handling progress events after dispose', async () => {
    const { ipc, emit } = signedInIpc();
    const flow = makeFlow(ipc);
    await flush();

    flow.dispose();
    emit({ stage: 'done', videoId: 'v', url: 'https://youtu.be/v' });

    expect(flow.getState().phase).toBe('edit');
  });
});
