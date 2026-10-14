# ServiceShare

Desktop WAV editor with YouTube publishing. Licensed under the [GNU GPL-3.0](LICENSE); this
repository is the corresponding source for every released build.

## Packaging

`npm run dist:mac` / `npm run dist:win` build the app and package it with electron-builder into
`release/` (config: `package.json` → `build`):

- **macOS**: `dmg` + `zip` (the zip feeds Squirrel.Mac auto-update), `x64` + `arm64`.
- **Windows**: `nsis` installer, `x64` + `arm64`, unsigned (`verifyUpdateCodeSignature: false`).

Every package ships `LICENSE`, the FFmpeg license notes (`licenses/`), the bundled cover assets
(`assets/`) and the FFmpeg/ffprobe binaries at the resources root.

**Build each architecture on a matching runner.** `ffmpeg-static` downloads FFmpeg for the host
only, so pass the arch explicitly (`npm run dist:mac -- --arm64`, `-- --x64`). An `afterPack`
hook (`scripts/packaging/after-pack.cjs`) fails the build if a bundled binary cannot run on the
packaged arch. x64 binaries are accepted in arm64 packages because Rosetta / Windows on Arm run
them. Windows always ships x64 FFmpeg, and `ffprobe-static` only has an x64 macOS ffprobe.

## Signing and notarization

Builds are unsigned until credentials are provided. electron-builder picks these up from the
environment:

| Variable | Purpose |
| --- | --- |
| `CSC_LINK` | Developer ID Application certificate (`.p12` path or base64) |
| `CSC_KEY_PASSWORD` | Password for `CSC_LINK` |
| `APPLE_API_KEY` | Path to the App Store Connect API key (`AuthKey_XXXX.p8`); enables notarization |
| `APPLE_API_KEY_ID` | That key's ID |
| `APPLE_API_ISSUER` | That key's issuer ID |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Future Windows OV certificate (not used yet) |

macOS signing uses the Hardened Runtime with `build/entitlements.mac.plist`. `forceCodeSigning`
is `false` by default so local builds work. Release builds should turn it on so that a missing
identity fails the build instead of shipping unsigned:

```sh
npm run dist:mac -- --arm64 -c.mac.forceCodeSigning=true
```

See `docs/spec/07-distribution.md` and ADRs 0002/0003.
