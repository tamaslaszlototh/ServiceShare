import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, ClipInfo, Document, EditOperation, EditResult, FadeKind, PeakData, Selection } from '@shared/types';
import { Timeline } from './editor/Timeline';
import { ExportDialog } from './export/ExportDialog';
import { PublishDialog } from './publishing/PublishDialog';
import { PublishedVideo } from './publishing/publishFlow';
import { ErrorBanner } from './errors/ErrorBanner';
import { normalizeError } from '@shared/apperror';
import { resolveLocale } from '@shared/i18n';
import { formatDecimal } from '@shared/format';
import { useLocale } from './i18n/LocaleContext';
import { editedDuration, removedSourceRanges } from './editor/timelineRanges';
import { formatSelectionRange, formatTime, selectionLength } from './editor/selection';
import { channelLabel } from './editor/labels';
import { HistoryAction, resolveHistoryShortcut } from './editor/shortcuts';
import {
  FADE_DEFAULT_SECONDS,
  FADE_MAX_SECONDS,
  FADE_MIN_SECONDS,
  GAIN_MAX_DB,
  GAIN_MIN_DB,
  activeFadeSeconds,
  activeNormalize,
  clampFadeSeconds,
  clampGainDb,
  cutOp,
  gainOp,
  hasSelection,
  isStructural,
  trimOp,
} from './editor/editops';

export function App() {
  const { locale, setLocale, t } = useLocale();
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [peaks, setPeaks] = useState<PeakData | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [document, setDocument] = useState<Document>({
    sourceFile: null,
    effectiveEditList: [],
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
  });
  const [error, setError] = useState<AppError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [fadeSeconds, setFadeSeconds] = useState(FADE_DEFAULT_SECONDS);
  const [gainDb, setGainDb] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  // 'publish' starts a new publish; 'email' reopens the last one to email its link
  const [publishMode, setPublishMode] = useState<'publish' | 'email' | null>(null);
  const publishOpen = publishMode !== null;
  const [publishedVideo, setPublishedVideo] = useState<PublishedVideo | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playStartRef = useRef(0);

  const resetPlayback = useCallback((duration = 0) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPlaying(false);
    setPosition(0);
    setDuration(duration);
    setLoadedUrl(null);
  }, []);

  const refreshPeaks = useCallback(async () => {
    const result = await window.api.getPeaks();
    if (result.status === 'ok') {
      setPeaks(result.peaks);
    } else if (result.status === 'error') {
      setError(result.error);
    }
  }, []);

  const applyHistory = useCallback(
    async (action: HistoryAction) => {
      const next = action === 'undo' ? await window.api.undo() : await window.api.redo();
      setDocument(next);
      resetPlayback(clip?.duration ?? 0);
      await refreshPeaks();
    },
    [clip, resetPlayback, refreshPeaks],
  );

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    setRendering(true);
    try {
      const preview = await window.api.getPreview();
      if (preview.status === 'error') {
        setError(preview.error);
        return;
      }
      if (preview.status === 'none') {
        return;
      }
      if (loadedUrl !== preview.url) {
        audio.src = preview.url;
        audio.load();
        setLoadedUrl(preview.url);
      }
      playStartRef.current = audio.currentTime;
      await audio.play();
      setPlaying(true);
    } catch (e) {
      setError(normalizeError(e, 'RenderError'));
    } finally {
      setRendering(false);
    }
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = playStartRef.current;
    setPosition(playStartRef.current);
    setPlaying(false);
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !loadedUrl) return;
    const clamped = Math.max(0, Math.min(time, audio.duration || time));
    audio.currentTime = clamped;
    playStartRef.current = clamped;
    setPosition(clamped);
  };

  const applyEditResult = useCallback(
    (result: EditResult, structural: boolean) => {
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status === 'error') {
        setError(result.error);
        return;
      }
      setDocument(result.document);
      resetPlayback(clip?.duration ?? 0);
      if (structural) {
        setSelection(null);
      }
      void refreshPeaks();
    },
    [clip, resetPlayback, refreshPeaks],
  );

  const applyEdit = async (op: EditOperation) => {
    applyEditResult(await window.api.applyEdit(op), isStructural(op));
  };

  const applyFade = async (kind: FadeKind) => {
    applyEditResult(await window.api.toggleFade(kind, clampFadeSeconds(fadeSeconds)), false);
  };

  const applyNormalize = async () => {
    applyEditResult(await window.api.toggleNormalize(), false);
  };

  const handleConcatenate = async () => {
    applyEditResult(await window.api.concatenate(), true);
  };

  const statusLabel = rendering
    ? t('status.rendering')
    : playing
      ? t('status.playing')
      : t('status.ready');
  const fadeInSeconds = activeFadeSeconds(document.effectiveEditList, 'fadeIn');
  const fadeOutSeconds = activeFadeSeconds(document.effectiveEditList, 'fadeOut');
  const normalizeActive = activeNormalize(document.effectiveEditList);
  const timelineDuration = clip ? editedDuration(clip.duration, document.effectiveEditList) : 0;
  const removedSeconds = clip
    ? removedSourceRanges(clip.duration, document.effectiveEditList).reduce((sum, range) => sum + (range.end - range.start), 0)
    : 0;
  const hasHistory = document.undoCount + document.redoCount > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exportOpen || publishOpen) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
        return;
      }
      const action = resolveHistoryShortcut(event);
      if (action) {
        event.preventDefault();
        void applyHistory(action);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyHistory, exportOpen, publishOpen]);

  const loadClip = async (filePath?: string) => {
    try {
      const result = await window.api.openFile(filePath);
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status === 'error') {
        setError(result.error);
        return;
      }
      setClip(result.clip);
      setPublishedVideo(null);
      setPeaks(null);
      setSelection(null);
      resetPlayback(result.clip.duration);
      setDocument(await window.api.getDocument());
      setError(null);
      await refreshPeaks();
    } catch (e) {
      setError(normalizeError(e, 'CorruptFile'));
    }
  };

  const confirmReplace = () => !hasHistory || window.confirm(t('dialog.discardEdits'));

  const handleOpen = async () => {
    if (confirmReplace()) {
      await loadClip();
    }
  };

  const handleExport = () => {
    if (!clip) {
      return;
    }
    setExportedPath(null);
    setExportOpen(true);
  };

  const menuHandlers = useRef({ open: handleOpen, export: handleExport });
  menuHandlers.current = { open: handleOpen, export: handleExport };

  useEffect(() => {
    return window.api.onMenuCommand((command) => {
      if (command === 'open') {
        void menuHandlers.current.open();
      } else if (command === 'export') {
        menuHandlers.current.export();
      }
    });
  }, []);

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file || !confirmReplace()) {
      return;
    }
    await loadClip(window.api.getPathForFile(file));
  };

  return (
    <div className="app" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
      <header className="app-header">
        <span className="title">ServiceShare</span>
        <span className="file" title={clip ? t('header.currentFile', { name: baseName(clip.filePath) }) : undefined}>
          {clip ? baseName(clip.filePath) : t('header.noFile')}
        </span>
        <span className="spacer" />
        <select
          className="language"
          aria-label={t('language.label')}
          value={locale}
          onChange={(event) => setLocale(resolveLocale(event.target.value))}
        >
          <option value="hu">{t('language.hu')}</option>
          <option value="en">{t('language.en')}</option>
        </select>
        <button className="btn" onClick={handleOpen}>
          {t('header.open')}
        </button>
        <button
          className="btn ghost"
          disabled={!clip}
          onClick={handleExport}
        >
          {t('header.export')}
        </button>
        <button
          className="btn ghost"
          disabled={!publishedVideo}
          onClick={() => setPublishMode('email')}
        >
          {t('header.emailLink')}
        </button>
        <button
          className="btn primary"
          disabled={!clip}
          onClick={() => setPublishMode('publish')}
        >
          {t('header.publish')}
        </button>
      </header>

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          onExported={(outputPath) => {
            setExportOpen(false);
            setExportedPath(outputPath);
          }}
        />
      )}

      {publishOpen && clip && (
        <PublishDialog
          sourceFile={clip.filePath}
          sourceDuration={clip.duration}
          editList={document.effectiveEditList}
          publishedVideo={publishMode === 'email' ? publishedVideo : null}
          onPublishedVideo={setPublishedVideo}
          onClose={() => setPublishMode(null)}
        />
      )}

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      <div className="toolbar">
        <button
          className="btn ghost icon"
          aria-label={t('toolbar.undo')}
          title={t('toolbar.undo')}
          onClick={() => applyHistory('undo')}
          disabled={!document.canUndo}
        >
          ↶
        </button>
        <button
          className="btn ghost icon"
          aria-label={t('toolbar.redo')}
          title={t('toolbar.redo')}
          onClick={() => applyHistory('redo')}
          disabled={!document.canRedo}
        >
          ↷
        </button>
        <span className="divider" />
        <div className="group">
          <button
            className="btn chip"
            aria-label={t('toolbar.trimAria')}
            disabled={!clip || !hasSelection(selection)}
            onClick={() => {
              const op = trimOp(selection);
              if (op) void applyEdit(op);
            }}
          >
            {t('toolbar.trim')}
          </button>
          <button
            className="btn chip"
            aria-label={t('toolbar.cutRegion')}
            disabled={!clip || !hasSelection(selection)}
            onClick={() => {
              const op = cutOp(selection);
              if (op) void applyEdit(op);
            }}
          >
            {t('toolbar.cutRegion')}
          </button>
        </div>
        <span className="divider" />
        <div className="group">
          <label className="field">
            {t('toolbar.fade')}
            <input
              aria-label={t('toolbar.fadeDuration')}
              type="number"
              min={FADE_MIN_SECONDS}
              max={FADE_MAX_SECONDS}
              step={0.5}
              value={fadeSeconds}
              onChange={(e) => setFadeSeconds(clampFadeSeconds(parseFloat(e.target.value)))}
              style={{ width: '4.5em' }}
            />
            {t('toolbar.secondsUnit')}
          </label>
          <button
            className={`btn chip${fadeInSeconds !== null ? ' active' : ''}`}
            aria-label={t('toolbar.fadeIn')}
            aria-pressed={fadeInSeconds !== null}
            title={fadeInSeconds !== null ? t('toolbar.fadeInOff') : t('toolbar.fadeInOn')}
            disabled={!clip}
            onClick={() => void applyFade('fadeIn')}
          >
            {t('toolbar.fadeInShort')}
          </button>
          <button
            className={`btn chip${fadeOutSeconds !== null ? ' active' : ''}`}
            aria-label={t('toolbar.fadeOut')}
            aria-pressed={fadeOutSeconds !== null}
            title={fadeOutSeconds !== null ? t('toolbar.fadeOutOff') : t('toolbar.fadeOutOn')}
            disabled={!clip}
            onClick={() => void applyFade('fadeOut')}
          >
            {t('toolbar.fadeOutShort')}
          </button>
        </div>
        <span className="divider" />
        <div className="group">
          <label className="field">
            {t('toolbar.gain')}
            <input
              aria-label={t('toolbar.gainDb')}
              type="number"
              min={GAIN_MIN_DB}
              max={GAIN_MAX_DB}
              step={0.5}
              value={gainDb}
              onChange={(e) => setGainDb(clampGainDb(parseFloat(e.target.value)))}
              style={{ width: '4em' }}
            />
            {t('toolbar.decibelUnit')}
          </label>
          <button
            className="btn chip"
            aria-label={t('toolbar.applyGainAria')}
            disabled={!clip}
            onClick={() => void applyEdit(gainOp(gainDb))}
          >
            {t('toolbar.apply')}
          </button>
          <button
            className={`btn chip${normalizeActive ? ' active' : ''}`}
            aria-label={t('toolbar.normalizeAria')}
            aria-pressed={normalizeActive}
            title={normalizeActive ? t('toolbar.normalizeOff') : t('toolbar.normalizeOn')}
            disabled={!clip}
            onClick={() => void applyNormalize()}
          >
            {t('toolbar.normalize')}
          </button>
        </div>
        <button
          className="btn chip"
          aria-label={t('toolbar.concatenateAria')}
          disabled={!clip}
          onClick={() => void handleConcatenate()}
        >
          {t('toolbar.concatenate')}
        </button>
        <span className="divider" />
        <div className="group">
          <button
            className="btn ghost icon"
            aria-label={t('toolbar.play')}
            title={t('toolbar.play')}
            onClick={handlePlay}
            disabled={!clip || rendering || playing}
          >
            ▶
          </button>
          <button
            className="btn ghost icon"
            aria-label={t('toolbar.pause')}
            title={t('toolbar.pause')}
            onClick={handlePause}
            disabled={!playing}
          >
            ⏸
          </button>
          <button
            className="btn ghost icon"
            aria-label={t('toolbar.stop')}
            title={t('toolbar.stop')}
            onClick={handleStop}
            disabled={!clip}
          >
            ⏹
          </button>
          <span className="timecode">
            {formatTime(position, locale)} / {formatTime(duration, locale)}
          </span>
          {rendering && <span className="muted">{t('toolbar.rendering')}</span>}
        </div>
        <span className="spacer" />
        <div className="group">
          <button className="btn ghost icon" aria-label={t('toolbar.zoomOut')} disabled>
            −
          </button>
          <button className="btn ghost icon" aria-label={t('toolbar.zoomIn')} disabled>
            +
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />

      <main className="workarea">
        {clip ? (
          <>
            <Timeline
              duration={timelineDuration}
              sampleRate={clip.sampleRate}
              peaks={peaks}
              selection={selection}
              position={position}
              fadeIn={fadeInSeconds}
              fadeOut={fadeOutSeconds}
              onSelectionChange={setSelection}
              onSeek={handleSeek}
            />
            <div className="meta">
              <span>{t('meta.format', { rate: clip.sampleRate, bits: clip.bitDepth })}</span>
              <span>{channelLabel(clip.channels, t)}</span>
              <span>{formatTime(timelineDuration, locale)}</span>
              {removedSeconds > 0 && (
                <span className="muted">
                  {t('meta.removed', { time: formatTime(removedSeconds, locale) })}
                </span>
              )}
              <span className="spacer" />
              {selection && (
                <span aria-live="polite">
                  {t('meta.selection', {
                    range: formatSelectionRange(selection, locale),
                    length: formatDecimal(selectionLength(selection), locale, 3),
                  })}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="empty-card">
              <div className="big">♪</div>
              <h3>{t('empty.noFile')}</h3>
              <p className="muted">{t('empty.hint')}</p>
              <button className="btn primary" onClick={handleOpen}>
                {t('empty.open')}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="status">
        {clip ? (
          <>
            <span>{t('status.undoRedo', { undo: document.undoCount, redo: document.redoCount })}</span>
            {exportedPath && (
              <span className="notice">{t('notice.exported', { path: exportedPath })}</span>
            )}
            <span className="spacer" />
            <span>{statusLabel}</span>
          </>
        ) : (
          <>
            <span>{t('status.noClip')}</span>
            <span className="spacer" />
            <span>{t('status.ready')}</span>
          </>
        )}
      </footer>
    </div>
  );
}

function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}
