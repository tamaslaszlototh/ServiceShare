import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, ClipInfo, Document, EditOperation, EditResult, PeakData, Selection } from '@shared/types';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { PublishDialog } from './PublishDialog';
import { ErrorBanner } from './ErrorBanner';
import { normalizeError } from '@shared/apperror';
import { keptSourceRanges, removedSourceRanges } from './timelineRanges';
import { formatSelectionRange, selectionLength } from './selection';
import { HistoryAction, resolveHistoryShortcut } from './shortcuts';
import { canRedo, canUndo, redoCount, undoCount } from '@shared/history';
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
} from './editops';

export function App() {
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [peaks, setPeaks] = useState<PeakData | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [document, setDocument] = useState<Document>({ sourceFile: null, editList: [], historyIndex: 0 });
  const [error, setError] = useState<AppError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [fadeSeconds, setFadeSeconds] = useState(FADE_DEFAULT_SECONDS);
  const [gainDb, setGainDb] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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

  const applyHistory = useCallback(
    async (action: HistoryAction) => {
      const next = action === 'undo' ? await window.api.undo() : await window.api.redo();
      setDocument(next);
      resetPlayback(clip?.duration ?? 0);
    },
    [clip, resetPlayback],
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
    },
    [clip, resetPlayback],
  );

  const applyEdit = async (op: EditOperation) => {
    applyEditResult(await window.api.applyEdit(op), isStructural(op));
  };

  const applyFade = async (kind: 'fadeIn' | 'fadeOut') => {
    applyEditResult(await window.api.toggleFade(kind, clampFadeSeconds(fadeSeconds)), false);
  };

  const applyNormalize = async () => {
    applyEditResult(await window.api.toggleNormalize(), false);
  };

  const handleConcatenate = async () => {
    applyEditResult(await window.api.concatenate(), true);
  };

  const statusLabel = rendering ? 'RENDERING' : playing ? 'PLAYING' : 'READY';
  const effectiveEditList = document.editList.slice(0, document.historyIndex);
  const fadeInSeconds = activeFadeSeconds(document.editList, document.historyIndex, 'fadeIn');
  const fadeOutSeconds = activeFadeSeconds(document.editList, document.historyIndex, 'fadeOut');
  const normalizeActive = activeNormalize(document.editList, document.historyIndex);
  const keptRanges = clip ? keptSourceRanges(clip.duration, effectiveEditList) : [];
  const removedRanges = clip ? removedSourceRanges(clip.duration, effectiveEditList) : [];

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
      setPeaks(null);
      setSelection(null);
      resetPlayback(result.clip.duration);
      setDocument(await window.api.getDocument());
      setError(null);

      const peaksResult = await window.api.getPeaks();
      if (peaksResult.status === 'ok') {
        setPeaks(peaksResult.peaks);
      } else if (peaksResult.status === 'error') {
        setError(peaksResult.error);
      }
    } catch (e) {
      setError(normalizeError(e, 'CorruptFile'));
    }
  };

  const confirmReplace = () =>
    document.editList.length === 0 ||
    window.confirm('Opening a new file discards your edits. Continue?');

  const handleOpen = async () => {
    if (confirmReplace()) {
      await loadClip();
    }
  };

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
        <span className="file">{clip ? baseName(clip.filePath) : 'No file'}</span>
        <span className="spacer" />
        <button className="btn" onClick={handleOpen}>
          Open
        </button>
        <button
          className="btn ghost"
          disabled={!clip}
          onClick={() => {
            setNotice(null);
            setExportOpen(true);
          }}
        >
          Export
        </button>
        <button className="btn primary" disabled={!clip} onClick={() => setPublishOpen(true)}>
          Publish to YouTube…
        </button>
      </header>

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          onExported={(outputPath) => {
            setExportOpen(false);
            setNotice(`Exported to ${outputPath}`);
          }}
        />
      )}

      {publishOpen && clip && (
        <PublishDialog
          sourceFile={clip.filePath}
          sourceDuration={clip.duration}
          editList={effectiveEditList}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      <div className="toolbar">
        <button
          className="btn ghost icon"
          aria-label="Undo"
          title="Undo"
          onClick={() => applyHistory('undo')}
          disabled={!canUndo(document)}
        >
          ↶
        </button>
        <button
          className="btn ghost icon"
          aria-label="Redo"
          title="Redo"
          onClick={() => applyHistory('redo')}
          disabled={!canRedo(document)}
        >
          ↷
        </button>
        <span className="divider" />
        <div className="group">
          <button
            className="btn chip"
            aria-label="Trim to selection"
            disabled={!clip || !hasSelection(selection)}
            onClick={() => {
              const op = trimOp(selection);
              if (op) void applyEdit(op);
            }}
          >
            Trim
          </button>
          <button
            className="btn chip"
            aria-label="Cut region"
            disabled={!clip || !hasSelection(selection)}
            onClick={() => {
              const op = cutOp(selection);
              if (op) void applyEdit(op);
            }}
          >
            Cut region
          </button>
        </div>
        <span className="divider" />
        <div className="group">
          <label className="field">
            Fade
            <input
              aria-label="Fade duration in seconds"
              type="number"
              min={FADE_MIN_SECONDS}
              max={FADE_MAX_SECONDS}
              step={0.5}
              value={fadeSeconds}
              onChange={(e) => setFadeSeconds(clampFadeSeconds(parseFloat(e.target.value)))}
              style={{ width: '4.5em' }}
            />
            s
          </label>
          <button
            className={`btn chip${fadeInSeconds !== null ? ' active' : ''}`}
            aria-label="Fade in"
            aria-pressed={fadeInSeconds !== null}
            title={fadeInSeconds !== null ? 'Turn fade in off' : 'Turn fade in on'}
            disabled={!clip}
            onClick={() => void applyFade('fadeIn')}
          >
            In
          </button>
          <button
            className={`btn chip${fadeOutSeconds !== null ? ' active' : ''}`}
            aria-label="Fade out"
            aria-pressed={fadeOutSeconds !== null}
            title={fadeOutSeconds !== null ? 'Turn fade out off' : 'Turn fade out on'}
            disabled={!clip}
            onClick={() => void applyFade('fadeOut')}
          >
            Out
          </button>
        </div>
        <span className="divider" />
        <div className="group">
          <label className="field">
            Gain
            <input
              aria-label="Gain in decibels"
              type="number"
              min={GAIN_MIN_DB}
              max={GAIN_MAX_DB}
              step={0.5}
              value={gainDb}
              onChange={(e) => setGainDb(clampGainDb(parseFloat(e.target.value)))}
              style={{ width: '4em' }}
            />
            dB
          </label>
          <button className="btn chip" aria-label="Apply gain" disabled={!clip} onClick={() => void applyEdit(gainOp(gainDb))}>
            Apply
          </button>
          <button
            className={`btn chip${normalizeActive ? ' active' : ''}`}
            aria-label="Normalize loudness"
            aria-pressed={normalizeActive}
            title={normalizeActive ? 'Turn loudness normalization off' : 'Normalize loudness to −16 LUFS'}
            disabled={!clip}
            onClick={() => void applyNormalize()}
          >
            Normalize
          </button>
        </div>
        <button
          className="btn chip"
          aria-label="Concatenate a second WAV"
          disabled={!clip}
          onClick={() => void handleConcatenate()}
        >
          Concatenate…
        </button>
        <span className="divider" />
        <div className="group">
          <button
            className="btn ghost icon"
            aria-label="Play"
            title="Play"
            onClick={handlePlay}
            disabled={!clip || rendering || playing}
          >
            ▶
          </button>
          <button className="btn ghost icon" aria-label="Pause" title="Pause" onClick={handlePause} disabled={!playing}>
            ⏸
          </button>
          <button className="btn ghost icon" aria-label="Stop" title="Stop" onClick={handleStop} disabled={!clip}>
            ⏹
          </button>
          <span className="timecode">
            {formatTime(position)} / {formatTime(duration)}
          </span>
          {rendering && <span className="muted">Rendering…</span>}
        </div>
        <span className="spacer" />
        <div className="group">
          <button className="btn ghost icon" aria-label="Zoom out" disabled>
            −
          </button>
          <button className="btn ghost icon" aria-label="Zoom in" disabled>
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
              duration={clip.duration}
              sampleRate={clip.sampleRate}
              peaks={peaks}
              selection={selection}
              position={position}
              fadeIn={fadeInSeconds}
              fadeOut={fadeOutSeconds}
              keptRanges={keptRanges}
              removedRanges={removedRanges}
              onSelectionChange={setSelection}
              onSeek={handleSeek}
            />
            <div className="meta">
              <span>
                {clip.sampleRate} Hz / {clip.bitDepth}-bit
              </span>
              <span>{channelLabel(clip.channels)}</span>
              <span>{formatTime(clip.duration)}</span>
              <span className="spacer" />
              {selection && (
                <span aria-live="polite">
                  selection: {formatSelectionRange(selection)} ({selectionLength(selection).toFixed(3)}s)
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="empty-card">
              <div className="big">♪</div>
              <h3>No file opened</h3>
              <p className="muted">Open a WAV file to start editing.</p>
              <button className="btn primary" onClick={handleOpen}>
                Open WAV…
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="status">
        {clip ? (
          <>
            <span>
              undo: {undoCount(document)} · redo: {redoCount(document)}
            </span>
            {notice && <span className="notice">{notice}</span>}
            <span className="spacer" />
            <span>{statusLabel}</span>
          </>
        ) : (
          <>
            <span>No clip loaded</span>
            <span className="spacer" />
            <span>READY</span>
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

function channelLabel(channels: number): string {
  if (channels === 1) return 'mono';
  if (channels === 2) return 'stereo';
  return `${channels} channels`;
}

function formatTime(s: number): string {
  if (isNaN(s) || s < 0) return '0:00.000';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}
