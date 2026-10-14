# 02 — Functional Requirements

Normative feature list. Each requirement carries **acceptance criteria** written as
**Given / When / Then** sentences with a verifiable measure (per ADR/wayfinder decision #4).
"AC" blocks are the acceptance contract for the implementing agent.

Terminology follows `CONTEXT.md` (Clip, Selection, Edit Operation, Edit List, Export, Publish,
Cover Image).

## 2.1 App lifecycle & document

**FR-1 — Launch and empty state.**
- Empty state on launch: no clip loaded, no transport commands available, "Open" prominent.

**FR-2 — Open WAV.**
- File picker accepts `.wav` (and `.wave`). Decodes the header via `ffprobe`.
- Supported encodings: PCM `pcm_s16le` / `pcm_s24le`. Anything else is rejected with a clear
  message ("FormatError").
- Load meter: total duration, sample rate, bit depth, channels shown in the status strip.

**FR-3 — Session-only document.**
- A `Document = { sourceFile, effectiveEditList, canUndo, canRedo, undoCount, redoCount }` exists only in memory.
- No project file is written or offered; "Save" is not a feature. Closing the window discards edits.

**FR-4 — One clip per session.**
- Opening a new file replaces the current clip (after confirming when edits exist).

### AC
- **G** a valid 16-bit WAV; **W** the user opens it; **T** the clip is loaded, duration appears in
  the status strip, ruler spans the duration, and no edit is possible before load completes.
- **G** a 24-bit WAV; **W** the user opens it; **T** it loads with bit depth "24-bit" shown and no
  "FormatError".
- **G** an MP3; **W** the user opens it; **T** it is rejected with "FormatError: only PCM WAV is
  editable" and the editor stays empty.

## 2.2 Selection & playback

**FR-5 — Selection.**
- A selection is a time region of the current clip in seconds/samples; the user can create one over
  the ruler/waveform and adjust its edges. Zero-length selection behaves as "cursor".
- Selection display in the status strip (HH:MM:SS start→end).

**FR-6 — Playback & transport.**
- Transport controls: play/pause, stop, position. Playback renders the current edited audio
  (the start of the **preview render**, see FR-7) and streams from the cached WAV.
- Stop returns the cursor to the play-start position; seeking seeks through the edited timeline.

### AC
- **G** a clip with a cut region; **W** the user plays across the cut; **T** playback is continuous
  with no gap/glitch and the position continues on the edited timeline (no jump to source time).
- **G** any clip; **W** the user drags on the ruler; **T** a selection with live start/end appears
  in ≤50 ms from pointer settle and the strip updates.

## 2.3 Preview rendering

**FR-7 — Cached preview.**
- The rendered edited audio is cached as a temp WAV keyed by the edit list (hash). Re-render only
  when the edit list changes since the last render.
- The preview render uses the engine pipeline (04) with the same semantics as export.

### AC
- **G** a freshly trimmed clip; **W** the user starts playback; **T** the preview is written before
  audio starts (spinner ≤ 2 s for a 10-min clip) and the same render is reused for the next play.
- **G** an unchanged clip; **W** the user toggles play twice; **T** the preview temp file's
  mtime/hash is identical after both plays (no re-render trace in logs).

## 2.4 Edit operations

**FR-8 — Trim.**
- Trim removes audio outside the current selection; the selection becomes the (new) whole clip.

**FR-9 — Cut region (delete).**
- Deletes the audio inside the selection; left and right parts are joined. Equals the
  two-`atrim`-leg `concat` engine recipe.

**FR-10 — Fade in / fade out.**
- Applies an `afade` at the clip start (in) or end (out) with a user-specified duration in
  seconds (0.5–10, default 2). Applied to the current selection if one exists, else the whole clip.
- Multiple fades are legal; each is a separate edit-list entry.

**FR-11 — Gain / Normalize.**
- **Gain:** apply a fixed amplitude dB change (range −30…+30 dB).
- **Normalize:** two-pass `loudnorm` to `I = −16 LUFS`, `TP = −1.5 dBTP`, `LRA = 11 LU`
  (linear mode; measured values from the first pass). Replaces all prior manual gain on the chain.

**FR-12 — Concatenate.**
- Appends a second WAV file (same format family) after the current clip; the common format for the
  chain becomes the **first segment's** sample rate + channel layout; the second segment is
  resampled to match.

Every operation appends to the edit list and creates one undo step.

### AC (per operation)
- **G** a clip with a selection; **W** the user trims; **T** the edited duration equals the
  selection length ±5 ms (audio-golden measure) and undo restores the original length.
- **G** a clip with a mid selection; **W** the user cuts; **T** the resulting duration equals
  original − selection ±5 ms, there is no transient artifact at the join (metric: inter-sample
  delta ratio ≤ tolerance, see `08`), and the source regions are untouched in source time.
- **G** a clip; **W** the user fades in 2 s; **T** the first 2 s decay −6 dB/s (linear-in-dB) to
  silence at t0 and the rest is unchanged ±0.05 LU (audio-golden).
- **G** a quiet clip (average < −25 LUFS); **W** the user normalizes; **T** the output measures
  I = −16 LUFS ±0.5 and TP ≤ −1.5 dBTP, and a second normalize run is idempotent (±0.1 LU).
- **G** two matching WAVs; **W** the user concatenates; **T** the final duration equals the sum
  ±5 ms, and the second segment plays at the first segment's sample rate/channels (ffprobe check).

## 2.5 Undo / redo

**FR-13 — Undo/redo over the edit list.**
- Undo moves the Edit List cursor back and re-renders semantics from the source through the truncated
  list; redo restores. Redo is cleared on a new edit.
- Icon/keys: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y).

### AC
- **G** a clip with three edits; **W** the user presses undo three times; **T** each step returns
  the rendered duration to the previous state in turn and the last undo returns to the source
  duration; redo only after undo, and a new edit after undo clears redo.

## 2.6 Export

**FR-14 — Export formats.**
- **WAV:** keeps the session's source sample rate, bit depth (s16/s24), and channel layout.
- **MP3:** `libmp3lame`, 192 kbps, stereo down-mix if needed, 44.1/48 kHz kept (source kept).
- Export runs in the main process, non-blocking, with progress.

### AC
- **G** a 24-bit 96 kHz clip; **W** the user exports WAV; **T** the file is `pcm_s24le`, 96 kHz,
  same channels (ffprobe), duration correct ±5 ms.
- **G** the same clip; **W** exports MP3; **T** the file is MP3 192 kbps, duration correct, and the
  loudness difference vs the source edit is ≤1 LU (audio-golden).

## 2.7 Publish

Referenced from `06`; the AC below is the top-level contract.

**FR-15 — Publish to YouTube.**
- Flow: sign-in (if needed) → cover → metadata → render+upload, with progress and cancel.
- The final artifact is a new YouTube video (`privacyStatus` default **Unlisted**).

### AC
- **G** a signed-in account; **W** the user publishes an edited clip with a chosen cover title
  "My Clip"; **T** a video appears on the channel within 2 minutes of upload completion with the
  given title, the chosen metadata, and `Unlisted` privacy (verified via channel API), and the MP4
  that was uploaded plays back the edited audio with the cover composited (logo + title visible).
- **G** a signed-in account; **W** the user publishes with no cover image; **T** the default cover
  base is used with the title + logo composited (MP4 golden: 1280×720, yuv420p, `-shortest`).
- **G** a publication in progress; **W** the user presses cancel; **T** the request is aborted, the
  temp MP4 and upload session are cleaned, and the app reports "Publish cancelled".

## 2.8 Auto-update (app level)

**FR-16 — Update check.**
- On launch (and via a manual "Check for updates…" item) the app contacts GitHub Releases via
  `electron-updater`, downloads updates and installs them on quit (Windows NSIS). Channel follows the current build's pre-release tag.

### AC
- **G** an installed build older than the newest release/selected channel; **W** launch; **T** a
  badge/notification offers the update, the download shows progress, and the app relaunches into
  the new version (version string changes across a restart).
- **G** the newest build; **W** manual check; **T** "You're up to date".

## 2.9 Error / edge-case catalogue

Emitted by the renderer/main and surfaced as in-app messages (see `05` for presentation). This list
is normative for handling; implementations may reuse codes.

| Code | Condition | Behaviour |
| --- | --- | --- |
| `FormatError` | Non-PCM WAV or unsupported file | Reject open; editor persists in current state. |
| `CorruptFile` | Unreadable header / truncated data | Standard error message + details, no crash. |
| `PermissionError` | Input/output file not readable/writable | Message with path; no silent fallback. |
| `DiskFull` | Temp/export target full | Abort operation cleanly, suggest freeing space. |
| `EngineError` | FFmpeg unavailable at runtime | Message "FFmpeg not found" + re-check button (PATH fallback). |
| `RenderError` | FFmpeg returned non-zero for a render | Show the last stderr lines (sanitised), no crash. |
| `NetworkError` | Upload lost connectivity (5xx/timeouts) | Exponential backoff retries; persistent failure = explicit "Retry". |
| `QuotaExceeded` | Videos-upload quota gone (100/day) | Message + link to quota docs; nothing retried automatically. |
| `AuthRevoked` | Refresh token invalid/revoked | Drop to sign-in screen, re-auth silently. |
| `UploadExpired` | Session URI 404 (expired) | Restart upload from the temp MP4. |
| `TooLong` | Video > 15 min (needs verified account) | Pre-emptive warning before upload; still allow the attempt. |
| `UnverifiedProject` | YouTube restricts unverified-project uploads | Show on publish; verify empirically at first real upload (see `06`). |