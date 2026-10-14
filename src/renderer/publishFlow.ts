import { Translator } from '@shared/i18n';
import { normalizeError } from '@shared/apperror';
import { normalizeRecipients, parseRecipients } from '@shared/recipients';
import {
  AccountInfo,
  AccountState,
  AppError,
  AuthResult,
  CoverPreviewRequest,
  CoverPreviewResult,
  DefaultLogo,
  EmailSendRequest,
  EmailSendResult,
  LogoResult,
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
  emailOpen: boolean;
  emailSubject: string;
  emailBody: string;
  emailTo: string;
  emailSending: boolean;
  emailSent: boolean;
  emailError: AppError | null;
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
  getDefaultLogo(): Promise<DefaultLogo>;
  chooseDefaultLogo(): Promise<LogoResult>;
  clearDefaultLogo(): Promise<VoidResult>;
  sendEmail(req: EmailSendRequest): Promise<EmailSendResult>;
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
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  chooseLogo(): Promise<void>;
  clearLogo(): Promise<void>;
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
}

export function createPublishFlow({
  ipc,
  translate,
  sourceFile,
  coverDebounceMs = COVER_DEBOUNCE_MS,
}: PublishFlowOptions): PublishFlow {
  let state: PublishFlowState = {
    phase: 'edit',
    stage: null,
    result: null,
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
    emailOpen: false,
    emailSubject: '',
    emailBody: '',
    emailTo: '',
    emailSending: false,
    emailSent: false,
    emailError: null,
    form: {
      title: defaultTitle(sourceFile),
      description: '',
      tags: '',
      privacyStatus: 'unlisted',
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

  function onProgress(event: PublishEvent): void {
    if ('kind' in event) return;
    update({ stage: event });
    if (event.stage === 'done') {
      update({
        result: { status: 'ok', videoId: event.videoId, url: event.url, warning: event.warning },
        phase: 'done',
        cancelling: false,
      });
    } else if (event.stage === 'cancelled') {
      update({ notice: translate()('publish.cancelled'), phase: 'edit', cancelling: false });
    }
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
      void loadLogo();
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

    async publish() {
      const { form, signedIn } = state;
      if (!canPublish(form.title, signedIn)) return;
      update({ phase: 'publishing', error: null, notice: null, stage: null, cancelling: false });
      try {
        const published = await ipc.publish(toPublishRequest(form));
        if (published.status === 'ok') {
          update({ result: published, phase: 'done' });
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
      const { result, form } = state;
      if (!result) return;
      update({
        emailSubject: defaultEmailSubject(form.title),
        emailBody: defaultEmailBody(result.url, translate()),
        emailTo: '',
        emailSent: false,
        emailError: null,
        emailOpen: true,
      });
    },

    async sendEmail() {
      const { result, emailTo, emailSubject, emailBody } = state;
      if (!result) return;
      const recipients = normalizeRecipients(parseRecipients(emailTo));
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
        update({ emailSent: true });
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
