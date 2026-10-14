# AGENTS.md

## Repo layout

- Workspace root (`.../Devs/ServiceShare`) **is** the repository. `origin` = `https://github.com/tamaslaszlototh/ServiceShare.git`; default branch `main`. Run `git` from here.

## Current state

- Electrofoundation: Electron + React + TS with typed IPC (main/preload/renderer/shared).
- Runtime FFmpeg resolution in the main process (`src/main/audio/ffmpeg.ts`): extraResources → ffmpeg-static/ffprobe-static dev fallback → PATH, with `-version` probing and caching.
- WAV open/probe (`src/main/audio/probe.ts`): `ffprobe` JSON → validate `pcm_s16le`/`pcm_s24le`; typed errors live in `src/main/core/errors.ts`; `openFile` returns a typed `OpenResult` (ok/cancelled/error).
- Cover compositing (`src/main/publishing/cover.ts`): pure `compileCover`/`escapeDrawtext` seam → `CoverService`; bundled assets (default base, logo, OFL font) under `assets/`, resolved by `src/main/publishing/assets.ts` (resources → dev fallback).
- Packaging (`package.json` `build`): Windows x64 NSIS is the only distributed artifact; macOS packages an unsigned dev-only `dir` app (ADR 0007). Ships `LICENSE`, FFmpeg licenses, `assets/` and the FFmpeg binaries via `extraResources`. `scripts/packaging/after-pack.cjs` rejects FFmpeg binaries that can't run on the packaged arch. About panel (`aboutPanelOptions` in `src/main/core/shell.ts`) states GPL-3.0.
- Auto-update (`src/main/updater/updater.ts`): `UpdateService` drives electron-updater's `autoUpdater` through a narrow `UpdaterPort`; status reaches the renderer via the `updateStatus` event. Unpackaged builds report `unsupported` (electron-updater skips the check). Publish config lives in `package.json` `build`.

## Build / test / typecheck

- Build: `npm run build` (vite renderer + `tsc` main/preload).
- Package: `npm run dist:win` (on Windows) / `npm run dist:mac` (local dev app) → `release/`. Releases: push a `v<version>` tag; see `docs/release.md`.
- Assets: `npm run gen:assets` regenerates `assets/images/{default-base,logo}.png` from the bundled FFmpeg (committed outputs).
- Test: `npm test` (vitest, layer-1 unit tests under `src/` and `scripts/`; no FFmpeg needed). Layer-2 audio goldens (real FFmpeg, `test/audio/**`) run via `npm run test:audio` and are excluded from `npm test`; they execute in CI on mac + win (`.github/workflows/audio-goldens.yml`).
- Typecheck: `npx tsc --project tsconfig.main.json --noEmit` (and the same for `tsconfig.preload.json` / `tsconfig.renderer.json` / `tsconfig.test.json`; the base is `tsconfig.json`). No linter configured.

## FFmpeg runtime resolution (ticket 02)

- deps: `ffmpeg-static`, `ffprobe-static` (runtime). Packaged builds stage the binaries at the resources root via `extraResources` and exclude both packages from `app.asar`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
