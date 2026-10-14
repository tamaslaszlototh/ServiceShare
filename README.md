# ServiceShare

Desktop WAV editor with YouTube publishing. Licensed under the [GNU GPL-3.0](LICENSE); this
repository is the corresponding source for every released build.

## Packaging

ServiceShare is distributed for **Windows x64 only**; macOS is a development platform (see
`docs/adr/0007-windows-only-distribution.md`). electron-builder config lives in `package.json` →
`build`:

- `npm run dist:win` → `release/ServiceShare-Setup-<version>.exe`, an unsigned NSIS installer
  (`verifyUpdateCodeSignature: false`). Build it on Windows: `ffmpeg-static` downloads FFmpeg for
  the host only.
- `npm run dist:mac` → an unsigned `release/mac-<arch>/ServiceShare.app` for local testing.

The app icon is `build/icon.png` (512×512; source `build/icon.svg`). electron-builder turns it into the
Windows `.ico` (16–256 px) and the macOS `.icns`.

Every package ships `LICENSE`, the FFmpeg license notes (`licenses/`), the bundled cover assets
(`assets/`) and the FFmpeg/ffprobe binaries at the resources root. An `afterPack` hook
(`scripts/packaging/after-pack.cjs`) fails the build if a bundled binary cannot run on the
packaged arch. x64 binaries are accepted in arm64 packages because Rosetta runs them;
`ffprobe-static` only has an x64 macOS ffprobe.

## Releasing

Push a `v<version>` tag matching `package.json` and CI builds a draft GitHub Release. See
[docs/release.md](docs/release.md) for the steps and the smoke checklist.

The release job bundles the app's Google OAuth client into the installer from the
`GOOGLE_OAUTH_CREDENTIALS` repository secret (ADR 0008). For local development, put a
`credentials.json` in `~/.config/serviceshare/` or point `SERVICESHARE_CREDENTIALS` at one.

Windows builds are unsigned, so users see a SmartScreen "Unknown publisher" warning on first
install. The documented fix is an OV code-signing certificate, provided as the `WIN_CSC_LINK` /
`WIN_CSC_KEY_PASSWORD` repository secrets; `win.verifyUpdateCodeSignature` can then be turned
back on.
