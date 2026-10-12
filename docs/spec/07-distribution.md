# 07 — Distribution

Decision context (wayfinder #11), verified in `research/electron-packaging`
(branch `research/electron-packaging`). See `docs/adr/0003-distribution-model.md`.

## 7.1 Tooling & targets

- **electron-builder** (pin to stable v26 today; migrate to v27 when released — see §7.6).
- Targets:

| Platform | Targets | Auto-update relevance |
| --- | --- | --- |
| macOS | `dmg` **+ `zip`** (both required), arch `x64` + `arm64` | Squirrel.Mac needs the zip |
| Windows | `nsis` (single installer), arch `x64` + `arm64` | NSIS is the auto-updatable installer |

- Build each architecture on matching runners; merge (mac) or emit per-arch artifacts.
- `extraResources`: the bundled FFmpeg/ffprobe binaries (`ffmpeg-static`, see `04`), the default
  cover base, fonts, and the app logo (transparent PNG/vector).

## 7.2 macOS signing & notarization (mandatory)

Notarization is a hard requirement for distribution since macOS 10.15; auto-update and
`safeStorage` both need a valid signature.

1. Apple Developer Program account ($99/yr).
2. **Developer ID Application** certificate; **Hardened Runtime** enabled (electron-builder
   default for standard builds).
3. Sign with `CSC_LINK` (`.p12`) + `CSC_KEY_PASSWORD`; **`forceCodeSigning: true`** so a missing
   identity fails the build instead of shipping unsigned.
4. **Notarize** with `notarytool` + `stapler` (Xcode 14+; `altool` is retired). Authenticate with
   an **App Store Connect API key** (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_KEY_ISSUER`)
   — recommended over app-specific passwords.
5. Notarization runs <1 h normally; ~75/day cap.

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
- Configure `publish` in electron-builder config; builder emits `latest.yml` (Windows) /
  `latest-mac.yml` (macOS). **Set `owner` and `repo` explicitly** in the `publish` config to defend
  against repo-rename squatters.
- App: `autoUpdater.checkForUpdatesAndNotify()` on launch; download shows progress (see `05` §5.5);
  Windows installs on quit; macOS Squirrel.Mac stages and applies on relaunch.
- Channel selection follows the build's version (pre-release suffix → matching channel, §7.5).

## 7.5 Versioning & release pipeline

- Source of truth: `package.json` `version`.
- **SemVer with channels**: stable `vX.Y.Z`; pre-releases `vX.Y.Z-alpha.N` / `-beta.N` route into
  alpha/beta channels (supports staged rollouts via `stagingPercentage`).
- Tag naming: `v` + version.
- **GitHub Actions** pipeline:
  - `mac` job on a `macos-*` runner: install, build, sign+notarize, `electron-builder --publish
    onTag` for the selected channel.
  - `win` job on a `windows-*` runner: build (unsigned), `--publish onTag`.
  - Triggered by pushing a tag `v*`.
  - Secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY*`, `GH_TOKEN` (contents: write).
  - Flow: maintainer creates a draft release from the tag; CI attaches artifacts and metadata; the
    release is published when ready. A version commit/tag bumps `package.json`.
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