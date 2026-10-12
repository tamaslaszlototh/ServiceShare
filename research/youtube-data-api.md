# Uploading video to YouTube via the YouTube Data API v3 (2026)

Research question: what does uploading a video to YouTube via the YouTube Data API v3 require in 2026?
Findings below are from primary sources (Google/YouTube official docs and references) only, with each claim cited.
Retrieved 2026-10-12.

---

## 1. OAuth 2.0

### 1.1 Scopes needed to upload

`videos.insert` requires authorization with **at least one** of these scopes
(https://developers.google.com/youtube/v3/docs/videos/insert):

- `https://www.googleapis.com/auth/youtube.upload` — "Manage your YouTube videos"
- `https://www.googleapis.com/auth/youtube` — "Manage your YouTube account"
- `https://www.googleapis.com/auth/youtubepartner`
- `https://www.googleapis.com/auth/youtube.force-ssl` — "See, edit, and permanently delete your
  YouTube videos, ratings, comments and captions"

So `youtube.upload` is sufficient for uploads; `youtube.force-ssl` is a broader scope that also
permits edit/delete of videos, ratings, comments and captions. The scope descriptions come from the
installed-apps guide and the global scope list
(https://developers.google.com/youtube/v3/guides/auth/installed-apps,
https://developers.google.com/identity/protocols/oauth2/scopes).

### 1.2 Desktop / installed-app OAuth flow

- Installed apps open the **system browser** and use a redirect URI to receive the authorization
  code; they are assumed unable to keep secrets
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).
- For macOS, Linux and Windows desktop apps the recommended redirect is a **loopback IP address**
  (`http://127.0.0.1:port`) with the OAuth client type set to **Desktop app**. The loopback option
  is deprecated for Android, Chrome app and iOS clients
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).
- **Custom URI schemes are no longer supported** (app-impersonation risk); the OOB / manual
  copy-paste flow is also deprecated/unsupported
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps,
  https://developers.googleblog.com/2022/02/making-oauth-flows-safer.html).
- **PKCE** is supported and recommended (`code_challenge` / `code_challenge_method`, `S256`
  recommended); the authorization endpoint is `https://accounts.google.com/o/oauth2/v2/auth`, and
  the code is exchanged at `https://oauth2.googleapis.com/token` with
  `grant_type=authorization_code`
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).
- **DPoP** (RFC 9449) is optional but recommended for increased security; if used, the refresh token
  is bound to the DPoP key rather than the access token
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).
- Incremental authorization is **not** supported for installed apps/devices
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).

### 1.3 Google verification

- Public applications that use scopes permitting access to user data **must complete a verification
  process**; while testing you will see an **"unverified app"** screen until verification is granted
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps,
  https://developers.google.com/identity/protocols/oauth2/scopes).
- Google's app-verification policy: apps requesting **sensitive** or **restricted** scopes must
  complete OAuth app verification before being granted access to those scopes. The scope's tier
  (non-sensitive / sensitive / restricted) is indicated **automatically in the Google Cloud Console**
  when you configure the OAuth consent screen; non-sensitive-only apps don't need full verification
  (https://support.google.com/cloud/answer/13463073).
- Separately, YouTube historically required an **API compliance audit**. Per the revision history,
  all developers using YouTube API Services had to complete an API Compliance Audit to be granted
  more than the default quota
  (https://developers.google.com/youtube/v3/revision_history).

### 1.4 Token refresh

- Refresh by POSTing to `https://oauth2.googleapis.com/token` with `client_id`,
  `grant_type=refresh_token`, and the `refresh_token` (client_secret optional / not applicable to
  Android, iOS or Chrome clients). Refresh tokens are **always returned for installed applications**
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).
- Access tokens are short-lived (`expires_in` in the response); refresh tokens stay valid until the
  user revokes access or the token expires. Store both in secure, long-lived storage. There are
  limits on refresh tokens issued (one per client/user, and per user across clients); requesting too
  many can invalidate older ones
  (https://developers.google.com/youtube/v3/guides/auth/installed-apps).
- If a DPoP-bound refresh token is used, each refresh request must include a fresh DPoP proof signed
  with the original key (https://developers.google.com/youtube/v3/guides/auth/installed-apps).

---

## 2. Resumable upload protocol and `videos.insert`

### 2.1 Endpoint and constraints

- HTTP request: `POST https://www.googleapis.com/upload/youtube/v3/videos`
  (https://developers.google.com/youtube/v3/docs/videos/insert).
- Media upload constraints: **maximum file size 256 GB**; accepted media MIME types are
  **`video/*`** and **`application/octet-stream`**
  (https://developers.google.com/youtube/v3/docs/videos/insert).
- The yieldable `part` parameter is required; settable parts include `snippet`, `status`,
  `localizations`, `recordingDetails`, `brandPartner` (added 2026-07-07). Settable properties include
  `snippet.title/description/tags/categoryId/defaultLanguage`, `status.privacyStatus/embeddable/
  license/publicStatsViewable/publishAt/selfDeclaredMadeForKids/containsSyntheticMedia`, etc.
  Default `privacyStatus` is `public` (some accounts may default to `private`)
  (https://developers.google.com/youtube/v3/docs/videos/insert).
- Optional query params: `notifySubscribers` (default `true`); `onBehalfOfContentOwner*` (YouTube
  content partners only) (https://developers.google.com/youtube/v3/docs/videos/insert).

### 2.2 Resumable session (how bytes are sent)

Documented at https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol:

1. **Start session** — `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=PARTS`
   with the video resource as the body and headers: `Authorization`, `Content-Length`,
   `Content-Type: application/json; charset=UTF-8`, `X-Upload-Content-Length` (file size),
   `X-Upload-Content-Type` (`video/*` or `application/octet-stream`).
2. **Save session URI** — success returns `200 OK` with a `Location` header containing the session URI.
3. **Upload bytes** — `PUT UPLOAD_URL` with `Authorization`, `Content-Length` and `Content-Type`
   headers and the **binary file data** as the body.
4. **Completion** — success returns `201 Created` and the created `video` resource. Resumable errors:
   spin/retry on `500/502/503/504` using exponential backoff; a `404` means the session URI expired
   and the upload must be restarted. Check status with an empty `PUT` and
   `Content-Range: bytes */CONTENT_LENGTH`; a `308 Resume Incomplete` response carries a `Range`
   header (0-based) of bytes already received. Resume with `Content-Range: bytes FIRST_BYTE-LAST_BYTE/TOTAL`.
   You cannot upload a non-contiguous block.

**Chunked option**: chunks must be a **multiple of 256 KB** (except the final chunk), and the chunk
size must be the same for every request except the last. Chunking is supported but discouraged
except for unstable networks/progress UI
(https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol).

Google API client libraries provide native resumable-upload support; the Python sample uses a
`MediaFileUpload(..., resumable=True)` and a retry/backoff loop
(https://developers.google.com/youtube/v3/guides/uploading_a_video).

---

## 3. Supported video formats and size/limit constraints

- `videos.insert` accepts any `video/*` MIME type or `application/octet-stream`, max **256 GB**
  (https://developers.google.com/youtube/v3/docs/videos/insert).
- YouTube help: supported **container formats** are `.MOV`, `.MPEG-1`, `.MPEG-2`, `.MPEG-4`, `.MP4`,
  `.MPG`, `.AVI`, `.WMV`, `.MPEGPS`, `.FLV`, `3GPP`, `WebM`, `DNxHR`, `ProRes`, `CineForm`,
  `HEVC (H.265)` (https://support.google.com/youtube/troubleshooter/2888402).
- **Maximum upload**: 256 GB **or 12 hours, whichever is less**. Videos longer than 15 minutes
  require a verified Google Account (https://support.google.com/youtube/answer/71673).
- **Recommended encoding** (partner guidance): MPEG-4 with **H.264 video** and **AAC audio** at
  128 kbps or better is preferred; MPEG-2 (MPEG Layer II / Dolby AC-3) is the top preference for
  broadcast masters. `.WMV`, `.AVI`, `.MOV`, `.FLV` are also accepted but re-encoded and may not
  achieve HQ (https://support.google.com/youtube/answer/4603579).

---

## 4. Quota

- `videos.insert` has a **quota cost of 1 unit**, charged to its **own "Video Uploads" quota
  bucket** with a **default limit of 100 calls per day**
  (https://developers.google.com/youtube/v3/docs/videos/insert,
  https://developers.google.com/youtube/v3/determine_quota_cost).
- Default project allocation: **100 `search.list` calls, 100 `videos.insert` calls, and 10,000
  units/day** combined for all other endpoints. Daily quotas reset at **midnight Pacific Time**.
  (https://developers.google.com/youtube/v3/getting-started,
  https://developers.google.com/youtube/v3/determine_quota_cost).
- **Practical consequence**: ~100 video uploads per day per project by default (fewer if you also
  call other methods that draw on shared buckets, though uploads no longer consume the 10,000-unit
  pool). More quota requires the Quota Extension Form / compliance audit
  (https://developers.google.com/youtube/v3/getting-started,
  https://developers.google.com/youtube/v3/revision_history).
- Historical note: the upload cost was **~1600 units** until it was changed to **~100 units on
  2025-12-04** (https://developers.google.com/youtube/v3/revision_history).

---

## 5. `thumbnails.set`

- HTTP request: `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=...`
  (https://developers.google.com/youtube/v3/docs/thumbnails/set).
- **Scopes** (at least one): `youtubepartner`, `youtube.upload`, `youtube`, `youtube.force-ssl`.
- Constraints: **max file size 50 MB**; MIME types `image/jpeg`, `image/png`,
  `application/octet-stream`. The body is the image itself (no thumbnail resource).
- **Quota cost: ~50 units** (charged to the general bucket, not the upload bucket).
- The 50 MB thumbnail limit is a **2026 change** (increased from 2 MB on 2026-09-14); `playlistImages`
  likewise increased from 2 MB to 50 MB
  (https://developers.google.com/youtube/v3/revision_history).
- Possible errors: `invalidImage`, `mediaBodyRequired`, `forbidden` (no permission / can't set for
  the video), `videoNotFound`, and `uploadRateLimitExceeded` (too many thumbnails recently)
  (https://developers.google.com/youtube/v3/docs/thumbnails/set).

---

## 6. Audio-only uploads are NOT supported

- YouTube help states plainly: **"Audio files, like MP3, WAV or PCM files, can't be uploaded to
  create a YouTube video. You can use video editing software to convert your audio file to a
  video. Audio files can only be uploaded as extra languages for your video."**
  (https://support.google.com/youtube/troubleshooter/2888402).
- The upload UI doc repeats: "You can't upload audio files to create a YouTube video ... try
  converting your audio file to a video file by adding an image"
  (https://support.google.com/youtube/answer/57407).
- This is consistent with the API: `videos.insert` only accepts `video/*` or
  `application/octet-stream` (https://developers.google.com/youtube/v3/docs/videos/insert).
- (Partner-only exception, not the normal video upload path: for Content ID/DDEX delivery, audio
  tracks in MP3/WAV, PCM/WAV, AAC/MOV and FLAC are accepted with a minimum 64 kbps and minimum
  ~33 s duration — https://support.google.com/youtube/answer/4603579.)

---

## 7. Notable changes in 2025 / 2026

- **2025-12-04** — Video-upload quota cost changed from ~1600 units to ~100 units
  (https://developers.google.com/youtube/v3/revision_history).
- **2026-06-01** — The API transitioned to a **granular quota system**, starting with `videos.insert`
  and `search.list`, each charged to its own bucket (default 100/day each); all other methods stay in
  the shared bucket. Intended to simplify quota-increase requests
  (https://developers.google.com/youtube/v3/revision_history).
- **2026-09-14** — `thumbnails.set` (and `playlistImages.insert`) max file size raised **2 MB → 50 MB**
  (https://developers.google.com/youtube/v3/revision_history).
- **2026-07-07** — `videos` resource gained the `brandPartner` part (creator-initiated brand-partner
  access), usable with `videos.insert` (https://developers.google.com/youtube/v3/revision_history).
- **2026-06-03** — New `videos.batchGetStats` method, quota cost 1 unit in its own bucket
  (default 10,000/day) (https://developers.google.com/youtube/v3/revision_history).
- **2024-10-30** — `status.containsSyntheticMedia` added to flag altered/synthetic content; settable
  on `videos.insert` (https://developers.google.com/youtube/v3/revision_history).
- **Unverified-project upload restriction — conflicting signals (see Uncertainties)**: a 2020
  revision entry says videos uploaded via `videos.insert` from unverified API projects created after
  2020-07-28 are locked to **private** until audited
  (https://developers.google.com/youtube/v3/revision_history), while the current `videos.insert`
  reference (2026-10-08) states **"Videos uploaded from unverified API projects are not restricted to
  private viewing mode."**
  (https://developers.google.com/youtube/v3/docs/videos/insert).

---

## Uncertainties / confidence notes

- **Unverified-project privacy restriction.** The current `videos.insert` reference and the 2020
  revision-history entry appear to contradict each other (see §7). The most likely reading is that
  the old "force-private unless audited" behavior has been relaxed/removed, but I could not find an
  explicit revision-history entry announcing a reversal. Treat the current reference wording as
  authoritative for 2026, and verify empirically for a public-release app. Confidence: medium.
- **Scope sensitivity tier.** Which YouTube scopes are classified *sensitive* vs *restricted* is shown
  in the Google Cloud Console, not in the reference text I retrieved. The official guidance only says
  sensitive/restricted scopes require verification; the exact tier for `youtube.upload` vs
  `youtube.force-ssl` was not explicitly stated in the primary pages fetched. Verify in the Cloud
  Console's OAuth consent screen. Confidence: medium.
- **Exact per-upload quota accounting.** The `videos.insert` reference says both "100 calls per day"
  and "cost of 1 unit in the Video Uploads quota bucket"; the quota calculator agrees (100/day, 1
  each). I could not find a definitive statement on whether a *failed* upload still consumes a call
  from the upload bucket (the general rule is that even invalid requests cost ≥1 point). Confidence:
  high on cost/limit, medium on failed-attempt accounting.
- **OAuth custom-scheme support across platforms.** The installed-apps page says custom URI schemes
  are no longer supported and loopback is recommended for desktop but deprecated for Android/iOS/
  Chrome. Desktop-app behavior should be validated against the current Cloud Console client type.
  Confidence: high on the doc wording.
- Dates above are the "Last updated" dates shown on the official pages as of the retrieval date
  (2026-10-12); Google may change these without a revision-history entry.

---

## Sources

- Videos: insert — https://developers.google.com/youtube/v3/docs/videos/insert
- Upload a Video — https://developers.google.com/youtube/v3/guides/uploading_a_video
- Send Resumable Uploads — https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- OAuth 2.0 for Mobile & Desktop Apps (Installed Apps) — https://developers.google.com/youtube/v3/guides/auth/installed-apps
- Quota Calculator — https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube Data API Overview (quota) — https://developers.google.com/youtube/v3/getting-started
- Thumbnails: set — https://developers.google.com/youtube/v3/docs/thumbnails/set
- Revision History — https://developers.google.com/youtube/v3/revision_history
- OAuth 2.0 Scopes for Google APIs — https://developers.google.com/identity/protocols/oauth2/scopes
- OAuth App Verification Help Center — https://support.google.com/cloud/answer/13463073
- OAuth Application Verification FAQ — https://support.google.com/cloud/answer/9110914
- Unverified apps (Help Center) — https://support.google.com/cloud/answer/7454865
- Making OAuth flows safer (blog) — https://developers.googleblog.com/2022/02/making-oauth-flows-safer.html
- Supported YouTube file formats — https://support.google.com/youtube/troubleshooter/2888402
- Upload YouTube videos (audio not supported) — https://support.google.com/youtube/answer/57407
- Upload videos longer than 15 minutes (size/duration limits) — https://support.google.com/youtube/answer/71673
- Video and audio formatting specifications (recommended codecs) — https://support.google.com/youtube/answer/4603579
