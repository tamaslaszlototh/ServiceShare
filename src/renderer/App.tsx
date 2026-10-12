import { useState } from 'react';
import { ClipInfo, Document } from '@shared/types';

export function App() {
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [document, setDocument] = useState<Document>({ sourceFile: null, editList: [], historyIndex: -1 });

  const handleOpen = async () => {
    try {
      const info = await window.api.openFile();
      setClip(info);
      const doc = await window.api.getDocument();
      setDocument(doc);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px', borderBottom: '1px solid #ccc', display: 'flex', gap: '8px' }}>
        <strong>ServiceShare</strong>
        <button onClick={handleOpen}>Open</button>
        <button disabled>Export</button>
        <button disabled>Publish to YouTube</button>
      </header>

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
            {clip.sampleRate} Hz · {clip.bitDepth}-bit · {clip.channels === 1 ? 'mono' : 'stereo'} · {formatTime(clip.duration)} · undo: {Math.max(0, document.historyIndex + 1)} · redo: {Math.max(0, document.editList.length - (document.historyIndex + 1))} · READY
          </>
        ) : (
          <>No clip loaded · READY</>
        )}
      </footer>
    </div>
  );
}

function formatTime(s: number): string {
  if (isNaN(s) || s < 0) return '0:00.000';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}
