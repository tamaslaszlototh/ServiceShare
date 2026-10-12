# 08 — Testing Strategy

Decision context (wayfinder #4): four test layers, each with an explicit role. AC format is
**Given/When/Then with a verifiable measure**, inline in `02`. Audio goldens are **metric-based
with tolerance** — never sample-exact. YouTube is tested against the **real API** on a dedicated
test channel, env-gated (mocked in CI).

## 8.1 Layer 1 — Domain unit tests (fast, no FFmpeg)

- Edit-list semantics, undo/redo cursor logic, timeline-arithmetic (edited coords), format-policy
  computations, error-code mapping.
- **Golden FFmpeg snapshots:** `compileEditList(...)` (04 §4.7) returns an argument array; assert
  exact, reviewed snapshots per edit-list shape:
  - trim; cutRegion (two-leg concat); fade in/out at boundaries; gain; normalize (two-pass command
    pair with measured-value passthrough); concatenate (second `-i` + `aresample`/`aformat` +
    `concat`); publish mux; cover compositing chain.
  - Any change to the generated args requires updating the golden and a reviewer's +1.
- Run: `npm test` (vitest/jest), < 5 s, in CI on every PR.

## 8.2 Layer 2 — Audio integration goldens (real FFmpeg, tolerance-based)

- Render small synthesized sources (tones, silence gaps, chirps) through the engine; compare against
  reference WAVs produced from the **verified recipes** (`research/ffmpeg-recipes`).
- **Metrics with tolerances** (normative for each op, matching ACs in `02`):
  - Duration: ±5 ms.
  - Level/amplitude: ±0.05 LU / ±0.5 dB.
  - Mean/test features: spectral centroid / RMS on slices.
  - Loudness: use `ebur128`-style loudness measurement (±0.5 LU I / ±0.1 LU idempotence for
    normalize re-run).
  - Join artifact (`cutRegion`): inter-sample delta ratio ≤ a fixed µ-tolerance at the seam.
- Compare release-FFmpeg output, not sample-exact decoder output; platform-flag tolerance where the
  bundled ffmpeg-static differs.
- Run locally + on CI `mac`/`win` runners (both platforms).

## 8.3 Layer 3 — YouTube real-API tests (env-gated)

- **Env-gated:** run only with `YT_CI_CHANNEL`-style secrets + `RUN_NETWORK=1`; skipped otherwise;
  **mocked by default in CI**.
- Dedicated **test channel** (not a personal channel). Assertions:
  - Upload an MP4 produced by a known publish; poll `videos.list` → title, privacy, duration.
  - `thumbnails.set` round-trip.
  - Refresh-token path (simulate expiry).
- Quota guard: these tests post against the real 100/day budget; keep the suite small and tagged
  (`@youtube-real`) so it never runs implicitly.

## 8.4 Layer 4 — E2E (Playwright, UI)

- Electron app driven via Playwright against the **built app** with the **YouTube service
  stubbed** (local fake HTTP server implementing the resumable protocol) and a fake OAuth loopback.
- Cover the `05` states and panels: empty → open → fade → export; full publish walkthrough
  (sign-in screen → cover → metadata → staged upload with injected progress → success/failure
  screens); cancel mid-upload; error banners for each catalogue code (`02` §2.9).
- Waveform/selection hit-testing with deterministic geometry; keyboard shortcuts; accessibility
  smoke checks (Tab order present).
- Run in CI on mac + win; no real network.

## 8.5 Coverage & CI wiring

| Layer | In PR CI | Cadence | Env needed |
| --- | --- | --- | --- |
| 1 unit/golden args | yes | every PR | — |
| 2 audio goldens | yes (both OS) | every PR | — |
| 3 real API | no (mock) | nightly + manual | `YT_*` secrets |
| 4 Playwright E2E | yes | every PR + release smoke | — |

- Release pipeline (`07`) adds a smoke: build → install → launch → version banner → golden E2E set
  against the installed artifact.
- **Flake policy:** audio goldens must tolerate platform variance (tolerance table above); any
  golden that needs sample-exactness is a spec violation and must be re-worked, not re-baselined.