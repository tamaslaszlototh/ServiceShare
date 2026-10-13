import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, ClipInfo, Document, PeakData, Selection } from '@shared/types';
import { Timeline } from './Timeline';
import { formatSelectionRange, selectionLength } from './selection';
import { HistoryAction, resolveHistoryShortcut } from './shortcuts';
import { canRedo, canUndo, redoCount, undoCount } from '@shared/history';

function errorLabel(error: AppError): string {
  return error.message.startsWith(error.code) ? error.message : `${error.code}: ${error.message}`;
}

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
      resetPlayback();
    },
    [resetPlayback],
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
      setError({ code: 'RenderError', message: e instanceof Error ? e.message : String(e) });
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

  const statusLabel = rendering ? 'RENDERING' : playing ? 'PLAYING' : 'READY';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [applyHistory]);

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
      setError({ code: 'CorruptFile', message: e instanceof Error ? e.message : String(e) });
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
    <div
      style={{ fontFamily: 'system-ui', height: '100vh', display: 'flex', flexDirection: 'column' }}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <header style={{ padding: '8px', borderBottom: '1px solid #ccc', display: 'flex', gap: '8px' }}>
        <strong>ServiceShare</strong>
        <button onClick={handleOpen}>Open</button>
        <button onClick={() => applyHistory('undo')} disabled={!canUndo(document)}>
          Undo
        </button>
        <button onClick={() => applyHistory('redo')} disabled={!canRedo(document)}>
          Redo
        </button>
        <button disabled>Export</button>
        <button disabled>Publish to YouTube</button>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            padding: '8px',
            background: '#fdecea',
            color: '#611a15',
            borderBottom: '1px solid #f5c6cb',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            whiteSpace: 'pre-wrap',
          }}
        >
          <span style={{ flex: 1 }}>
            {errorLabel(error)}
            {error.details ? `\n${error.details}` : ''}
          </span>
          <button aria-label="Dismiss error" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div style={{ padding: '8px', borderBottom: '1px solid #ccc', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button disabled>Trim</button>
        <button disabled>Cut region</button>
        <button disabled>Fade in/out</button>
        <button disabled>Gain/Normalize</button>
        <button disabled>Concatenate</button>
        <span style={{ marginLeft: 'auto' }}>
          <button onClick={handlePlay} disabled={!clip || rendering || playing}>
            Play
          </button>
          <button onClick={handlePause} disabled={!playing}>
            Pause
          </button>
          <button onClick={handleStop} disabled={!clip}>
            Stop
          </button>
          {rendering && <span style={{ marginLeft: '8px', color: '#666' }}>Rendering…</span>}
          <span style={{ marginLeft: '8px' }}>
            {formatTime(position)} / {formatTime(duration)}
          </span>
        </span>
        <button disabled>Zoom -</button>
        <button disabled>+ Zoom</button>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />

      <main style={{ flex: 1, padding: '16px', background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
        {clip ? (
          <Timeline
            duration={clip.duration}
            sampleRate={clip.sampleRate}
            peaks={peaks}
            selection={selection}
            position={position}
            onSelectionChange={setSelection}
            onSeek={handleSeek}
          />
        ) : (
          <div style={{ color: '#666' }}>Open a WAV to begin</div>
        )}
      </main>

      <footer style={{ padding: '8px', borderTop: '1px solid #ccc', fontSize: '12px', color: '#333' }}>
        {clip ? (
          <>
            {clip.sampleRate} Hz · {clip.bitDepth}-bit · {channelLabel(clip.channels)} · {formatTime(clip.duration)}
            {selection && (
              <span aria-live="polite">
                {' · '}selection: {formatSelectionRange(selection)} ({selectionLength(selection).toFixed(3)}s)
              </span>
            )}
            {' · '}undo: {undoCount(document)} · redo: {redoCount(document)} · {statusLabel}
          </>
        ) : (
          <>No clip loaded · READY</>
        )}
      </footer>
    </div>
  );
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
