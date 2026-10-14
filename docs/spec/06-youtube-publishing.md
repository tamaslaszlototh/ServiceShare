# 06 — YouTube Publishing

Decision context (wayfinder #10). Facts verified against primary Google/YouTube sources in
`research/youtube-data-api` (branch `research/youtube-data-api`).

## 6.1 OAuth 2.0 (installed-app / desktop)

- **Client:** Google Cloud OAuth **Desktop** client (project `serviceshare-511421`,
  `youtube.upload` + `youtube.readonly` scopes). Authorized redirect is the **loopback** URI
  `http://127.0.0.1:<ephemeral port>` (custom URI schemes are no longer supported by Google).
  Release installers bundle this client's `credentials.json`, written from the
  `GOOGLE_OAUTH_CREDENTIALS` CI secret (ADR 0008); a local `credentials.json` overrides it.
- **Flow:** system browser opens `https://accounts.google.com/o/oauth2/v2/auth` with **PKCE**
  (`code_challenge`, `code_challenge_method=S256`); the callback server on loopback receives the
  code; exchange at `https://oauth2.googleapis.com/token`, `grant_type=authorization_code`.
- **Scopes:** `youtube.upload` covers both `videos.insert` and `thumbnails.set` (per Google's scope
  docs). `youtube.readonly` is kept for displaying the signed-in channel. No broader scopes
  (`youtube` / `force-ssl`) are requested — incremental auth is unsupported, so the initial screen
  is final.
- **Refresh:** refresh tokens are always issued for installed apps. The main process refreshes
  silently **before** an upload if the access token is expired or 401 occurs, posting
  `grant_type=refresh_token`.
- **Storage (normative):** access + refresh tokens (and the PKCE verifier when in flight) are stored
  in **Electron `safeStorage`** (macOS Keychain / Windows DPAPI), in the app's user-data dir —
  **never** in the repo, logs, or plaintext files. On `safeStorage` failure → `AuthRevoked`-adjacent
  `TokenStorageError` message, no silent fallback.
- Sign-out deletes stored tokens.
- Google may still show a one-time **"unverified app"** screen during the Testing publication stage;
  accept it for dev builds. **First real-account upload must empirically confirm** whether YouTube
  restricts unverified-project uploads to private (see §6.7).

## 6.2 Publish request (renderer → main)

```ts
interface PublishRequest {
  coverImagePath?: string;   // undefined → default base
  title: string;             // required, non-empty
  description?: string;
  tags?: string[];
  privacyStatus: 'unlisted' | 'private' | 'public';   // default 'unlisted'
  thumbnailPath?: string;    // optional; else the composed cover is used
}
```

## 6.3 Cover & MP4 (main process)

1. **Compose cover** (per `04` §4.5) → `cover.png` at exactly **1280×720**: chosen image (or
   bundled default base) scaled/cropped, video **title** (`drawtext`) and the **app logo**
   (`overlay`) composited. Default base ships in the app bundle.
2. **Render audio** to the publish track (48 kHz stereo `pcm_s16le` temp WAV) — reuses the engine,
   separate from any user export.
3. **Mux** (`04` §4.4): `-loop 1 -framerate 30` cover + audio → `out.mp4`
   (`libx264 -tune stillimage -pix_fmt yuv420p`, `aac -b:a 192k -ar 48000`,
   `-shortest -movflags +faststart`).
4. The MP4 lives in the session temp dir; cleaned on cancel/exit.

## 6.4 Resumable upload

- **Call:** `videos.insert({ part: 'snippet,status' })` via `googleapis`, **resumable** media
  upload (`value` = the MP4, `contentType: 'video/mp4'`), un-chunked whole-body PUT.
- Init session: `POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with
  `X-Upload-Content-Length` / `X-Upload-Content-Type: video/mp4`.
- **Progress:** `onUploadProgress` → panel `Uploading… NN%`.
- **Retries:** exponential backoff on `5xx`/`429`/network errors; a `404` (expired session URI)
  restarts from step 0 re-using the same temp MP4 (`UploadExpired`).
- **Cancel:** aborts the active request, deletes the temp MP4, reports "Publish cancelled".
- **Concurrency:** one upload at a time; a second publish request is blocked until the first ends.

## 6.5 Metadata mapping

| Panel field | `videos.insert` part | Notes |
| --- | --- | --- |
| Title | `snippet.title` | required; prefill = file name |
| Description | `snippet.description` | optional |
| Tags | `snippet.tags` | optional, ≤ 500 chars joined |
| Privacy | `status.privacyStatus` | default **unlisted** |
| Thumbnail | `thumbnails.set` → `videoId` | optional; max 50 MB PNG/JPEG (post-2026-09 limit); ~50 quota units, general bucket |

- `notifySubscribers` left at its API default (`true`).

## 6.6 Quota & limits

- `videos.insert` = **1 unit** in its own "Video Uploads" bucket, default **100/day** (resets at
  midnight Pacific). Failed or in-flight attempts may consume a call.
- Project shares 10,000 general units/day with everything else (thumbnails ~50 each).
- Panel shows the upload budget when derivable; on `QuotaExceeded` (403) → catalogue message + link
  to quota support docs. Nothing retried automatically on quota.
- Videos > 15 min require a **verified** Google account — the panel warns pre-upload (§5.5) but
  still allows the attempt.

## 6.7 Error/edge handling (references `02` §2.9)

- `AuthRevoked` (invalid/revoked refresh) → silent re-sign-in fallback to the account step.
- `NetworkError` → backoff, retriable; persistent failure surfaces "Retry".
- `UploadExpired` → restart from the temp MP4.
- `UnverifiedProject` → show the explanatory note on first publish; **verify empirically** on the
  first real-account upload — if videos come back locked to private, surface a permanent note with
  the verification/audit path. This is a documented open verification, not a spec bug.

## 6.8 Security notes

- No token, refresh token, or client secret is ever printed, logged, or sent to third parties.
- User-supplied text (title, description, tags) is escaped before `drawtext`/URL use.
- The loopback callback port is bound randomly per auth attempt and never exposed beyond
  `127.0.0.1`.