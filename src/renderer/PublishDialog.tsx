import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { AccountInfo, AppError, EditOperation, PublishEvent, PublishResult } from '@shared/types';
import { errorLabel } from './errors';
import {
  PRIVACY_OPTIONS,
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
  publishErrorAction,
  stageLabel,
  tagsCharCount,
  titleMissing,
  toPublishRequest,
  uploadPercent,
} from './publish';

const UNVERIFIED_NOTE_KEY = 'serviceshare.unverifiedNoteDismissed';
const UNVERIFIED_NOTE =
  'This Google project may still be unverified. YouTube can lock those uploads to private until the project is verified.';
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
  const [cancelling, setCancelling] = useState(false);
  const [showUnverified, setShowUnverified] = useState(() => !readDismissed());

  const form: PublishForm = { title, description, tags, privacyStatus, coverImagePath, thumbnailPath };
  const publishing = phase === 'publishing';
  publishingRef.current = publishing;
  onCloseRef.current = onClose;

  const warning = durationWarning(editedDuration(sourceDuration, editList));
  const tagsOverLimit = tagsCharCount(parseTags(tags)) > PUBLISH_TAGS_MAX_CHARS;
  const percent = stage ? uploadPercent(stage) : null;
  const action = phase === 'failed' && error ? publishErrorAction(error.code) : null;

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
        setNotice('Publish cancelled');
        setPhase('edit');
        setCancelling(false);
      }
    });
  }, []);

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
            setCoverError({ code: 'RenderError', message: 'Could not compose the cover preview' });
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
      setError({ code: 'AuthRevoked', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      await window.api.signOut();
      setSignedIn(false);
      setAccount(null);
    } catch (e) {
      setError({ code: 'AuthRevoked', message: e instanceof Error ? e.message : String(e) });
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
        setNotice('Publish cancelled');
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
      setError({ code: 'EngineError', message: e instanceof Error ? e.message : String(e) });
      setPhase('failed');
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

  const onErrorAction = () => {
    if (!action || !error) return;
    if (action.kind === 'retry') {
      void run();
      return;
    }
    setPhase('edit');
    setError(null);
    void signIn();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={cardRef}
        className="modal-card wide"
        role="dialog"
        aria-modal="true"
        aria-label="Publish to YouTube"
        aria-busy={publishing}
        tabIndex={-1}
      >
        <h3 className="modal-title">Publish to YouTube</h3>

        {phase === 'done' && result ? (
          <div className="publish-done">
            <p>Your video is on YouTube.</p>
            <a className="done-link" href={result.url} target="_blank" rel="noreferrer">
              View on YouTube
            </a>
            {result.warning && (
              <div className="warning">
                <span>The video published, but the thumbnail could not be set: {errorLabel(result.warning)}</span>
              </div>
            )}
            <div className="modal-actions">
              <span className="spacer" />
              <button className="btn primary" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="publish-account">
              {!accountReady ? (
                <span className="muted">Checking account…</span>
              ) : signedIn ? (
                <>
                  <span className="account-chip">{accountLabel(account)}</span>
                  <button className="btn ghost" type="button" onClick={() => void signOut()} disabled={publishing}>
                    Sign out
                  </button>
                </>
              ) : (
                <button className="btn primary" type="button" onClick={() => void signIn()} disabled={signingIn || publishing}>
                  {signingIn ? 'Waiting for Google…' : 'Sign in with Google'}
                </button>
              )}
            </div>

            <div className="cover-preview">
              {coverUrl ? <img src={coverUrl} alt="Cover preview" /> : <span className="muted">Updating preview…</span>}
            </div>
            <div className="cover-actions">
              <button className="btn ghost" type="button" disabled={publishing} onClick={() => coverInputRef.current?.click()}>
                Choose image…
              </button>
              <button className="btn ghost" type="button" disabled={publishing || !coverImagePath} onClick={() => setCoverImagePath(null)}>
                Remove
              </button>
              <span className="muted">{coverImagePath ? fileName(coverImagePath) : 'Default cover'}</span>
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
                Title
                <input
                  aria-label="Video title"
                  value={title}
                  maxLength={PUBLISH_TITLE_MAX}
                  required
                  disabled={publishing}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              {titleMissing(title) && <span className="muted">A title is required.</span>}
              <label>
                Description
                <textarea
                  aria-label="Video description"
                  value={description}
                  maxLength={PUBLISH_DESCRIPTION_MAX}
                  disabled={publishing}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                Tags
                <input
                  aria-label="Tags, separated by commas"
                  value={tags}
                  placeholder="comma separated"
                  disabled={publishing}
                  onChange={(event) => setTags(event.target.value)}
                />
              </label>
              {tagsOverLimit && <span className="muted">Tags are limited to 500 characters; extras will be dropped.</span>}
              <label>
                Privacy
                <select
                  aria-label="Privacy"
                  value={privacyStatus}
                  disabled={publishing}
                  onChange={(event) => setPrivacyStatus(event.target.value as PublishForm['privacyStatus'])}
                >
                  {PRIVACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="thumb-row">
                <span className="muted">Thumbnail</span>
                <button className="btn ghost" type="button" disabled={publishing} onClick={() => thumbInputRef.current?.click()}>
                  Choose…
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  disabled={publishing || !thumbnailPath}
                  onClick={() => setThumbnailPath(null)}
                >
                  Remove
                </button>
                <span className="muted">{thumbnailPath ? fileName(thumbnailPath) : 'Uses the composed cover'}</span>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  hidden
                  onChange={(event) => pickFile(event, setThumbnailPath)}
                />
              </div>
            </div>

            {warning && <div className="warning">{warning}</div>}
            {showUnverified && (
              <div className="warning">
                <span>{UNVERIFIED_NOTE}</span>
                <button className="btn ghost" type="button" onClick={dismissUnverified}>
                  Dismiss
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
                  aria-label={stage ? stageLabel(stage) : 'Starting publish'}
                >
                  <div className="progress-fill" style={{ width: `${percent ?? 8}%` }} />
                </div>
                <p className="muted">{cancelling ? 'Cancelling…' : stage ? stageLabel(stage) : 'Starting…'}</p>
              </>
            )}

            {error && (
              <div role="alert" className="banner modal-error">
                <span className="message">
                  {errorLabel(error)}
                  {error.details ? `\n${error.details}` : ''}
                </span>
                {action?.kind === 'link' && action.href && (
                  <a className="btn ghost" href={action.href} target="_blank" rel="noreferrer">
                    {action.label}
                  </a>
                )}
                {action && action.kind !== 'link' && (
                  <button className="btn ghost" type="button" onClick={onErrorAction}>
                    {action.label}
                  </button>
                )}
              </div>
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
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              ) : (
                <button className="btn ghost" type="button" onClick={onClose}>
                  Close
                </button>
              )}
              <button className="btn primary" type="submit" disabled={!canPublish(title, signedIn) || publishing || signingIn}>
                Publish to YouTube
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
