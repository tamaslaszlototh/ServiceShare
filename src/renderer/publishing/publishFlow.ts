import { Translator } from '@shared/i18n';
import { normalizeError } from '@shared/apperror';
import { classifyRecipients, normalizeRecipients, parseRecipients, recipientKey } from '@shared/recipients';
import {
  AccountInfo,
  AccountState,
  AppError,
  AuthResult,
  CoverPreviewRequest,
  CoverPreviewResult,
  DefaultImage,
  EmailRecipientsResult,
  EmailSendRequest,
  EmailSendResult,
  ImageResult,
  PrivacyStatus,
  PublishEvent,
  PublishRequest,
  PublishResult,
  VoidResult,
} from '@shared/types';
import {
  PublishForm,
  canPublish,
  defaultTitle,
  toPublishRequest,
} from './publish';
import {
  canSendEmail,
  defaultEmailBody,
  defaultEmailSubject,
  recipientValidationError,
} from './email';

export const COVER_DEBOUNCE_MS = 200;
const COPY_RESET_MS = 1500;

export type PublishPhase = 'edit' | 'publishing' | 'done' | 'failed';

export type PublishSuccess = Extract<PublishResult, { status: 'ok' }>;

/**
 * What outlives the publish dialog: enough to reopen the done screen and email
 * the link again, without re-sending to whoever already got it.
 */
export interface PublishedVideo {
  videoId: string;
  url: string;
  title: string;
  privacyStatus: PrivacyStatus;
  /** The subject and message last emailed; null until the first send. */
  emailSubject: string | null;
  emailBody: string | null;
  sentTo: string[];
}

export interface PublishFlowState {
  phase: PublishPhase;
  stage: PublishEvent | null;
  result: PublishSuccess | null;
  error: AppError | null;
  notice: string | null;
  copied: boolean;
  cancelling: boolean;
  signedIn: boolean;
  account: AccountInfo | null;
  accountReady: boolean;
  signingIn: boolean;
  hasEmailScope: boolean;
  coverUrl: string | null;
  coverError: AppError | null;
  logoUrl: string | null;
  logoCustom: boolean;
  /** The default base used when no cover image is chosen for this video. */
  baseUrl: string | null;
  baseCustom: boolean;
  emailOpen: boolean;
  emailSubject: string;
  emailBody: string;
  emailTo: string;
  savedRecipients: string[];
  uncheckedRecipients: string[];
  emailSending: boolean;
  emailSent: boolean;
  emailError: AppError | null;
  /** Who already got this video's link, in the order they were sent to. */
  sentTo: string[];
  form: PublishForm;
}

export interface PublishIpc {
  getAccount(): Promise<AccountState>;
  signIn(): Promise<AuthResult>;
  signOut(): Promise<VoidResult>;
  publish(req: PublishRequest): Promise<PublishResult>;
  cancelPublish(): void;
  onPublishProgress(cb: (event: PublishEvent) => void): () => void;
  composeCoverPreview(req: CoverPreviewRequest): Promise<CoverPreviewResult>;
  getDefaultLogo(): Promise<DefaultImage>;
  chooseDefaultLogo(): Promise<ImageResult>;
  clearDefaultLogo(): Promise<VoidResult>;
  getDefaultBase(): Promise<DefaultImage>;
  chooseDefaultBase(): Promise<ImageResult>;
  clearDefaultBase(): Promise<VoidResult>;
  sendEmail(req: EmailSendRequest): Promise<EmailSendResult>;
  getEmailRecipients(): Promise<EmailRecipientsResult>;
  rememberEmailRecipient(address: string): Promise<EmailRecipientsResult>;
  forgetEmailRecipient(address: string): Promise<EmailRecipientsResult>;
  copyText(text: string): Promise<VoidResult>;
  getPathForFile(file: File): string;
}

export interface PublishFlow {
  getState(): PublishFlowState;
  subscribe(listener: () => void): () => void;
  start(): void;
  dispose(): void;
  setForm(patch: Partial<PublishForm>): void;
  setCoverFile(file: File): void;
  setThumbnailFile(file: File): void;
  setEmailSubject(value: string): void;
  setEmailTo(value: string): void;
  setEmailBody(value: string): void;
  toggleSavedRecipient(address: string): void;
  rememberRecipients(): Promise<void>;
  forgetRecipient(address: string): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  chooseLogo(): Promise<void>;
  clearLogo(): Promise<void>;
  chooseBase(): Promise<void>;
  clearBase(): Promise<void>;
  publish(): Promise<void>;
  cancel(): void;
  copyLink(url: string): Promise<void>;
  toggleEmail(): void;
  sendEmail(): Promise<void>;
  dismissError(): void;
  dismissEmailError(): void;
}

export interface PublishFlowOptions {
  ipc: PublishIpc;
  translate: () => Translator;
  sourceFile: string;
  coverDebounceMs?: number;
  /** Reopens the done screen of an earlier publish with its email panel open. */
  publishedVideo?: PublishedVideo | null;
  onPublishedVideo?: (video: PublishedVideo) => void;
}

export function isRecipientChecked(state: PublishFlowState, address: string): boolean {
  return !state.uncheckedRecipients.includes(recipientKey(address));
}

export function wasSentTo(state: PublishFlowState, address: string): boolean {
  return state.sentTo.some((sent) => recipientKey(sent) === recipientKey(address));
}

/**
 * The recipients of the current send: the checked saved addresses followed by
 * the ad-hoc ones typed into the To field, de-duplicated.
 */
export function emailRecipients(state: PublishFlowState): string[] {
  const checked = state.savedRecipients.filter((address) => isRecipientChecked(state, address));
  return normalizeRecipients([...checked, ...parseRecipients(state.emailTo)]);
}

export function createPublishFlow({
  ipc,
  translate,
  sourceFile,
  coverDebounceMs = COVER_DEBOUNCE_MS,
  publishedVideo: reopened = null,
  onPublishedVideo,
}: PublishFlowOptions): PublishFlow {
  let state: PublishFlowState = {
    phase: reopened ? 'done' : 'edit',
    stage: null,
    result: reopened ? { status: 'ok', videoId: reopened.videoId, url: reopened.url } : null,
    error: null,
    notice: null,
    copied: false,
    cancelling: false,
    signedIn: false,
    account: null,
    accountReady: false,
    signingIn: false,
    hasEmailScope: false,
    coverUrl: null,
    coverError: null,
    logoUrl: null,
    logoCustom: false,
    baseUrl: null,
    baseCustom: false,
    emailOpen: false,
    emailSubject: '',
    emailBody: '',
    emailTo: '',
    savedRecipients: [],
    uncheckedRecipients: [],
    emailSending: false,
    emailSent: false,
    emailError: null,
    sentTo: reopened?.sentTo ?? [],
    form: {
      title: reopened?.title ?? defaultTitle(sourceFile),
      description: '',
      tags: '',
      privacyStatus: reopened?.privacyStatus ?? 'unlisted',
      coverImagePath: null,
      thumbnailPath: null,
    },
  };

  const listeners = new Set<() => void>();
  let unsubscribeProgress: (() => void) | null = null;
  let coverTimer: ReturnType<typeof setTimeout> | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let coverRequest = 0;
  let started = false;
  let recipientsVersion = 0;

  function update(patch: Partial<PublishFlowState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function refreshAccount(): Promise<void> {
    try {
      const account = await ipc.getAccount();
      update({ signedIn: account.signedIn, account: account.account ?? null, hasEmailScope: account.canSendEmail });
    } catch {
      update({ signedIn: false });
    } finally {
      update({ accountReady: true });
    }
  }

  async function loadLogo(): Promise<void> {
    try {
      const logo = await ipc.getDefaultLogo();
      update({ logoUrl: logo.url, logoCustom: logo.custom });
    } catch {
      // the logo preview simply stays empty
    }
  }

  async function loadBase(): Promise<void> {
    try {
      const base = await ipc.getDefaultBase();
      update({ baseUrl: base.url, baseCustom: base.custom });
    } catch {
      // the default cover thumbnail simply stays empty
    }
  }

  async function loadSavedRecipients(): Promise<void> {
    const version = recipientsVersion;
    try {
      const loaded = await ipc.getEmailRecipients();
      // a remember/forget that finished meanwhile already holds a newer list
      if (loaded.status === 'ok' && version === recipientsVersion) {
        update({ savedRecipients: loaded.recipients });
      }
    } catch {
      // the checklist simply stays empty; ad-hoc addresses still work
    }
  }

  function applySavedRecipients(recipients: string[], checked: string[]): void {
    recipientsVersion += 1;
    const keys = new Set(checked.map(recipientKey));
    update({
      savedRecipients: recipients,
      uncheckedRecipients: state.uncheckedRecipients.filter((key) => !keys.has(key)),
    });
  }

  async function composeCoverPreview(): Promise<void> {
    const request = (coverRequest += 1);
    const { form } = state;
    try {
      const preview = await ipc.composeCoverPreview({
        title: form.title.trim() || ' ',
        coverImagePath: form.coverImagePath ?? undefined,
      });
      if (request !== coverRequest) return;
      if (preview.status === 'ok') {
        update({ coverUrl: preview.url, coverError: null });
      } else {
        update({ coverError: preview.error });
      }
    } catch {
      if (request !== coverRequest) return;
      update({ coverError: { code: 'RenderError', message: translate()('publish.coverError') } });
    }
  }

  function scheduleCoverPreview(): void {
    if (coverTimer) clearTimeout(coverTimer);
    coverTimer = setTimeout(() => {
      coverTimer = null;
      void composeCoverPreview();
    }, coverDebounceMs);
  }

  let latestVideo: PublishedVideo | null = reopened;

  function rememberPublishedVideo(video: PublishedVideo): void {
    latestVideo = video;
    onPublishedVideo?.(video);
  }

  function finishPublish(result: PublishSuccess): void {
    update({ result, phase: 'done', cancelling: false });
    // the done event and the resolved publish both report the same video
    if (latestVideo?.videoId === result.videoId) return;
    rememberPublishedVideo({
      videoId: result.videoId,
      url: result.url,
      title: state.form.title.trim(),
      privacyStatus: state.form.privacyStatus,
      emailSubject: null,
      emailBody: null,
      sentTo: [],
    });
  }

  function onProgress(event: PublishEvent): void {
    if ('kind' in event) return;
    update({ stage: event });
    if (event.stage === 'done') {
      finishPublish({ status: 'ok', videoId: event.videoId, url: event.url, warning: event.warning });
    } else if (event.stage === 'cancelled') {
      update({ notice: translate()('publish.cancelled'), phase: 'edit', cancelling: false });
    }
  }

  function openEmail(): void {
    const { result, form } = state;
    if (!result) return;
    update({
      emailSubject: latestVideo?.emailSubject ?? defaultEmailSubject(form.title),
      emailBody: latestVideo?.emailBody ?? defaultEmailBody(result.url, translate()),
      emailTo: '',
      // whoever already got the link starts unchecked, so a resend reaches only the rest
      uncheckedRecipients: state.sentTo.map(recipientKey),
      emailSent: false,
      emailError: null,
      emailOpen: true,
    });
    void loadSavedRecipients();
  }

  function setForm(patch: Partial<PublishForm>): void {
    update({ form: { ...state.form, ...patch } });
    if ('title' in patch || 'coverImagePath' in patch) scheduleCoverPreview();
  }

  return {
    getState: () => state,
    subscribe,

    start() {
      if (started) return;
      started = true;
      unsubscribeProgress = ipc.onPublishProgress(onProgress);
      void refreshAccount();
      if (reopened) {
        openEmail();
        return;
      }
      void loadLogo();
      void loadBase();
      scheduleCoverPreview();
    },

    dispose() {
      if (!started) return;
      started = false;
      unsubscribeProgress?.();
      unsubscribeProgress = null;
      if (coverTimer) {
        clearTimeout(coverTimer);
        coverTimer = null;
      }
      if (copyTimer) {
        clearTimeout(copyTimer);
        copyTimer = null;
      }
    },

    setForm,
    setCoverFile(file) {
      setForm({ coverImagePath: ipc.getPathForFile(file) });
    },
    setThumbnailFile(file) {
      setForm({ thumbnailPath: ipc.getPathForFile(file) });
    },
    setEmailSubject(value) {
      update({ emailSubject: value });
    },
    setEmailTo(value) {
      update({ emailTo: value });
    },
    setEmailBody(value) {
      update({ emailBody: value });
    },
    toggleSavedRecipient(address) {
      const key = recipientKey(address);
      const unchecked = state.uncheckedRecipients;
      update({
        uncheckedRecipients: unchecked.includes(key)
          ? unchecked.filter((entry) => entry !== key)
          : [...unchecked, key],
      });
    },

    async rememberRecipients() {
      const typed = parseRecipients(state.emailTo);
      const validationError = recipientValidationError(typed);
      if (validationError) {
        update({ emailSent: false, emailError: validationError });
        return;
      }
      update({ emailError: null });
      // remember one at a time, showing each saved address even if a later one fails
      for (const address of classifyRecipients(typed).valid) {
        try {
          const saved = await ipc.rememberEmailRecipient(address);
          if (saved.status === 'error') {
            update({ emailError: saved.error });
            return;
          }
          applySavedRecipients(saved.recipients, [address]);
        } catch (e) {
          update({ emailError: normalizeError(e, 'InternalError') });
          return;
        }
      }
      update({ emailTo: '' });
    },

    async forgetRecipient(address) {
      try {
        const saved = await ipc.forgetEmailRecipient(address);
        if (saved.status === 'error') {
          update({ emailError: saved.error });
          return;
        }
        applySavedRecipients(saved.recipients, [address]);
      } catch (e) {
        update({ emailError: normalizeError(e, 'InternalError') });
      }
    },

    async signIn() {
      update({ signingIn: true, error: null });
      try {
        const auth = await ipc.signIn();
        if (auth.status === 'error') {
          update({ error: auth.error, emailError: auth.error });
          return;
        }
        update({ signedIn: true, account: auth.account });
        const account = await ipc.getAccount().catch(() => null);
        if (account) update({ hasEmailScope: account.canSendEmail });
        update({ emailError: null });
      } catch (e) {
        const failure = normalizeError(e, 'AuthRevoked');
        update({ error: failure, emailError: failure });
      } finally {
        update({ signingIn: false });
      }
    },

    async signOut() {
      try {
        const result = await ipc.signOut();
        if (result.status === 'error') {
          update({ error: result.error });
          return;
        }
        update({ signedIn: false, account: null });
      } catch (e) {
        update({ error: normalizeError(e, 'AuthRevoked') });
      }
    },

    async chooseLogo() {
      update({ error: null });
      try {
        const result = await ipc.chooseDefaultLogo();
        if (result.status === 'cancelled') return;
        if (result.status === 'error') {
          update({ error: result.error });
          return;
        }
        update({ logoUrl: result.url, logoCustom: true });
        scheduleCoverPreview();
      } catch (e) {
        update({ error: normalizeError(e, 'RenderError') });
      }
    },

    async clearLogo() {
      update({ error: null });
      try {
        const result = await ipc.clearDefaultLogo();
        if (result.status === 'error') {
          update({ error: result.error });
          return;
        }
        const logo = await ipc.getDefaultLogo();
        update({ logoUrl: logo.url, logoCustom: logo.custom });
        scheduleCoverPreview();
      } catch (e) {
        update({ error: normalizeError(e, 'RenderError') });
      }
    },

    async chooseBase() {
      update({ error: null });
      try {
        const result = await ipc.chooseDefaultBase();
        if (result.status === 'cancelled') return;
        if (result.status === 'error') {
          update({ error: result.error });
          return;
        }
        update({ baseUrl: result.url, baseCustom: true });
        scheduleCoverPreview();
      } catch (e) {
        update({ error: normalizeError(e, 'RenderError') });
      }
    },

    async clearBase() {
      update({ error: null });
      try {
        const result = await ipc.clearDefaultBase();
        if (result.status === 'error') {
          update({ error: result.error });
          return;
        }
        await loadBase();
        scheduleCoverPreview();
      } catch (e) {
        update({ error: normalizeError(e, 'RenderError') });
      }
    },

    async publish() {
      const { form, signedIn } = state;
      if (!canPublish(form.title, signedIn)) return;
      update({ phase: 'publishing', error: null, notice: null, stage: null, cancelling: false });
      try {
        const published = await ipc.publish(toPublishRequest(form));
        if (published.status === 'ok') {
          finishPublish(published);
          return;
        }
        if (published.status === 'cancelled') {
          update({ notice: translate()('publish.cancelled'), phase: 'edit', cancelling: false });
          return;
        }
        const patch: Partial<PublishFlowState> = { error: published.error, phase: 'failed' };
        if (published.error.code === 'AuthRevoked' || published.error.code === 'TokenStorageError') {
          patch.signedIn = false;
          patch.account = null;
        }
        update(patch);
      } catch (e) {
        update({ error: normalizeError(e, 'EngineError'), phase: 'failed' });
      }
    },

    cancel() {
      update({ cancelling: true });
      ipc.cancelPublish();
    },

    async copyLink(url) {
      try {
        const result = await ipc.copyText(url);
        if (result.status === 'error') {
          update({ error: result.error });
          return;
        }
        update({ copied: true });
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copyTimer = null;
          update({ copied: false });
        }, COPY_RESET_MS);
      } catch (e) {
        update({ error: normalizeError(e, 'EngineError') });
      }
    },

    toggleEmail() {
      if (state.emailOpen) {
        update({ emailOpen: false });
        return;
      }
      openEmail();
    },

    async sendEmail() {
      const { result, emailSubject, emailBody } = state;
      if (!result) return;
      const recipients = emailRecipients(state);
      const validationError = recipientValidationError(recipients);
      if (validationError) {
        update({ emailSent: false, emailError: validationError });
        return;
      }
      if (!canSendEmail(emailSubject, emailBody, recipients)) return;
      update({ emailSending: true, emailError: null, emailSent: false });
      try {
        const outcome = await ipc.sendEmail({ to: recipients, subject: emailSubject, body: emailBody });
        if (outcome.status === 'error') {
          const patch: Partial<PublishFlowState> = { emailError: outcome.error };
          if (outcome.error.code === 'AuthRevoked' || outcome.error.code === 'TokenStorageError') {
            patch.signedIn = false;
            patch.account = null;
            patch.hasEmailScope = false;
          }
          update(patch);
          return;
        }
        const sentTo = normalizeRecipients([...state.sentTo, ...recipients]);
        update({
          emailSent: true,
          emailTo: '',
          sentTo,
          // add to the unchecks rather than reset them: an address left out on purpose stays out
          uncheckedRecipients: normalizeRecipients([...state.uncheckedRecipients, ...recipients.map(recipientKey)]),
        });
        if (latestVideo) {
          rememberPublishedVideo({ ...latestVideo, emailSubject, emailBody, sentTo });
        }
      } catch (e) {
        update({ emailError: normalizeError(e, 'EmailSendError') });
      } finally {
        update({ emailSending: false });
      }
    },

    dismissError() {
      update({ error: null, phase: 'edit' });
    },

    dismissEmailError() {
      update({ emailError: null });
    },
  };
}
