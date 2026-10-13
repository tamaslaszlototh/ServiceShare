import { useState } from 'react';
import { AppError, ClipInfo, Document } from '@shared/types';

function errorLabel(error: AppError): string {
  return error.message.startsWith(error.code) ? error.message : `${error.code}: ${error.message}`;
}

export function App() {
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [document, setDocument] = useState<Document>({ sourceFile: null, editList: [], historyIndex: -1 });
  const [error, setError] = useState<AppError | null>(null);

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
      setDocument(await window.api.getDocument());
      setError(null);
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
          <button disabled>Play</button>
          <button disabled>Pause</button>
          <button disabled>Stop</button>
          <span style={{ marginLeft: '8px' }}>0:00.000 / {clip ? formatTime(clip.duration) : '0:00.000'}</span>
        </span>
        <button disabled>Zoom -</button>
        <button disabled>+ Zoom</button>
      </div>

      <main style={{ flex: 1, padding: '16px', background: '#fafafa' }}>
        {clip ? (
          <div>
            <div style={{ height: '120px', background: '#e0e0e0', marginBottom: '8px' }}>Waveform</div>
            <div style={{ height: '40px', background: '#f0f0f0' }}>Ruler</div>
          </div>
        ) : (
          <div style={{ color: '#666' }}>Open a WAV to begin</div>
        )}
      </main>

      <footer style={{ padding: '8px', borderTop: '1px solid #ccc', fontSize: '12px', color: '#333' }}>
        {clip ? (
          <>
            {clip.sampleRate} Hz · {clip.bitDepth}-bit · {channelLabel(clip.channels)} · {formatTime(clip.duration)} · undo: {Math.max(0, document.historyIndex + 1)} · redo: {Math.max(0, document.editList.length - (document.historyIndex + 1))} · READY
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
