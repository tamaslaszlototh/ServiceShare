# AGENTS.md

## Repo layout

- Workspace root (`.../Devs/ServiceShare`) **is** the repository. `origin` = `https://github.com/tamaslaszlototh/ServiceShare.git`; default branch `main`. Run `git` from here.

## Current state

- Electrofoundation: Electron + React + TS with typed IPC (main/preload/renderer/shared).
- Runtime FFmpeg resolution in the main process (`src/main/ffmpeg.ts`): extraResources → ffmpeg-static/ffprobe-static dev fallback → PATH, with `-version` probing and caching.
- WAV open/probe (`src/main/probe.ts`): `ffprobe` JSON → validate `pcm_s16le`/`pcm_s24le`; typed errors live in `src/main/errors.ts`; `openFile` returns a typed `OpenResult` (ok/cancelled/error).

## Build / test / typecheck

- Build: `npm run build` (vite renderer + `tsc` main/preload).
- Test: `npm test` (vitest, layer-1 unit tests only; no FFmpeg needed).
- Typecheck: `npx tsc --project tsconfig.main.json --noEmit` (and the same for `tsconfig.preload.json` / `tsconfig.renderer.json` / `tsconfig.test.json`; the base is `tsconfig.json`). No linter configured.

## FFmpeg runtime resolution (ticket 02)

- deps: `ffmpeg-static`, `ffprobe-static` (runtime). electron-builder `extraResources` staging is ticket 18.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
