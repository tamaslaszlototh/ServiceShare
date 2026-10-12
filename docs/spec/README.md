# ServiceShare — Specification

Agent-ready specification for **ServiceShare**, a cross-platform (Windows + macOS) single-track
WAV audio editor that performs basic edits and publishes the result to YouTube.

- **Stack:** Electron + TypeScript + FFmpeg
- **Editor model:** single-track, non-destructive edit list
- **License:** GPL-3.0 (open source)
- **Distribution:** full — installers, code signing, auto-update

This directory is the destination deliverable of the wayfinder map (issue #1). It is normative:
another agent session can build the application from these files alone. Code is not written here.

## Reading order

| File | Covers |
| --- | --- |
| [01-vision-and-non-goals.md](01-vision-and-non-goals.md) | Product vision, target user, explicit in-scope summary, the eight non-goals. |
| [02-functional-requirements.md](02-functional-requirements.md) | Every feature with **Given/When/Then** acceptance criteria and the error/edge catalogue. |
| [03-architecture.md](03-architecture.md) | Process split, typed IPC, `Document` model, engines, temp staging, caching. |
| [04-audio-engine.md](04-audio-engine.md) | FFmpeg operation mapping, the single complex filtergraph, loudnorm, export/publish encodings. |
| [05-editor-ux.md](05-editor-ux.md) | The editor window (Variant A layout), interaction model, states, publish panel. |
| [06-youtube-publishing.md](06-youtube-publishing.md) | OAuth, token storage, cover compositing, MP4 generation, resumable upload, quota/errors. |
| [07-distribution.md](07-distribution.md) | electron-builder targets, signing/notarization, auto-update, SemVer, CI pipeline. |
| [08-testing-strategy.md](08-testing-strategy.md) | The four test layers, golden snapshots, audio goldens, env-gated YouTube tests, E2E. |
| [09-non-functional-requirements.md](09-non-functional-requirements.md) | Performance, security, privacy, reliability, logging, compliance. |

## Definition of done

The application is considered buildable when an agent can read `01` through `09` and implement a
version that satisfies every **acceptance criterion** in `02` under the strategy in `08`.