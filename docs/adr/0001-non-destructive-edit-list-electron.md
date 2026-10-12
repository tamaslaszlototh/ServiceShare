# 0001: Non-destructive edit-list architecture on Electron

ServiceShare uses a non-destructive edit-list model: the source WAV is never mutated; edits are an ordered list of edit operations, and FFmpeg renders the composed chain only at preview/export/publish time. All FFmpeg/ffprobe invocation, file IO, and YouTube network traffic live in the Electron main process behind a typed IPC bridge, keeping the renderer to UI and waveform rendering.

Chosen over destructive in-place editing for lossless, simple undo (history cursor over the edit list) and over client-side sample playback for edit-accurate preview at low complexity. The editing session lives in memory only; there is no project file.