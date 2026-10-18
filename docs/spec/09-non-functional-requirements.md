# 09 — Non-Functional Requirements

## 9.1 Performance

- **Open & decode:** a 10-min 48 kHz/16-bit stereo WAV shows the waveform in ≤ 1.5 s on a
  mid-tier laptop (2019 Intel/Apple Silicon class).
- **Preview render:** first playback of an edited 10-min clip starts audio ≤ 2 s after play
  (cache thereafter, §4/§03.4).
- **Export:** duration-limited — a 10-min clip renders in ≤ 20 s wall-clock on the reference tier.
- **Publish render:** MP4 mux (cover + audio) adds ≤ 5 s over the audio render.
- UI never blocks on any main-process job (transparent non-modal progress; transport stays
  responsive except during active play).

## 9.2 Memory & disk

- Peak RSS ≤ 400 MB for a 10-min clip. Waveform peak data is decimated (never full-sample arrays).
- Temp staging under `<userData>/temp/`; cleaned on exit and cancel; a stale-temp sweeper removes
  files older than 7 days on launch.
- External FFmpeg processes are spawned with `stdio: ['ignore','pipe','pipe']` and killed on
  app quit.

## 9.3 Security

- **No secrets in the repo** — OAuth client/refresh tokens, `safeStorage` data, CSV in
  `userData`/keychain only; CI credentials are GitHub secrets (see `07`).
- Tokens are never logged; IPC payloads and logs redact anything matching `token|refresh|secret`.
- FFmpeg invoked with an **args array** (no shell interpolation); all user text
  (title/description/path) escaped for `drawtext`/shell contexts.
- The loopback OAuth server binds only to `127.0.0.1` with an ephemeral port per attempt.
- **Code-signing file-fuses** enabled where the Electron toolchain supports them; macOS is
  development-only and unsigned (see `07`, ADR 0007).
- Auto-update integrity: GitHub-provider TLS; on electron-builder v27 → Ed25519-signed manifests
  enforced fail-closed (`07` §7.6).

## 9.4 Reliability & error handling

- Root renderer unhandled-exception hooks: show a recoverable error banner, never a black window.
- FFmpeg timeouts: no limit on total run time (a long clip legitimately encodes for many
  minutes); FFmpeg reports progress every second and a run is killed only when it produces no
  output for 60 s → `EngineError`.
- Upload resilience: resumable upload + backoff (see `06`); crash mid-upload leaves the session
  restorable from the same temp MP4 on restart where the session still exists.
- All failures surface the catalogue codes from `02` §2.9 with an action, not a raw crash.

## 9.5 Privacy

- No analytics, telemetry, or crash reporting to third parties. Optional local logging only
  (off by default; redacted per §9.3).
- Publishing uploads only: the composed cover, the rendered MP4, and the metadata the user entered.
- Deleting `userData` (or signing out) removes all stored Google tokens.

## 9.6 Language & accessibility

- **UI language: English only.** No i18n in scope (see `01` non-goal list); all user-facing strings
  are English.
- WCAG-reasonable baseline: keyboard-operable controls, visible focus, contrast ≥ 4.5:1 for text,
  waveform replaced by numeric selection readout (see `05` §5.7).

## 9.7 Compliance

- **GPL-3.0** distribution (repo = corresponding source; license shipped). Bundled FFmpeg's
  components (libx264, libmp3lame, etc.) remain GPL-compatible; the app stays open-source.
- YouTube Data API **terms**: 100 uploads/day default; the app respects quota errors and does not
  bypass them. `notifySubscribers` uses API defaults.
- Platform sandboxes/permissions: macOS entitlements minimal (no user-selected folder access beyond
  standard open/save panels); Windows: no admin elevation required.

## 9.8 Logging

- Log format: timestamp, level, module, code. Debug level includes FFmpeg stderr tails (redacted);
  production info never includes tokens, paths, or user text beyond what is needed for support
  (codes + codes only).