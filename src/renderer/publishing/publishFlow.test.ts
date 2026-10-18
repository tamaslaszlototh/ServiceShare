import { describe, it, expect, vi } from 'vitest';
import { Locale, TranslationKey, TranslationParams, t as translate } from '@shared/i18n';
import { AppError, EmailRecipientsResult, PublishEvent, PublishRequest, PublishResult } from '@shared/types';
import {
  PublishFlowOptions,
  PublishIpc,
  PublishedVideo,
  createPublishFlow,
  emailRecipients,
} from './publishFlow';

const tFor = (locale: Locale) => (key: TranslationKey, params?: TranslationParams) =>
  translate(locale, key, params);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const recipientsOk = (recipients: string[]): EmailRecipientsResult => ({ status: 'ok', recipients });

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
    getDefaultBase: vi.fn(async () => ({ url: 'data:bundled-base', custom: false })),
    chooseDefaultBase: vi.fn(async () => ({ status: 'ok' as const, url: 'data:my-base' })),
    clearDefaultBase: vi.fn(async () => ({ status: 'ok' as const })),
    sendEmail: vi.fn(async () => ({ status: 'ok' as const })),
    getEmailRecipients: vi.fn(async () => recipientsOk([])),
    rememberEmailRecipient: vi.fn(async (address: string) => recipientsOk([address.trim()])),
    forgetEmailRecipient: vi.fn(async () => recipientsOk([])),
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

function makeFlow(
  ipc: PublishIpc,
  sourceFile = '/audio/My Song.wav',
  options: Pick<PublishFlowOptions, 'publishedVideo' | 'onPublishedVideo'> = {},
) {
  const flow = createPublishFlow({
    ipc,
    translate: () => tFor('en'),
    sourceFile,
    coverDebounceMs: 0,
    ...options,
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

describe('saved recipients', () => {
  async function doneFlow(saved: string[], overrides: Partial<PublishIpc> = {}) {
    let list = [...saved];
    const fake = signedInIpc({
      getEmailRecipients: vi.fn(async () => recipientsOk([...list])),
      rememberEmailRecipient: vi.fn(async (address: string) => {
        if (!list.some((entry) => entry.toLowerCase() === address.trim().toLowerCase())) {
          list = [...list, address.trim()];
        }
        return recipientsOk([...list]);
      }),
      forgetEmailRecipient: vi.fn(async (address: string) => {
        list = list.filter((entry) => entry.toLowerCase() !== address.toLowerCase());
        return recipientsOk([...list]);
      }),
      ...overrides,
    });
    const flow = makeFlow(fake.ipc);
    await flush();
    await flow.publish();
    return { flow, ...fake };
  }

  it('reads the saved list when the panel opens and pre-checks every entry', async () => {
    const { flow, ipc } = await doneFlow(['a@b.co', 'c@d.co']);

    flow.toggleEmail();
    await flush();

    expect(ipc.getEmailRecipients).toHaveBeenCalledTimes(1);
    const state = flow.getState();
    expect(state.savedRecipients).toEqual(['a@b.co', 'c@d.co']);
    expect(emailRecipients(state)).toEqual(['a@b.co', 'c@d.co']);
  });

  it('sends to the checked saved recipients alone, in one click', async () => {
    const { flow, ipc } = await doneFlow(['a@b.co', 'c@d.co']);
    flow.toggleEmail();
    await flush();

    await flow.sendEmail();

    expect(ipc.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['a@b.co', 'c@d.co'] }));
  });

  it('excludes an unchecked saved recipient from this send without forgetting it', async () => {
    const { flow, ipc } = await doneFlow(['a@b.co', 'c@d.co']);
    flow.toggleEmail();
    await flush();

    flow.toggleSavedRecipient('a@b.co');
    flow.setEmailTo('x@y.co, C@D.CO');
    await flow.sendEmail();

    expect(ipc.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['c@d.co', 'x@y.co'] }));
    expect(ipc.forgetEmailRecipient).not.toHaveBeenCalled();
    expect(flow.getState().savedRecipients).toEqual(['a@b.co', 'c@d.co']);
  });

  it('re-checks an unchecked recipient on a second toggle and resets checks when reopened', async () => {
    const { flow } = await doneFlow(['a@b.co']);
    flow.toggleEmail();
    await flush();

    flow.toggleSavedRecipient('a@b.co');
    expect(emailRecipients(flow.getState())).toEqual([]);
    flow.toggleSavedRecipient('a@b.co');
    expect(emailRecipients(flow.getState())).toEqual(['a@b.co']);

    flow.toggleSavedRecipient('a@b.co');
    flow.toggleEmail();
    flow.toggleEmail();
    await flush();
    expect(emailRecipients(flow.getState())).toEqual(['a@b.co']);
  });

  it('adds and remembers the typed addresses, checks them and clears the input', async () => {
    const { flow, ipc } = await doneFlow(['a@b.co']);
    flow.toggleEmail();
    await flush();

    flow.setEmailTo(' x@y.co , z@w.co');
    await flow.rememberRecipients();

    expect(ipc.rememberEmailRecipient).toHaveBeenNthCalledWith(1, 'x@y.co');
    expect(ipc.rememberEmailRecipient).toHaveBeenNthCalledWith(2, 'z@w.co');
    const state = flow.getState();
    expect(state.savedRecipients).toEqual(['a@b.co', 'x@y.co', 'z@w.co']);
    expect(state.emailTo).toBe('');
    expect(emailRecipients(state)).toEqual(['a@b.co', 'x@y.co', 'z@w.co']);
  });

  it('refuses to remember an invalid address and keeps the input', async () => {
    const { flow, ipc } = await doneFlow([]);
    flow.toggleEmail();
    await flush();

    flow.setEmailTo('x@y.co, nope');
    await flow.rememberRecipients();

    expect(ipc.rememberEmailRecipient).not.toHaveBeenCalled();
    expect(flow.getState().emailError).toMatchObject({ code: 'InvalidRecipient' });
    expect(flow.getState().emailTo).toBe('x@y.co, nope');
  });

  it('re-checks a remembered address that was unchecked', async () => {
    const { flow } = await doneFlow(['a@b.co']);
    flow.toggleEmail();
    await flush();

    flow.toggleSavedRecipient('a@b.co');
    flow.setEmailTo('A@B.CO');
    await flow.rememberRecipients();

    expect(emailRecipients(flow.getState())).toEqual(['a@b.co']);
  });

  it('forgets a saved address permanently', async () => {
    const { flow, ipc } = await doneFlow(['a@b.co', 'c@d.co']);
    flow.toggleEmail();
    await flush();

    await flow.forgetRecipient('a@b.co');

    expect(ipc.forgetEmailRecipient).toHaveBeenCalledWith('a@b.co');
    expect(flow.getState().savedRecipients).toEqual(['c@d.co']);
    expect(emailRecipients(flow.getState())).toEqual(['c@d.co']);
  });

  it('surfaces a failure to save the list', async () => {
    const { flow } = await doneFlow([], {
      rememberEmailRecipient: vi.fn(async () => ({
        status: 'error' as const,
        error: { code: 'DiskFull' as const, message: 'disk full' },
      })),
    });
    flow.toggleEmail();
    await flush();

    flow.setEmailTo('x@y.co');
    await flow.rememberRecipients();

    expect(flow.getState().emailError).toMatchObject({ code: 'DiskFull' });
    expect(flow.getState().emailTo).toBe('x@y.co');
  });

  it('shows the addresses already saved when a later one fails', async () => {
    const remember = vi
      .fn()
      .mockResolvedValueOnce(recipientsOk(['x@y.co']))
      .mockResolvedValueOnce({ status: 'error', error: { code: 'DiskFull', message: 'disk full' } });
    const { flow } = await doneFlow([], { rememberEmailRecipient: remember });
    flow.toggleEmail();
    await flush();

    flow.setEmailTo('x@y.co, z@w.co');
    await flow.rememberRecipients();

    const state = flow.getState();
    expect(state.savedRecipients).toEqual(['x@y.co']);
    expect(state.emailError).toMatchObject({ code: 'DiskFull' });
    expect(state.emailTo).toBe('x@y.co, z@w.co');
  });

  it('surfaces a failure to forget an address and keeps the list', async () => {
    const { flow } = await doneFlow(['a@b.co'], {
      forgetEmailRecipient: vi.fn(async () => {
        throw new Error('ipc gone');
      }),
    });
    flow.toggleEmail();
    await flush();

    await flow.forgetRecipient('a@b.co');

    expect(flow.getState().savedRecipients).toEqual(['a@b.co']);
    expect(flow.getState().emailError).toMatchObject({ code: 'InternalError' });
  });

  it('does not let a slow initial read overwrite a newer change', async () => {
    const read = deferred<EmailRecipientsResult>();
    const { flow } = await doneFlow([], { getEmailRecipients: vi.fn(() => read.promise) });
    flow.toggleEmail();

    flow.setEmailTo('x@y.co');
    await flow.rememberRecipients();
    read.resolve(recipientsOk([]));
    await flush();

    expect(flow.getState().savedRecipients).toEqual(['x@y.co']);
  });

  it('opens with an empty checklist when the saved list cannot be read', async () => {
    const { flow } = await doneFlow([], {
      getEmailRecipients: vi.fn(async () => ({
        status: 'error' as const,
        error: { code: 'InternalError' as const, message: 'nope' },
      })),
    });

    flow.toggleEmail();
    await flush();

    expect(flow.getState().savedRecipients).toEqual([]);
    expect(flow.getState().emailError).toBeNull();
  });
});

describe('published video', () => {
  async function publishedFlow(saved: string[] = []) {
    const onPublishedVideo = vi.fn<(video: PublishedVideo) => void>();
    const fake = signedInIpc({ getEmailRecipients: vi.fn(async () => recipientsOk([...saved])) });
    const flow = makeFlow(fake.ipc, '/audio/My Song.wav', { onPublishedVideo });
    await flush();
    await flow.publish();
    return { flow, onPublishedVideo, ...fake };
  }

  it('remembers the video once a publish succeeds', async () => {
    const { onPublishedVideo } = await publishedFlow();

    expect(onPublishedVideo).toHaveBeenCalledTimes(1);
    expect(onPublishedVideo.mock.lastCall?.[0]).toEqual<PublishedVideo>({
      videoId: 'vid-1',
      url: 'https://youtu.be/vid-1',
      title: 'My Song',
      privacyStatus: 'unlisted',
      emailSubject: null,
      emailBody: null,
      sentTo: [],
    });
  });

  it('records who got the link and the message used, then unchecks them for the next send', async () => {
    const { flow, onPublishedVideo } = await publishedFlow(['a@b.co', 'c@d.co']);
    flow.toggleEmail();
    await flush();

    flow.toggleSavedRecipient('c@d.co');
    flow.setEmailSubject('New mix');
    flow.setEmailTo('x@y.co');
    await flow.sendEmail();

    expect(onPublishedVideo.mock.lastCall?.[0]).toMatchObject<Partial<PublishedVideo>>({
      emailSubject: 'New mix',
      emailBody: expect.stringContaining('https://youtu.be/vid-1'),
      sentTo: ['a@b.co', 'x@y.co'],
    });
    const state = flow.getState();
    expect(state.emailTo).toBe('');
    // c@d.co was left out on purpose, so it stays unchecked too
    expect(emailRecipients(state)).toEqual([]);
  });

  it('adds a later send to the earlier recipients', async () => {
    const { flow, ipc, onPublishedVideo } = await publishedFlow(['a@b.co', 'c@d.co']);
    flow.toggleEmail();
    await flush();
    flow.toggleSavedRecipient('c@d.co');
    await flow.sendEmail();

    flow.toggleSavedRecipient('c@d.co');
    await flow.sendEmail();

    expect(ipc.sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: ['c@d.co'] }));

    expect(onPublishedVideo.mock.lastCall?.[0].sentTo).toEqual(['a@b.co', 'c@d.co']);
  });

  it('does not record recipients when the send fails', async () => {
    const onPublishedVideo = vi.fn<(video: PublishedVideo) => void>();
    const { ipc } = signedInIpc({
      sendEmail: vi.fn(async () => ({
        status: 'error' as const,
        error: { code: 'EmailSendError' as const, message: 'nope' },
      })),
    });
    const flow = makeFlow(ipc, '/audio/My Song.wav', { onPublishedVideo });
    await flush();
    await flow.publish();
    flow.toggleEmail();
    flow.setEmailTo('a@b.co');
    await flow.sendEmail();

    expect(onPublishedVideo).toHaveBeenCalledTimes(1);
    expect(flow.getState().emailTo).toBe('a@b.co');
  });

  const earlierVideo: PublishedVideo = {
    videoId: 'vid-0',
    url: 'https://youtu.be/vid-0',
    title: 'Sunday Service',
    privacyStatus: 'private',
    emailSubject: 'Listen',
    emailBody: 'Here it is: https://youtu.be/vid-0',
    sentTo: ['A@B.co', 'x@y.co'],
  };

  it('reopens an earlier video on the done screen with its email ready to send again', async () => {
    const { ipc } = signedInIpc({ getEmailRecipients: vi.fn(async () => recipientsOk(['a@b.co', 'c@d.co'])) });
    const flow = makeFlow(ipc, '/audio/Other.wav', { publishedVideo: earlierVideo });
    await flush();

    const state = flow.getState();
    expect(state.phase).toBe('done');
    expect(state.result).toMatchObject({ videoId: 'vid-0', url: 'https://youtu.be/vid-0' });
    expect(state.form).toMatchObject({ title: 'Sunday Service', privacyStatus: 'private' });
    expect(state.emailOpen).toBe(true);
    expect(state.emailSubject).toBe('Listen');
    expect(state.emailBody).toBe('Here it is: https://youtu.be/vid-0');
    expect(state.emailTo).toBe('');
    expect(state.sentTo).toEqual(['A@B.co', 'x@y.co']);
    expect(emailRecipients(state)).toEqual(['c@d.co']);
    expect(ipc.composeCoverPreview).not.toHaveBeenCalled();
  });

  it('falls back to the default message for a video never emailed', async () => {
    const { ipc } = signedInIpc();
    const flow = makeFlow(ipc, '/audio/Other.wav', {
      publishedVideo: { ...earlierVideo, emailSubject: null, emailBody: null, sentTo: [] },
    });
    await flush();

    expect(flow.getState().emailSubject).toBe('Sunday Service');
    expect(flow.getState().emailBody).toContain('https://youtu.be/vid-0');
  });

  it('keeps the earlier recipients when the reopened video is emailed again', async () => {
    const onPublishedVideo = vi.fn<(video: PublishedVideo) => void>();
    const { ipc } = signedInIpc();
    const flow = makeFlow(ipc, '/audio/Other.wav', { publishedVideo: earlierVideo, onPublishedVideo });
    await flush();

    flow.setEmailTo('forgot@me.co');
    await flow.sendEmail();

    expect(ipc.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['forgot@me.co'] }));
    expect(onPublishedVideo.mock.lastCall?.[0]).toEqual({
      ...earlierVideo,
      sentTo: ['A@B.co', 'x@y.co', 'forgot@me.co'],
    });
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

  it('loads the default cover and recomposes the preview when a new one is chosen', async () => {
    const { ipc } = createFakeIpc();
    const flow = makeFlow(ipc);
    await flush();
    expect(flow.getState()).toMatchObject({ baseUrl: 'data:bundled-base', baseCustom: false });
    (ipc.composeCoverPreview as ReturnType<typeof vi.fn>).mockClear();

    await flow.chooseBase();
    await flush();

    expect(flow.getState()).toMatchObject({ baseUrl: 'data:my-base', baseCustom: true });
    expect(ipc.composeCoverPreview).toHaveBeenCalledTimes(1);
  });

  it('reloads the bundled default cover after a reset', async () => {
    const getDefaultBase = vi
      .fn()
      .mockResolvedValueOnce({ url: 'data:my-base', custom: true })
      .mockResolvedValueOnce({ url: 'data:bundled-base', custom: false });
    const { ipc } = createFakeIpc({ getDefaultBase });
    const flow = makeFlow(ipc);
    await flush();
    (ipc.composeCoverPreview as ReturnType<typeof vi.fn>).mockClear();

    await flow.clearBase();
    await flush();

    expect(ipc.clearDefaultBase).toHaveBeenCalledTimes(1);
    expect(flow.getState()).toMatchObject({ baseUrl: 'data:bundled-base', baseCustom: false });
    expect(ipc.composeCoverPreview).toHaveBeenCalledTimes(1);
  });

  it('keeps the current default cover when choosing is cancelled or fails', async () => {
    const chooseDefaultBase = vi
      .fn()
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockResolvedValueOnce({ status: 'error', error: { code: 'RenderError', message: 'bad image' } });
    const { ipc } = createFakeIpc({ chooseDefaultBase });
    const flow = makeFlow(ipc);
    await flush();

    await flow.chooseBase();
    expect(flow.getState()).toMatchObject({ baseUrl: 'data:bundled-base', error: null });

    await flow.chooseBase();
    expect(flow.getState().baseUrl).toBe('data:bundled-base');
    expect(flow.getState().error?.code).toBe('RenderError');
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
