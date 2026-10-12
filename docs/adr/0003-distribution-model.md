# 0003: Distribution model (electron-builder + GitHub Releases)

ServiceShare is packaged with **electron-builder**: Windows **NSIS**, macOS **dmg + zip** (both required for Squirrel.Mac), arch `x64` + `arm64`. Updates use **electron-updater + GitHub Releases** (public repo, no end-user token), checked on launch and applied on relaunch.

macOS is **signed and notarized** (Developer ID Application + `notarytool`, API-key auth, `forceCodeSigning`); notarization is a hard requirement, and both auto-update and `safeStorage` need a valid signature. Windows is **unsigned for now**: SmartScreen "Unknown publisher" warnings are accepted and `verifyUpdateCodeSignature` is disabled so unsigned installers still update. An OV certificate is the documented path to re-enable trust.

Versioning is **SemVer with alpha/beta channels** via pre-release tags (`vX.Y.Z-<channel>.<n>`); a tag-driven GitHub Actions pipeline builds and publishes both platforms with `--publish onTag`. Once electron-builder v27 ships, updates switch to its required Ed25519-signed manifests (fail-closed).