# Packaging, Signing & Auto-Updating a Cross-Platform Electron App (Windows + macOS), 2026

Research question: current best practices for packaging, code signing/notarization, auto-update, versioning/release pipeline, and repo public-vs-private concerns for an Electron desktop app targeting Windows and macOS.

Scope note: every claim below is linked to its primary source. The electron-builder documentation site is currently serving the **`next (v27)`** docs and explicitly warns they are unreleased; the current stable release is **v26** (npm `electron-builder@26.15.3`, `publishConfig.tag: next`). v27-specific behavior is flagged where relevant. See [Uncertainties](#uncertainties--confidence-notes).

---

## 1. Build / packaging tooling

### The two first-party options

- **Electron Forge** is Electron's officially recommended all-in-one tool: "an all-in-one tool for packaging and distributing Electron applications ... complete with code signing, installers, and artifact publishing," built by combining `@electron/packager`, `@electron/osx-sign`, `@electron/notarize`, `@electron/windows-sign`, makers and publishers, with a plugin API ([Electron Forge Getting Started](https://www.electronforge.io/)). Electron's own docs steer users to Forge ("The easiest and officially supported one" for distribution is via Forge/Packager + Squirrel, [Electron – Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)); Electron's code-signing guide documents Forge first for both macOS and Windows signing ([Electron – Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)).
- **electron-builder** is a long-standing "complete solution to package and build a ready-for-distribution Electron app," producing installers, portable builds and archives for macOS/Windows/Linux, with `electron-updater` and code signing baked in ([electron-builder overview](https://www.electron.build/)).

Both are mature and widely used; the choice is largely ecosystem preference. Forge is the Electron org's first-party pipeline; electron-builder has the more batteries-included Windows (NSIS) installer and `electron-updater` story. There is no primary source declaring one universally "recommended in 2026"; pick based on which installer/updater model you want.

### Windows installers (NSIS)

- **electron-builder**: the default Windows target is `nsis` (the `target` list also includes `nsis-web`, `portable`, `appx`, `msix`, `msi`, `msi-wrapped`, `squirrel`, archives) — see [`win.target` docs](https://www.electron.build/docs/win). NSIS is auto-updatable out of the box ([Auto Update – auto-updatable targets](https://www.electron.build/docs/features/auto-update)).
- **Electron Forge**: uses **`@electron-forge/maker-squirrel`** (Squirrel.Windows) and **`@electron-forge/maker-wix`** (WiX MSI) as the Windows makers ([Electron Forge – Makers](https://www.electronforge.io/config/makers)). Note electron-builder explicitly states **Squirrel.Windows is not supported** by its simplified updater and points users to NSIS ([Auto Update](https://www.electron.build/docs/features/auto-update)).

Package-config snippets (electron-builder `package.json` `build`):
```json
{ "win": { "target": "nsis" } }
```

### macOS installers (dmg)

- **electron-builder**: macOS targets are `dmg`, `zip`, `pkg`, `mas`, `mas-dev`, `7z`/`tar.*`, `dir`; the **default is `dmg` + `zip`** and both are required for Squirrel.Mac auto-update ("Squirrel.Mac auto update mechanism requires both `dmg` and `zip` to be enabled ... Disabling `zip` will break auto update in `dmg` packages") ([macOS docs](https://www.electron.build/docs/mac)).
- **Electron Forge**: uses **`@electron-forge/maker-dmg`** and **`@electron-forge/maker-zip`** (ZIP is needed for macOS auto-update) ([Electron Forge – Makers](https://www.electronforge.io/config/makers); [Electron – Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)).

Architectures: electron-builder supports `x64`, `arm64` and `universal` (fat binary) for macOS; it recommends building each arch on matching hardware and merging ([macOS – Architecture Support](https://www.electron.build/docs/mac)).

---

## 2. Code signing

### macOS: Developer ID signing + notarization

Required pieces (all primary, Apple + Electron + electron-builder/Forge):

1. **Apple Developer Program membership** — **$99/year** (individual or organization membership) ([Apple Developer Program](https://developer.apple.com/programs/)).
2. **Certificate type**: for distribution outside the Mac App Store you sign with a **Developer ID Application** certificate (a `Developer ID Installer` cert is used for `.pkg` installers; `Apple Distribution`/`Mac App Distribution` are for the Mac App Store). All Apple certificates require the Developer Program ([Apple – Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution); [electron-builder – Certificate Types](https://www.electron.build/docs/features/code-signing/); [Electron Forge – macOS signing](https://www.electronforge.io/guides/code-signing/code-signing-macos)).
3. **Hardened Runtime** must be enabled for notarization (electron-builder default is `true` for standard builds, `false` for MAS) ([Apple – Prepare your software for notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution); [electron-builder – Hardened Runtime](https://www.electron.build/docs/mac)).
4. **Notarization is mandatory**: "Beginning in macOS 10.15, all software built after June 1, 2019, and distributed with Developer ID must be notarized" ([Apple](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)). macOS 10.15+ apps distributed outside the Mac App Store need to be **both code signed and notarized** ([Electron Forge – macOS signing](https://www.electronforge.io/guides/code-signing/code-signing-macos); [electron-builder – Code Signing](https://www.electron.build/docs/features/code-signing/)).
5. **Tooling is now `notarytool` + `stapler`** — `altool` and Xcode ≤13 stopped being accepted by the notary service on **November 1, 2023**; use `notarytool` (Xcode 14+) and attach the ticket with `xcrun stapler staple` ([Apple – Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution); [Apple – Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)).

**Notarization credentials** (three supported auth modes): app-specific password (`APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`), an **App Store Connect API key** (`APPLE_API_KEY` / `_ID` / `_ISSUER`), or a stored keychain profile (`APPLE_KEYCHAIN_PROFILE`). electron-builder recommends the API-key option "for security reasons" ([electron-builder – notarize option](https://www.electron.build/docs/mac)); Forge documents all three ([Forge – macOS signing](https://www.electronforge.io/guides/code-signing/code-signing-macos)). Notarization normally completes in under an hour (Apple: most within 5–15 minutes), and Apple limits submissions to **75 per day** ([Apple – Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)).

**Signing identity** in CI is provided via `CSC_LINK` (base64 or path/URL to a `.p12`) + `CSC_KEY_PASSWORD` ([electron-builder – Environment Variables](https://www.electron.build/docs/features/code-signing/)). Set `forceCodeSigning: true` so a missing identity fails the build instead of silently shipping unsigned ([electron-builder – forceCodeSigning](https://www.electron.build/docs/features/code-signing/)).

### Windows: Authenticode signing (OV vs EV vs cloud)

- **Signing is recommended, not strictly required**: unsigned apps trigger SmartScreen ("Unknown publisher") and may be blocked by Smart App Control; signing shows the publisher name but **does not by itself guarantee an instant no-warning first run** ([electron-builder – Code Signing](https://www.electron.build/docs/features/code-signing/); [Microsoft – SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
- **Microsoft now recommends, for non-Store distribution, Azure Artifact Signing (formerly "Azure Trusted Signing")** — a cloud signing service at **~$9.99/month**, no hardware token, integrates with CI (GitHub Actions, Azure DevOps), identity validation required ([Microsoft – Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)). Microsoft's table:
  - Azure Artifact Signing: ~$9.99/month; orgs in USA/Canada/EU/UK, **individuals only USA/Canada**; SmartScreen reputation builds over time (initial warnings expected); not Store-eligible.
  - **OV certificate**: **$150–300/year** from a CA (DigiCert/Sectigo/GlobalSign); worldwide; same SmartScreen behavior as Azure.
  - **EV certificate**: **$400+/year**; **"no longer recommended specifically for SmartScreen bypass"** because EV no longer grants an instant bypass as of 2024.
  - **Microsoft Store (MSIX)**: free, Microsoft re-signs, no SmartScreen warnings — recommended for most new apps; but MSI/EXE installers submitted to the Store must still be publisher-signed.
- **Since June 2023, certificate private keys must live on FIPS 140 Level 2 / Common Criteria EAL 4+ (or equivalent) hardware** — so software-based OV certs are gone; certificates come as USB tokens or cloud/HSM signing services ([Electron – Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing); [Electron Forge – Windows signing](https://www.electronforge.io/guides/code-signing/code-signing-windows)).
- **EV no longer bypasses SmartScreen (behavior removed in 2024)** — Microsoft and electron-builder both state this explicitly ([Microsoft – SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation); [Microsoft – Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options); [electron-builder – Windows certificate table](https://www.electron.build/docs/features/code-signing/)).
- **CI-compatible signing backends** in electron-builder v27 use a single `win.sign` discriminated union: `signtool` (local `.pfx`/cert store — the default), `hsm` (hardware token on Windows), `pkcs11` (hardware token on macOS/Linux via `osslsigncode`), or `azure` (Azure Artifact/Trusted Signing); env vars `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` (or `AZURE_TENANT_ID`/`_CLIENT_ID`/`_CLIENT_SECRET` for Azure) ([electron-builder – win.sign](https://www.electron.build/docs/win); [electron-builder – Code Signing](https://www.electron.build/docs/features/code-signing/)).

For electron-forge, signing is done at the **Make** step; Squirrel/MSI makers take `certificateFile`/`certificatePassword` (traditional), or a `windowsSign` object (Azure/`@electron/windows-sign`) ([Forge – Windows signing](https://www.electronforge.io/guides/code-signing/code-signing-windows)).

### Cross-cutting

- Electron's `@electron/windows-sign`, `@electron/osx-sign`, `@electron/notarize` are the shared primitives used under the hood by both Forge/Packager and (for signing) compatible with electron-builder ([Electron – Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)).
- Signing matters beyond the launcher dialog: macOS `safeStorage`, `app.setLoginItemSettings`, the `cookieEncryption` fuse and **`autoUpdater` (Squirrel.Mac) all require a valid code signature** ([Electron – macOS APIs that require code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)).

---

## 3. Auto-update

### Model A — electron-updater (electron-builder)

- Auto updates are handled by the **`electron-updater`** package (a richer alternative to Electron's built-in `autoUpdater`): it supports Linux too, validates code signatures on **both** macOS and Windows, generates/publishes all metadata automatically, supports download progress, staged rollouts, and multiple providers — **GitHub Releases, S3, DigitalOcean Spaces, Cloudflare R2, Keygen, and generic HTTP(S)** ([electron-builder – Auto Update](https://www.electron.build/docs/features/auto-update)).
- **Auto-updatable targets**: macOS DMG, Linux AppImage/DEB/Pacman/RPM, **Windows NSIS** ([Auto Update](https://www.electron.build/docs/features/auto-update)).
- How it works: configure `publish` → build creates `latest.yml` (Windows) / `latest-mac.yml` (macOS) / `latest-linux.yml`, uploads artifacts + metadata (except generic server) → app calls `autoUpdater.checkForUpdatesAndNotify()`; electron-builder writes `app-update.yml` into the packaged app (do **not** call `setFeedURL`) ([Auto Update – Quick Setup](https://www.electron.build/docs/features/auto-update)).
- **macOS requires code signing for auto-update to work** ([Auto Update](https://www.electron.build/docs/features/auto-update); [Electron – Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)). On macOS, **Squirrel.Mac** stages the update natively and applies it on relaunch (no killable installer process) ([Auto Update – Install on next launch](https://www.electron.build/docs/features/auto-update)).
- On **Windows/NSIS**, updates are Authenticode-verified before install by default (`verifyUpdateCodeSignature: true`); the resolved publisher name is embedded in `app-update.yml` and the downloaded installer's certificate subject must match, else the update is refused ([electron-builder – win.verifyUpdateCodeSignature](https://www.electron.build/docs/win)).

### Model B — Electron's built-in autoUpdater + Squirrel

- Electron's docs call the built-in Squirrel framework + `autoUpdater` "the easiest and officially supported one"; the free **update.electronjs.org** service works for **public GitHub repos** (macOS/Windows, code-signed on macOS) via `update-electron-app` ([Electron – Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)).
- Alternatively, publish metadata to static storage (SQS/S3 style) and point `update-electron-app` (or `autoUpdater`) at it; or run your own Squirrel-compatible server (Hazel, Nuts, electron-release-server, Nucleus) ([Electron – Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)).
- macOS uses a `releases.json`/`latest-mac`-style manifest and a ZIP; Windows uses the Squirrel `RELEASES` file and `.nupkg` delta packages ([Electron – Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)).

### Publishing updates (GitHub Releases)

- **electron-builder**: publishing must be explicitly requested in v27 — `--publish always|onTag|onTagOrDraft|never` — and **implicit (auto-detected) publishing was removed in v27** (it existed in v26 and earlier) ([electron-builder – publish](https://www.electron.build/docs/publish), [GitHub options](https://www.electron.build/docs/publish)). Auth via `GH_TOKEN` (or `GITHUB_TOKEN`); a separate `GITHUB_RELEASE_TOKEN` can be used for write access while keeping `GITHUB_TOKEN` read-only. Recommended flow: draft a release/tag `v<version>` and let CI attach/update artifacts, then publish ([electron-builder – Recommended GitHub Releases Workflow](https://www.electron.build/docs/publish)).
- **Electron Forge**: `@electron-forge/publisher-github` uploads artifacts to GitHub Releases; authenticate with `GITHUB_TOKEN` (needs **write** repo contents; in Actions grant `permissions: contents: write`) ([Forge – GitHub Publisher](https://www.electronforge.io/config/publishers/github)).
- **v27 notable security addition — signed update manifests**: electron-builder now **requires** each `latest*.yml` to be Ed25519-signed (`updateManifest`); publishing a build that emits update metadata fails unless a signing key resolves; `updateManifest: false` is the only opt-out. electron-updater verifies the signature **before any download**. Signing is required, and once a release embeds a public key its installs are **fail-closed** — an unsigned manifest is rejected ([electron-builder – Signed Update Manifests](https://www.electron.build/docs/features/signed-update-manifests)).
- Other v27 update-security changes: `AppUpdater.disableWebInstaller` now defaults to **`true`**; `autoInstallEvent` can be `"manual" | "onQuit" | "onNextLaunch"` (default `"onQuit"`, planned to default to `"onNextLaunch"` in v28) to avoid session-end install corruption; the `latest*.yml` metadata default format changed and legacy `sha2`-only metadata is deprecated (rejected in v28) ([electron-builder – Auto Update](https://www.electron.build/docs/features/auto-update), [Compatibility](https://www.electron.build/docs/features/auto-update)).

---

## 4. Versioning & release pipeline

- **Version source of truth**: the app's `package.json` `version`; the GitHub release tag should match it, `v`-prefixed by default (`v1.2.3`). electron-builder's GitHub publisher has `tagNamePrefix` (default `"v"`; v27 removed the old `vPrefixedTagName` boolean — set `tagNamePrefix: ""` for no prefix) ([electron-builder – Github options](https://www.electron.build/docs/publish)).
- **Release channels**: electron-builder supports channels via pre-release version components (e.g. `0.12.1-alpha.1` → channel `alpha`) and staged rollouts by editing `stagingPercentage` in `latest*.yml` ([electron-builder – detectUpdateChannel](https://www.electron.build/docs/mac), [Staged Rollouts](https://www.electron.build/docs/features/auto-update)).
- **CI**: both tools ship GitHub Actions support. electron-builder documents macOS/Windows signing + publishing workflows ([electron-builder – GitHub Actions](https://www.electron.build/docs/features/code-signing/)); Forge's GitHub publisher integrates with `GITHUB_TOKEN` in Actions ([Forge – GitHub Publisher](https://www.electronforge.io/config/publishers/github)).
- A common electron-builder pattern is `"dist": "electron-builder --publish always"` on a dev/"snapshot" version (publishing `snapshot.yml`) and `"release": "electron-builder"`/tag-driven publishes for stable ([electron-builder – Continuous Deployment workflow](https://www.electron.build/docs/publish)).

### Public vs private repo (and the GitHub token)

- **Public repo**: simplest. GitHub Releases hosting **plus** the free `update.electronjs.org` auto-update service both work; `update.electronjs.org` explicitly requires a **public** GitHub repository and builds published to GitHub Releases ([Electron – Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates); [Forge – GitHub Publisher](https://www.electronforge.io/config/publishers/github)).
- **Private repo**: GitHub Releases can still host update artifacts, but the client needs a token. electron-updater's **private GitHub provider** requires setting `GH_TOKEN` **on the end-user machine** and the `private` option, and electron-builder warns it is only for "very special cases — not intended and not suitable for all users"; the GitHub API rate limit is 5000 requests/user/hour and an update check uses up to 3 ([electron-builder – Private GitHub Update Repo](https://www.electron.build/docs/features/auto-update)). For a private repo it is often more practical to host updates on S3/R2/Spaces or a custom server.
- **Publishing auth**: writing releases always needs a token with repo **contents: write** — `GH_TOKEN`/`GITHUB_TOKEN` (electron-builder) or `GITHUB_TOKEN` (Forge) ([electron-builder – publish](https://www.electron.build/docs/publish); [Forge – GitHub Publisher](https://www.electronforge.io/config/publishers/github)).
- Security caution (electron-builder): the detected `repository` is written into the packaged app's `app-update.yml` for the app's lifetime; because GitHub re-issues owner/repo names if renamed/transferred/deleted, **set `owner` and `repo` explicitly** so a squatter cannot publish malicious updates to existing installs ([electron-builder – GitHub Repository](https://www.electron.build/docs/publish)).

---

## 5. Notable 2025 / 2026 changes (flagged)

- **`altool` fully retired** for notarization (Nov 1, 2023) — use `notarytool` + `stapler` ([Apple](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
- **EV certificates no longer bypass SmartScreen** (removed in 2024); paying the EV premium solely for that is "no longer justified" ([Microsoft – Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
- **Windows private keys must be on FIPS 140-2 / EAL 4+ hardware since June 2023** — pushing users to cloud/HSM signing ([Electron](https://www.electronjs.org/docs/latest/tutorial/code-signing)).
- **"Azure Trusted Signing" has been rebranded "Azure Artifact Signing"** in the 2026 docs; still ~$9.99/month, with geographic limits (orgs: USA/Canada/EU/UK; individuals: USA/Canada only) ([Electron – Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing); [Microsoft – Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)).
- **electron-builder v27 (next/unreleased at time of writing)** brings: mandatory signed update manifests, removal of implicit publishing, restructured `mac.sign`/`win.sign`, `disableWebInstaller` defaulting to `true`, `autoInstallEvent` / install-on-next-launch, and a new default `latest*.yml` format ([v27 docs](https://www.electron.build/docs/features/auto-update), [Signed Update Manifests](https://www.electron.build/docs/features/signed-update-manifests)).

---

## Uncertainties & confidence notes

- **electron-builder v27 is not released.** The `electron.build` site currently serves the `next (v27)` docs and warns they are pre-release; the npm stable is **26.15.3** (`publishConfig.tag: next`). Treat every v27-specific behavior above (signed manifests required, implicit-publish removal, `win.sign`/`mac.sign` restructure, `disableWebInstaller` default, etc.) as *planned / subject to change*. The corresponding v26 behavior differs. (High confidence on the version fact; medium on exact v27 semantics.)
- **No single "recommended in 2026" source exists** for Forge vs electron-builder. Electron.org documents Forge first and calls Forge/Packager the officially supported distribution path; electron-builder markets itself as complete. The tooling recommendation here is an interpretation, not a quoted recommendation.
- **Cloud/localized pricing and eligibility are volatile** (Azure Artifact Signing regions, CA prices). The figures come straight from Microsoft's 2026 docs but may change; verify before budgeting.
- **Forge's "Azure Trusted Signing" guide** still uses the older name and cites an October 2025 eligibility snapshot ("US and Canada organizations with 3+ years... and individual developers in the US and Canada"), which is narrower/older than Microsoft's own 2026 page (orgs in USA/Canada/EU/UK). Microsoft's page is the more authoritative and newer source.
- Signing-certificate cost for **macOS** is the Apple Developer Program fee ($99/year) plus any costs of the notarization workflow; no separate per-certificate fee is stated by Apple.
- I did **not** independently verify current CA list prices beyond Microsoft's ranges; the `$150–300` OV and `$400+` EV figures are Microsoft's stated ranges.

---

## Sources

- electron-builder – Overview: https://www.electron.build/
- electron-builder – Code Signing: https://www.electron.build/docs/features/code-signing/
- electron-builder – macOS: https://www.electron.build/docs/mac
- electron-builder – Windows: https://www.electron.build/docs/win
- electron-builder – Auto Update: https://www.electron.build/docs/features/auto-update
- electron-builder – Signed Update Manifests: https://www.electron.build/docs/features/signed-update-manifests
- electron-builder – Publish: https://www.electron.build/docs/publish
- electron-builder – npm stable version (26.15.3): https://registry.npmjs.org/electron-builder/latest
- Electron – Code Signing: https://www.electronjs.org/docs/latest/tutorial/code-signing
- Electron – Updating Applications: https://www.electronjs.org/docs/latest/tutorial/updates
- Electron Forge – Getting Started: https://www.electronforge.io/
- Electron Forge – Makers: https://www.electronforge.io/config/makers
- Electron Forge – GitHub Publisher: https://www.electronforge.io/config/publishers/github
- Electron Forge – Signing a macOS app: https://www.electronforge.io/guides/code-signing/code-signing-macos
- Electron Forge – Signing a Windows app: https://www.electronforge.io/guides/code-signing/code-signing-windows
- Electron Forge – Auto Update: https://www.electronforge.io/advanced/auto-update
- Apple – Notarizing macOS software before distribution: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Apple – Customizing the notarization workflow: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- Apple – Apple Developer Program ($99/year): https://developer.apple.com/programs/
- Microsoft – Code signing options for Windows app developers: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- Microsoft – SmartScreen reputation for Windows app developers: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Microsoft – Azure Artifact Signing (formerly Trusted Signing): https://learn.microsoft.com/en-us/azure/trusted-signing/
- Microsoft – Azure Artifact Signing quickstart (prerequisites): https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
