# 01 — Vision and Non-Goals

## Vision

ServiceShare is a small, focused desktop tool that lets a person turn a single WAV file into a
YouTube video without leaving the audio editor or touching a video tool.

The workflow is deliberately short:

1. Open a WAV file into the single-track editor.
2. Apply basic edits — trim, delete a region, fade in/out, gain/normalize, concatenate.
3. Export the result as WAV or MP3 — or publish it straight to YouTube.
4. Publishing: pick a cover image (or use the generated default), set title/privacy/metadata, and
   upload. The app composites the cover (title + logo), renders the audio to MP4, and uploads it.

## Target user

A non-technical content creator or hobbyist who records or receives a WAV, wants quick, competent
edits, and wants the result online — without learning a DAW or a video editor.

## In scope (summary)

- Open one WAV per session (session-only; no project file persisted).
- Five edit operations: **Trim**, **Cut region (delete)**, **Fade in/out**, **Gain/Normalize**,
  **Concatenate**.
- Undo/redo over the edit list.
- In-app playback and cached preview rendering.
- **Export** to WAV (source rate/depth) or MP3.
- **Publish** to YouTube: cover compositing, MP4 generation, OAuth sign-in, resumable upload,
  metadata, optional thumbnail.
- **Full distribution**: installers for Windows and macOS, macOS notarization, auto-update via
  GitHub Releases.

## Non-goals

These are explicit scope boundaries. Do not design, build, or test for them.

1. **Multi-track mixing** — exactly one audio track. No stereo-per-track composition, no buses.
2. **Advanced audio effects** — nothing beyond gain and fade. No EQ, compression, reverb, noise
   reduction, or filters.
3. **Audio recording** — the app edits existing files; it never captures from a microphone.
4. **Video editing / visual effects** — the published video is a static cover image plus the audio
   track. No video timeline, transitions, or overlays beyond the fixed cover compositing.
5. **Non-WAV editing** — the editable format is WAV (`pcm_s16le`/`pcm_s24le`). MP3 (and the AAC audio
   inside a published MP4) are output targets only; they are never decoded for editing.
6. **Audio plugins** — no VST/LADSPA/CLAP host.
7. **Monetization, analytics, or channel management** — publishing creates a new video; it does not
   manage channels, playlists, revenue, or community features beyond the fields a video requires.
8. **Batch** — one document per session; no file queues or bulk operations.

## Out-of-scope behavioural notes

- No user accounts beyond the YouTube sign-in used for publishing.
- No localization: the UI is English only (see `09`).
- No multi-account YouTube management; the app uses the account that signs in.