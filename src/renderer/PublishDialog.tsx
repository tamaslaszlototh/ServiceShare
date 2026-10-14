import { ChangeEvent, FormEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EditOperation } from '@shared/types';
import { parseRecipients } from '@shared/recipients';
import { errorLabel, errorMessage } from './errors';
import { ErrorBanner } from './ErrorBanner';
import { useT } from './LocaleContext';
import {
  PUBLISH_DESCRIPTION_MAX,
  PUBLISH_TAGS_MAX_CHARS,
  PUBLISH_TITLE_MAX,
  accountLabel,
  canPublish,
  durationWarning,
  editedDuration,
  parseTags,
  privacyOptions,
  publishErrorAction,
  stageLabel,
  tagsCharCount,
  titleMissing,
  uploadPercent,
} from './publish';
import { canSendEmail, emailErrorAction } from './email';
import { PublishFlow, createPublishFlow } from './publishFlow';

const UNVERIFIED_NOTE_KEY = 'serviceshare.unverifiedNoteDismissed';
const IMAGE_ACCEPT = 'image/png,image/jpeg,.png,.jpg,.jpeg';

interface PublishDialogProps {
  sourceFile: string;
  sourceDuration: number;
  editList: readonly EditOperation[];
  onClose: () => void;
}

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(UNVERIFIED_NOTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function PublishDialog({ sourceFile, sourceDuration, editList, onClose }: PublishDialogProps) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const publishingRef = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;
  onCloseRef.current = onClose;

  const flowRef = useRef<PublishFlow | null>(null);
  if (!flowRef.current) {
    flowRef.current = createPublishFlow({
      ipc: window.api,
      translate: () => tRef.current,
      sourceFile,
    });
  }
  const flow = flowRef.current;

  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  const form = state.form;
  const publishing = state.phase === 'publishing';
  publishingRef.current = publishing;

  const [showUnverified, setShowUnverified] = useState(() => !readDismissed());

  const warning = durationWarning(editedDuration(sourceDuration, editList));
  const tagsOverLimit = tagsCharCount(parseTags(form.tags)) > PUBLISH_TAGS_MAX_CHARS;
  const percent = state.stage ? uploadPercent(state.stage) : null;
  const action = state.phase === 'failed' && state.error ? publishErrorAction(state.error.code, t) : null;

  useEffect(() => {
    flow.start();
    return () => flow.dispose();
  }, [flow]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    const focusable = () =>
      [...(cardRef.current?.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]') ?? [])].filter(
        (el) => !el.hidden && !el.hasAttribute('disabled'),
      );

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (publishingRef.current) {
          flow.cancel();
        } else {
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus();
    };
  }, [flow]);

  const pickFile = (event: ChangeEvent<HTMLInputElement>, set: (file: File) => void) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    set(file);
  };

  const dismissUnverified = () => {
    setShowUnverified(false);
    try {
      localStorage.setItem(UNVERIFIED_NOTE_KEY, '1');
    } catch {
      return;
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!publishing) void flow.publish();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={cardRef}
        className="modal-card wide"
        role="dialog"
        aria-modal="true"
        aria-label={t('publish.ariaLabel')}
        aria-busy={publishing}
        tabIndex={-1}
      >
        <h3 className="modal-title">{t('publish.title')}</h3>

        {state.phase === 'done' && state.result ? (
          <div className="publish-done">
            <p>{t('publish.doneHeading')}</p>
            <a className="done-link" href={state.result.url} target="_blank" rel="noreferrer">
              {t('publish.openVideo')}
            </a>
            <div className="done-link-row">
              <input
                className="done-url"
                aria-label={t('publish.videoUrl')}
                readOnly
                value={state.result.url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button className="btn ghost" type="button" onClick={() => void flow.copyLink(state.result!.url)}>
                {state.copied ? t('publish.copied') : t('publish.copyLink')}
              </button>
            </div>
            <div className="done-email-row">
              <button
                className="btn ghost"
                type="button"
                aria-expanded={state.emailOpen}
                aria-controls="email-panel"
                onClick={flow.toggleEmail}
              >
                {t('publish.sendEmail')}
              </button>
            </div>
            {state.emailOpen && (
              <div className="email-panel" id="email-panel" role="group" aria-label={t('publish.emailPanel')}>
                {form.privacyStatus === 'private' && (
                  <div className="warning">
                    <span>{t('publish.emailPrivateNote')}</span>
                  </div>
                )}
                <p className="email-from muted">
                  {t('publish.emailFrom')}: {state.account?.email ?? accountLabel(state.account, t)}
                </p>
                <label>
                  {t('publish.emailSubject')}
                  <input
                    aria-label={t('publish.emailSubject')}
                    value={state.emailSubject}
                    onChange={(event) => flow.setEmailSubject(event.target.value)}
                  />
                </label>
                <label>
                  {t('publish.emailTo')}
                  <input
                    aria-label={t('publish.emailTo')}
                    value={state.emailTo}
                    placeholder={t('publish.emailToHint')}
                    onChange={(event) => flow.setEmailTo(event.target.value)}
                  />
                </label>
                <label>
                  {t('publish.emailMessage')}
                  <textarea
                    aria-label={t('publish.emailMessage')}
                    value={state.emailBody}
                    onChange={(event) => flow.setEmailBody(event.target.value)}
                  />
                </label>
                {state.signedIn && !state.hasEmailScope && <p className="muted">{t('publish.emailScopeNote')}</p>}
                {state.emailError && (
                  <ErrorBanner
                    className="modal-error"
                    error={state.emailError}
                    action={emailErrorAction(state.emailError.code, t)}
                    onRetry={() => void flow.sendEmail()}
                    onSignIn={() => void flow.signIn()}
                    onDismiss={flow.dismissEmailError}
                  />
                )}
                {state.emailSent && (
                  <p className="notice" role="status">
                    {t('publish.emailSent')}
                  </p>
                )}
                <div className="email-actions">
                  <span className="spacer" />
                  {state.signedIn && state.hasEmailScope ? (
                    <button
                      className="btn primary"
                      type="button"
                      disabled={!canSendEmail(state.emailSubject, state.emailBody, parseRecipients(state.emailTo)) || state.emailSending}
                      onClick={() => void flow.sendEmail()}
                    >
                      {state.emailSending ? t('publish.emailSending') : t('publish.emailSend')}
                    </button>
                  ) : (
                    <button
                      className="btn primary"
                      type="button"
                      disabled={state.signingIn}
                      onClick={() => void flow.signIn()}
                    >
                      {state.signingIn ? t('publish.waitingGoogle') : t('publish.signIn')}
                    </button>
                  )}
                </div>
              </div>
            )}
            {state.result.warning && (
              <div className="warning">
                <span>{t('publish.doneSub')}</span>
              </div>
            )}
            <div className="modal-actions">
              <span className="spacer" />
              <button className="btn primary" type="button" onClick={onClose}>
                {t('publish.back')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="publish-account">
              {!state.accountReady ? (
                <span className="muted">{t('publish.checkingAccount')}</span>
              ) : state.signedIn ? (
                <>
                  <span className="account-chip">{accountLabel(state.account, t)}</span>
                  <button className="btn ghost" type="button" onClick={() => void flow.signOut()} disabled={publishing}>
                    {t('publish.signOut')}
                  </button>
                </>
              ) : (
                <button className="btn primary" type="button" onClick={() => void flow.signIn()} disabled={state.signingIn || publishing}>
                  {state.signingIn ? t('publish.waitingGoogle') : t('publish.signIn')}
                </button>
              )}
            </div>

            <div className="publish-grid">
              <div className="publish-col">
                <div className="cover-preview">
                  {state.coverUrl ? <img src={state.coverUrl} alt={t('publish.coverAlt')} /> : <span className="muted">{t('publish.updatingPreview')}</span>}
                </div>
                <div className="cover-actions">
                  <button className="btn ghost" type="button" disabled={publishing} onClick={() => coverInputRef.current?.click()}>
                    {t('publish.coverChoose')}
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={publishing || !form.coverImagePath}
                    onClick={() => flow.setForm({ coverImagePath: null })}
                  >
                    {t('publish.coverClear')}
                  </button>
                  <span className="muted">{form.coverImagePath ? fileName(form.coverImagePath) : t('publish.cover')}</span>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    hidden
                    onChange={(event) => pickFile(event, flow.setCoverFile)}
                  />
                </div>
                {state.coverError && <p className="muted">{errorLabel(state.coverError)}</p>}
                <div className="logo-row">
                  <span className="logo-label">{t('publish.defaultLogo')}</span>
                  {state.logoUrl && <img className="logo-thumb" src={state.logoUrl} alt="" />}
                  <button className="btn ghost" type="button" disabled={publishing} onClick={() => void flow.chooseLogo()}>
                    {t('publish.defaultLogoChoose')}
                  </button>
                  {state.logoCustom && (
                    <button className="btn ghost" type="button" disabled={publishing} onClick={() => void flow.clearLogo()}>
                      {t('publish.defaultLogoClear')}
                    </button>
                  )}
                </div>
                <p className="muted logo-note">{t('publish.defaultLogoNote')}</p>
              </div>

              <div className="publish-fields">
              <label>
                {t('publish.titleLabel')}
                <input
                  aria-label={t('publish.titleLabel')}
                  value={form.title}
                  maxLength={PUBLISH_TITLE_MAX}
                  required
                  disabled={publishing}
                  onChange={(event) => flow.setForm({ title: event.target.value })}
                />
              </label>
              {titleMissing(form.title) && <span className="muted">{t('publish.titleRequired')}</span>}
              <label>
                {t('publish.description')}
                <textarea
                  aria-label={t('publish.description')}
                  value={form.description}
                  maxLength={PUBLISH_DESCRIPTION_MAX}
                  disabled={publishing}
                  onChange={(event) => flow.setForm({ description: event.target.value })}
                />
              </label>
              <label>
                {t('publish.tags')}
                <input
                  aria-label={t('publish.tagsHint')}
                  value={form.tags}
                  placeholder={t('publish.tagsHint')}
                  disabled={publishing}
                  onChange={(event) => flow.setForm({ tags: event.target.value })}
                />
              </label>
              {tagsOverLimit && <span className="muted">{t('publish.tagsOverLimit')}</span>}
              <label>
                {t('publish.privacy')}
                <select
                  aria-label={t('publish.privacy')}
                  value={form.privacyStatus}
                  disabled={publishing}
                  onChange={(event) => flow.setForm({ privacyStatus: event.target.value as typeof form.privacyStatus })}
                >
                  {privacyOptions(t).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="thumb-row">
                <span className="muted">{t('publish.thumbnail')}</span>
                <button className="btn ghost" type="button" disabled={publishing} onClick={() => thumbInputRef.current?.click()}>
                  {t('publish.thumbnailChoose')}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  disabled={publishing || !form.thumbnailPath}
                  onClick={() => flow.setForm({ thumbnailPath: null })}
                >
                  {t('publish.thumbnailClear')}
                </button>
                <span className="muted">{form.thumbnailPath ? fileName(form.thumbnailPath) : t('publish.usesCover')}</span>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  hidden
                  onChange={(event) => pickFile(event, flow.setThumbnailFile)}
                />
              </div>
              </div>
            </div>

            {warning && <div className="warning">{errorMessage(warning, t)}</div>}
            {showUnverified && (
              <div className="warning">
                <span>{t('publish.unverifiedNote')}</span>
                <button className="btn ghost" type="button" onClick={dismissUnverified}>
                  {t('publish.dismiss')}
                </button>
              </div>
            )}
            {state.notice && <p className="notice">{state.notice}</p>}

            {publishing && (
              <>
                <div
                  className="progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent ?? 0}
                  aria-label={state.stage ? stageLabel(state.stage, t) : t('publish.startingPublish')}
                >
                  <div className="progress-fill" style={{ width: `${percent ?? 8}%` }} />
                </div>
                <p className="muted">
                  {state.cancelling ? t('publish.cancelling') : state.stage ? stageLabel(state.stage, t) : t('publish.starting')}
                </p>
              </>
            )}

            {state.error && (
              <ErrorBanner
                className="modal-error"
                error={state.error}
                action={action}
                onRetry={() => void flow.publish()}
                onSignIn={() => void flow.signIn()}
                onDismiss={flow.dismissError}
              />
            )}

            <div className="modal-actions">
              <span className="spacer" />
              {publishing ? (
                <button
                  className="btn ghost"
                  type="button"
                  disabled={state.cancelling}
                  onClick={flow.cancel}
                >
                  {state.cancelling ? t('publish.cancelling') : t('dialog.cancel')}
                </button>
              ) : (
                <button className="btn ghost" type="button" onClick={onClose}>
                  {t('publish.close')}
                </button>
              )}
              <button className="btn primary" type="submit" disabled={!canPublish(form.title, state.signedIn) || publishing || state.signingIn}>
                {t('publish.publish')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
