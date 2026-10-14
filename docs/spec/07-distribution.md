# 07 — Distribution

Decision context (wayfinder #11), verified in `research/electron-packaging`
(branch `research/electron-packaging`). See `docs/adr/0003-distribution-model.md`.

## 7.1 Tooling & targets

Users are on Windows only (see `docs/adr/0007-windows-only-distribution.md`).

- **electron-builder** (pin to stable v26 today; migrate to v27 when released — see §7.6).
- Targets:

| Platform | Targets | Purpose |
| --- | --- | --- |
| Windows | `nsis` (single installer), arch `x64` | The only distributed artifact; NSIS is the auto-updatable installer. Windows on Arm runs it under emulation. |
| macOS | `dir` (unsigned `.app`), host arch | Development only: lets the maintainer run a packaged build locally. Never published. |

- `extraResources`: the bundled FFmpeg/ffprobe binaries (`ffmpeg-static`, see `04`), the default
  cover base, fonts, the app logo, `LICENSE` and the FFmpeg license notes.

## 7.2 macOS (development only)

macOS builds are unsigned and stay on the maintainer's machine, so there is no Developer ID
certificate, Hardened Runtime or notarization. If macOS is ever distributed, follow the signed and
notarized dmg + zip setup in `docs/adr/0003-distribution-model.md`. Auto-update and `safeStorage`
need a valid signature there.

## 7.3 Windows signing (deferred / unsigned for now)

- Current state: **unsigned Windows builds**. Consequences accepted by decision:
  - SmartScreen shows "Unknown publisher" on first run; **Smart App Control may block** the
    installer on fresh Windows 11 machines.
  - `win.verifyUpdateCodeSignature` must be **`false`** while builds are unsigned
    (the default `true` would refuse unsigned update packages).
- **Documented trust path** (re-enable later, not part of the minimal build): an **OV certificate**
  (~$150–300/yr) with `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`, which re-enables
  `verifyUpdateCodeSignature: true` and builds SmartScreen reputation over time. (EV no longer
  bypasses SmartScreen since 2024; Azure Artifact Signing ~$9.99/mo, individuals only US/CA.)

## 7.4 Auto-update (electron-updater + GitHub Releases)

- `electron-updater` with the **GitHub** provider (repo is public → no end-user token).
- Configure `publish` in electron-builder config; builder emits `latest.yml`; pre-release
  versions are published as GitHub pre-releases. **Set `owner` and `repo` explicitly** in the `publish` config to defend
  against repo-rename squatters.
- App: `autoUpdater.checkForUpdatesAndNotify()` on launch; download shows progress (see `05` §5.5);
  Windows installs on quit.
- Channel selection follows the build's version (pre-release suffix → matching channel, §7.5).

## 7.5 Versioning & release pipeline

- Source of truth: `package.json` `version`.
- **SemVer with channels**: stable `vX.Y.Z`; pre-releases `vX.Y.Z-alpha.N` / `-beta.N` route into
  alpha/beta channels (supports staged rollouts via `stagingPercentage`).
- Tag naming: `v` + version.
- **GitHub Actions** pipeline (`.github/workflows/build.yml`):
  - `test` job on every PR and push to `main`: typecheck + layer-1 unit tests (layer-2 audio
    goldens run in `audio-goldens.yml` on mac + win).
  - `release` job on a `windows-*` runner, triggered by pushing a tag `v*`: checks that the tag
    matches `package.json` `version`, tests, builds (unsigned), then
    `electron-builder --win --x64 --publish onTag`.
  - Secrets: `GOOGLE_OAUTH_CREDENTIALS` (the Desktop OAuth client's `credentials.json`, bundled into
    the installer; the job fails without it, ADR 0008) and the built-in `GITHUB_TOKEN`
    (`contents: write`), passed as `GH_TOKEN`.
  - Flow: bump `package.json` `version` in a commit, tag it `v<version>`, push the tag. CI creates
    a **draft** release (pre-release for `-alpha`/`-beta` versions), then electron-builder uploads
    the installer and update metadata into it; the maintainer runs the smoke
    checklist (`docs/release.md`) and publishes it. Updaters only see published releases.
- `publishConfig`: explicit `repository` + owner/repo (see above).

## 7.6 electron-builder v27 transition notes

Planned (unreleased at spec time; treat as migration, not current scope):

- **Mandatory Ed25519-signed update manifests** (`latest*.yml`) — plan to configure an update
  signing key and treat unsigned-manifest releases as **fail-closed** on clients.
- Implicit publishing removed — keep explicit `--publish onTag|never`.
- `disableWebInstaller` defaults to `true`; `autoInstallEvent` default `onQuit`.

## 7.7 GPL-3.0 compliance reminder

Because the distributed artifact bundles GPL-configured FFmpeg (`libx264`), the whole app source is
offered under **GPL-3.0**. The GitHub repo is the corresponding source; ship the license with the
installer and the in-app About dialog.