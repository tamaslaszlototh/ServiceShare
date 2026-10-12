# 03 — Architecture

Context decision (wayfinder #3): the application is architected around a **non-destructive edit
list**, owned and executed by the **main process**; the renderer is the UI only. See
`docs/adr/0001-non-destructive-edit-list-electron.md`.

## 3.1 Process split

```
┌──────────────────────────── renderer ────────────────────────────┐
│ UI (React/TS) · waveform · ruler · toolbar · panels · states      │
│   ⇕ typed IPC (contextBridge, preload-exposed API, no node in UI)│
└───────────────────────────────────────────────────────────────────┘
┌──────────────────────────── main ────────────────────────────────┐
│ Document session    Edit list  undo cursor                        │
│ Engine (FFmpeg spawn · temp staging · metadata via ffprobe)       │
│ Preview cache       Export         Publish MP4 mux                │
│ YouTube service (googleapis · OAuth · safeStorage · resumable)    │
│ Updater (electron-updater) · safeStorage                          │
└───────────────────────────────────────────────────────────────────┘
```

- **Main process** owns: file I/O, FFmpeg (resolve, spawn, parse), the preview cache, exports,
  MP4 muxing, cover compositing, all YouTube network calls, OAuth + token storage, auto-update.
- **Renderer** owns: rendering the waveform from decoded peak data, hit-testing/selection,
  transport commands, panels. It never calls Node APIs or spawns processes.
- IPC is **typed** (shared TS types): every channel has a request/response shape; errors arrive as
  structured `EngineError`-style envelopes, not strings.

## 3.2 Document & edit list

```ts
type EditOperation =
  | { kind: 'trim';        start: number; end: number }              // seconds (edited timeline)
  | { kind: 'cutRegion';   start: number; end: number }
  | { kind: 'fadeIn';      duration: number }
  | { kind: 'fadeOut';     duration: number }
  | { kind: 'gain';        db: number }
  | { kind: 'normalize' }
  | { kind: 'concatenate'; file: string }                            // appended after current end

interface Document {
  sourceFile: string;          // original WAV path (pcm_s16le/s24le)
  editList: EditOperation[];   // ordered; source-path of truth
  historyIndex: number;        // undo cursor into editList
}
```

- The edit list is the single source of truth for undo/redo **and** rendering.
- Undo/redo = move `historyIndex`; the effective list for any read/render is
  `editList[0..historyIndex)`.
- New edit after undo truncates redo (`editList.length = historyIndex + 1`).
- Session-only: the `Document` is never persisted.

## 3.3 Engine (FFmpeg)

Full recipes in `04`. Responsibilities:

1. **Resolve** the bundled FFmpeg (`ffmpeg-static` path in `extraResources`, `ffmpeg -version`
   probe, PATH fallback) — resolve once, cache.
2. **Compile** the effective edit list into a **single complex filtergraph** argument array.
3. **Run** renders (preview cache, exports, publish MP4) with an args array (never shells), parse
   `stderr`, enforce timeouts, report progress; stage output in a per-session temp directory that
   is cleaned on exit/cancel.
4. **Probe** (`ffprobe`) for metadata and waveform peak data.

## 3.4 Preview cache & playback

- Cache key = hash of `(sourceFile mtime, editList[0..historyIndex))`.
- Preview render = engine output to `pcm_s16le` at the session format, into the user data temp dir.
- Playback streams that cached WAV; seeking works across the edited timeline (the preview is the
  edited result, so edited-timeline coords map 1:1).
- Re-render only when the effective list (or source) changes.

## 3.5 YouTube service

- Wraps `googleapis`; holds OAuth state, performs silent refresh, exposes an
  `uploadVideo(...)` / `setThumbnail(...)` API with progress + cancel. Details in `06`.
- Tokens live in Electron `safeStorage` (OS keychain), not the repo, not plaintext disk.

## 3.6 IPC surface (normative shape, not exhaustive)

```ts
// renderer → main
openFile(p): Promise<ClipInfo>            | openFile
exportAudio(p, format): Pushable<Progress>
publish(publishRequest): Pushable<Progress>   // sign-in, metadata, cover path
signIn(): Promise<AccountInfo>; signOut(): Promise<void>
undo(); redo();
play(): Promise<void>; pause(); stop(position?): Promise<void>
checkForUpdates(): Promise<UpdateInfo>
```

`Pushable<T>` = stream of typed progress/error events ending in a terminal result; e.g. publish
streams `{stage: 'cover'|'render'|'upload'|'done', percent?: number}` then a `{kind:'ok', videoId}`
or `{kind:'err', code}`. All errors cross IPC as the structured codes from `02` §2.9.

## 3.7 Concurrency & temp lifecycle

- One render at a time (single FFmpeg decode/encode); concurrent requests queue.
- Temp assets (`*.wav`, `*.mp4`, upload session files) live under
  `<userData>/temp/`; wiped on clean exit and on cancel; `DiskFull` surfaced as `DiskFull`.

## 3.8 Licensing note

- The app is **GPL-3.0**. The bundled FFmpeg build is GPL-configured (includes `libx264`), which
  is license-compatible only because the distribution is GPL. Do not add closed-source components.
  (ADR 0002.)