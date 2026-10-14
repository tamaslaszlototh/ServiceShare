import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AccountInfo, AppError, EditOperation, PublishEvent, PublishResult } from '@shared/types';
import { errorLabel, errorMessage } from './errors';
import { normalizeError } from '@shared/apperror';
import { ErrorBanner } from './ErrorBanner';
import { useT } from './LocaleContext';
import {
  PUBLISH_DESCRIPTION_MAX,
  PUBLISH_TAGS_MAX_CHARS,
  PUBLISH_TITLE_MAX,
  PublishForm,
  accountLabel,
  canPublish,
  defaultTitle,
  durationWarning,
  editedDuration,
  parseTags,
  privacyOptions,
  publishErrorAction,
  stageLabel,
  tagsCharCount,
  titleMissing,
  toPublishRequest,
  uploadPercent,
} from './publish';

const UNVERIFIED_NOTE_KEY = 'serviceshare.unverifiedNoteDismissed';
const COVER_DEBOUNCE_MS = 200;
const IMAGE_ACCEPT = 'image/png,image/jpeg,.png,.jpg,.jpeg';

interface PublishDialogProps {
  sourceFile: string;
  sourceDuration: number;
  editList: EditOperation[];
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

  const [signedIn, setSignedIn] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [title, setTitle] = useState(() => defaultTitle(sourceFile));
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacyStatus, setPrivacyStatus] = useState<PublishForm['privacyStatus']>('unlisted');
  const [coverImagePath, setCoverImagePath] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<AppError | null>(null);
  const [phase, setPhase] = useState<'edit' | 'publishing' | 'done' | 'failed'>('edit');
  const [stage, setStage] = useState<PublishEvent | null>(null);
  const [result, setResult] = useState<Extract<PublishResult, { status: 'ok' }> | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showUnverified, setShowUnverified] = useState(() => !readDismissed());

  const form: PublishForm = { title, description, tags, privacyStatus, coverImagePath, thumbnailPath };
  const publishing = phase === 'publishing';
  publishingRef.current = publishing;
  onCloseRef.current = onClose;

  const warning = durationWarning(editedDuration(sourceDuration, editList));
  const tagsOverLimit = tagsCharCount(parseTags(tags)) > PUBLISH_TAGS_MAX_CHARS;
  const percent = stage ? uploadPercent(stage) : null;
  const action = phase === 'failed' && error ? publishErrorAction(error.code, t) : null;

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
          setCancelling(true);
          window.api.cancelPublish();
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.api
      .getAccount()
      .then((state) => {
        if (cancelled) return;
        setSignedIn(state.signedIn);
        setAccount(state.account ?? null);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      })
      .finally(() => {
        if (!cancelled) setAccountReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.api.onPublishProgress((event) => {
      if ('kind' in event) return;
      setStage(event);
      if (event.stage === 'done') {
        setResult({ status: 'ok', videoId: event.videoId, url: event.url, warning: event.warning });
        setPhase('done');
        setCancelling(false);
      } else if (event.stage === 'cancelled') {
        setNotice(t('publish.cancelled'));
        setPhase('edit');
        setCancelling(false);
      }
    });
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.api
        .composeCoverPreview({
          title: title.trim() || ' ',
          coverImagePath: coverImagePath ?? undefined,
        })
        .then((preview) => {
          if (cancelled) return;
          if (preview.status === 'ok') {
            setCoverUrl(preview.url);
            setCoverError(null);
          } else {
            setCoverError(preview.error);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCoverError({ code: 'RenderError', message: t('publish.coverError') });
          }
        });
    }, COVER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [title, coverImagePath]);

  const signIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const auth = await window.api.signIn();
      if (auth.status === 'error') {
        setError(auth.error);
        return;
      }
      setSignedIn(true);
      setAccount(auth.account);
    } catch (e) {
      setError(normalizeError(e, 'AuthRevoked'));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      const result = await window.api.signOut();
      if (result.status === 'error') {
        setError(result.error);
        return;
      }
      setSignedIn(false);
      setAccount(null);
    } catch (e) {
      setError(normalizeError(e, 'AuthRevoked'));
    }
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>, setPath: (path: string) => void) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPath(window.api.getPathForFile(file));
  };

  const run = async () => {
    if (!canPublish(title, signedIn)) return;
    setPhase('publishing');
    setError(null);
    setNotice(null);
    setStage(null);
    setCancelling(false);
    try {
      const published = await window.api.publish(toPublishRequest(form));
      if (published.status === 'ok') {
        setResult(published);
        setPhase('done');
        return;
      }
      if (published.status === 'cancelled') {
        setNotice(t('publish.cancelled'));
        setPhase('edit');
        setCancelling(false);
        return;
      }
      setError(published.error);
      setPhase('failed');
      if (published.error.code === 'AuthRevoked' || published.error.code === 'TokenStorageError') {
        setSignedIn(false);
        setAccount(null);
      }
    } catch (e) {
      setError(normalizeError(e, 'EngineError'));
      setPhase('failed');
    }
  };

  const copyLink = async (url: string) => {
    try {
      const result = await window.api.copyText(url);
      if (result.status === 'error') {
        setError(result.error);
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(normalizeError(e, 'EngineError'));
    }
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
    if (!publishing) void run();
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

        {phase === 'done' && result ? (
          <div className="publish-done">
            <p>{t('publish.doneHeading')}</p>
            <a className="done-link" href={result.url} target="_blank" rel="noreferrer">
              {t('publish.openVideo')}
            </a>
            <div className="done-link-row">
              <input
                className="done-url"
                aria-label={t('publish.videoUrl')}
                readOnly
                value={result.url}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button className="btn ghost" type="button" onClick={() => void copyLink(result.url)}>
                {copied ? t('publish.copied') : t('publish.copyLink')}
              </button>
            </div>
            {result.warning && (
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
              {!accountReady ? (
                <span className="muted">{t('publish.checkingAccount')}</span>
              ) : signedIn ? (
                <>
                  <span className="account-chip">{accountLabel(account, t)}</span>
                  <button className="btn ghost" type="button" onClick={() => void signOut()} disabled={publishing}>
                    {t('publish.signOut')}
                  </button>
                </>
              ) : (
                <button className="btn primary" type="button" onClick={() => void signIn()} disabled={signingIn || publishing}>
                  {signingIn ? t('publish.waitingGoogle') : t('publish.signIn')}
                </button>
              )}
            </div>

            <div className="cover-preview">
              {coverUrl ? <img src={coverUrl} alt={t('publish.coverAlt')} /> : <span className="muted">{t('publish.updatingPreview')}</span>}
            </div>
            <div className="cover-actions">
              <button className="btn ghost" type="button" disabled={publishing} onClick={() => coverInputRef.current?.click()}>
                {t('publish.coverChoose')}
              </button>
              <button className="btn ghost" type="button" disabled={publishing || !coverImagePath} onClick={() => setCoverImagePath(null)}>
                {t('publish.coverClear')}
              </button>
              <span className="muted">{coverImagePath ? fileName(coverImagePath) : t('publish.cover')}</span>
              <input
                ref={coverInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                onChange={(event) => pickFile(event, setCoverImagePath)}
              />
            </div>
            {coverError && <p className="muted">{errorLabel(coverError)}</p>}

            <div className="publish-fields">
              <label>
                {t('publish.titleLabel')}
                <input
                  aria-label={t('publish.titleLabel')}
                  value={title}
                  maxLength={PUBLISH_TITLE_MAX}
                  required
                  disabled={publishing}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              {titleMissing(title) && <span className="muted">{t('publish.titleRequired')}</span>}
              <label>
                {t('publish.description')}
                <textarea
                  aria-label={t('publish.description')}
                  value={description}
                  maxLength={PUBLISH_DESCRIPTION_MAX}
                  disabled={publishing}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                {t('publish.tags')}
                <input
                  aria-label={t('publish.tagsHint')}
                  value={tags}
                  placeholder={t('publish.tagsHint')}
                  disabled={publishing}
                  onChange={(event) => setTags(event.target.value)}
                />
              </label>
              {tagsOverLimit && <span className="muted">{t('publish.tagsOverLimit')}</span>}
              <label>
                {t('publish.privacy')}
                <select
                  aria-label={t('publish.privacy')}
                  value={privacyStatus}
                  disabled={publishing}
                  onChange={(event) => setPrivacyStatus(event.target.value as PublishForm['privacyStatus'])}
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
                  disabled={publishing || !thumbnailPath}
                  onClick={() => setThumbnailPath(null)}
                >
                  {t('publish.thumbnailClear')}
                </button>
                <span className="muted">{thumbnailPath ? fileName(thumbnailPath) : t('publish.usesCover')}</span>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  hidden
                  onChange={(event) => pickFile(event, setThumbnailPath)}
                />
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
            {notice && <p className="notice">{notice}</p>}

            {publishing && (
              <>
                <div
                  className="progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent ?? 0}
                  aria-label={stage ? stageLabel(stage, t) : t('publish.startingPublish')}
                >
                  <div className="progress-fill" style={{ width: `${percent ?? 8}%` }} />
                </div>
                <p className="muted">
                  {cancelling ? t('publish.cancelling') : stage ? stageLabel(stage, t) : t('publish.starting')}
                </p>
              </>
            )}

            {error && (
              <ErrorBanner
                className="modal-error"
                error={error}
                action={action}
                onRetry={() => void run()}
                onSignIn={() => void signIn()}
                onDismiss={() => {
                  setError(null);
                  setPhase('edit');
                }}
              />
            )}

            <div className="modal-actions">
              <span className="spacer" />
              {publishing ? (
                <button
                  className="btn ghost"
                  type="button"
                  disabled={cancelling}
                  onClick={() => {
                    setCancelling(true);
                    window.api.cancelPublish();
                  }}
                >
                  {cancelling ? t('publish.cancelling') : t('dialog.cancel')}
                </button>
              ) : (
                <button className="btn ghost" type="button" onClick={onClose}>
                  {t('publish.close')}
                </button>
              )}
              <button className="btn primary" type="submit" disabled={!canPublish(title, signedIn) || publishing || signingIn}>
                {t('publish.publish')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
