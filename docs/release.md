# Releasing ServiceShare

ServiceShare ships as one unsigned Windows x64 installer through GitHub Releases (ADR 0007).
Installed apps check GitHub Releases on launch and install updates on quit.

## Cut a release

1. Bump `version` in `package.json`, e.g. `0.2.0`, or `0.2.0-beta.1` for a pre-release. Commit it
   to `main` and push.
2. Tag the commit and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The `release` job in `.github/workflows/build.yml` runs on a Windows runner:
   - it checks that the tag matches `package.json`;
   - it runs the unit and audio tests;
   - it builds and uploads `ServiceShare-Setup-<version>.exe`, its `.blockmap` and the update
     metadata (`latest.yml`, or `beta.yml` / `alpha.yml` for pre-releases) to a **draft** GitHub
     Release.

   No secrets are needed: the job uses the built-in `GITHUB_TOKEN`.
4. Run the smoke checklist below against the installer attached to the draft.
5. Publish the draft on GitHub. For a `-beta.N` / `-alpha.N` version, tick **Set as a
   pre-release**. Installed apps only see published releases.

If the job fails, fix the problem and delete the tag (`git push --delete origin v0.2.0`, then
`git tag -d v0.2.0`). Delete any draft it left behind and tag again.

## Smoke checklist

Use a Windows x64 machine, ideally one that has never had ServiceShare installed.

- [ ] Download the installer from the draft release and run it. SmartScreen warns "Windows protected
      your PC" (unsigned): **More info → Run anyway**.
- [ ] The installer shows the GPL-3.0 license page and lets you choose the install folder.
- [ ] ServiceShare launches from the Start menu.
- [ ] **Help → About ServiceShare** shows the new version and the GPL-3.0 / source-code notice.
- [ ] Open a WAV file. The waveform appears and playback works, so the bundled FFmpeg resolved.
- [ ] Make an edit and export to MP3.
- [ ] Open the Publish dialog and check that the cover preview renders. This shows the bundled
      assets are found.
- [ ] After publishing the release, an older installed build finds the update via **Help → Check
      for Updates…** and installs it on quit.

## What users do

Users download `ServiceShare-Setup-<version>.exe` from the repository's Releases page, accept the
SmartScreen warning once, and install. Later versions arrive automatically: the app downloads them
in the background and installs them when it quits.
