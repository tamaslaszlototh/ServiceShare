# 04 — Audio Engine

Decision context (wayfinder #8): the engine compiles the effective edit list into a **single
complex filtergraph** (one input `-i source.wav`, one output) and executes it with one FFmpeg
invocation per operation (render/export/publish). Recipes verified in
`research/ffmpeg-recipes` (branch `research/ffmpeg-recipes`).

## 4.1 Operation → filter mapping (normative)

Ops in the edit list chain **in order**; coordinates on the chain are **edited-timeline**
(hh:mm:ss.mmm) because each structural op re-bases the timeline.

| Edit op | Filtergraph contribution |
| --- | --- |
| Trim `[start,end)` | `atrim=start=S:end=E`, then `asetpts=PTS-STARTPTS` (re-zero). |
| Cut region `[start,end)` | Two legs: `atrim=start=0:end=S` and `atrim=start=E`, both `asetpts=PTS-STARTPTS`, closed by `concat=n=2:v=0:a=1` (append chain). |
| Fade in `D` s | `afade=t=in:st=0:d=D` |
| Fade out `D` s | `afade=t=out:st=(clipDur-D):d=D` (st on the current chain length). |
| Gain `X` dB | `volume=XdB` |
| Normalize | Two-pass `loudnorm` (below), e.g. replaces manual gain. |
| Concatenate `file2` | Second `-i file2`, resampled to the chain's common format (below), joined with `concat=n=2:v=0:a=1`. |

**Composition rules**
- One active "chain" is accumulated as ops append. A structural op (trim / cut / concat) closes the
  current chain and starts a new branch/segment; linear ops append to the active chain.
- After each structural op the timeline is re-zeroed (`asetpts=PTS-STARTPTS`), so later ops' `st`
  values always refer to the edited, present timeline.
- The whole graph is passed in a single `-filter_complex` argument array to one FFmpeg process
  (`-i <source>` once; additional `-i` only for concatenate).
- Output options follow the consumer (preview / export / MP4), §4.3.

## 4.2 Normalize (two-pass loudnorm)

Targets (normative): integrated loudness **I = −16 LUFS**, true peak **TP = −1.5 dBTP**,
LRA = **11 LU**.

1. **Pass 1 (measure)** — render the post-gain chain with
   `loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -`, parse the JSON from stderr.
2. **Pass 2 (apply)** — `loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:measured_I=...:
   measured_TP=...:measured_LRA=...:measured_thresh=...:offset=...` (measured values copied from
   pass 1). Linear mode preserves dynamics.
3. The two passes are one engine operation; the command snapshot (tested) contains both invocations.
4. A `gain` following a normalize keeps the normalized base and applies dB on top.

## 4.3 Format policy (normative)

| Consumer | Sample rate | Depth / codec | Channels | Containter |
| --- | --- | --- | --- | --- |
| Preview cache | source | `pcm_s16le` | source | WAV |
| Export WAV | **source** (kept) | `pcm_s16le`/`pcm_s24le` per source | source (kept) | WAV |
| Export MP3 | source (kept) | `libmp3lame -b:a 192k` | down-mix to stereo if > 2 | MP3 |
| Publish MP4 | **48 kHz** | `aac -b:a 192k` (audio) · `libx264` (video) | stereo | MP4 |

- **Concatenate common format**: the chain uses the **first segment's** sample rate and channel
  layout; appended segments are resampled (`aresample` + `aformat`) to match on ingest.
- Publish, though fed by the same engine, renders to the publish-track format (48 kHz) — the
  publish render is a separate invocation from any user export.

## 4.4 Publish video assembly (cover → MP4)

Inputs: the published audio render (48 kHz WAV from §4.3) + a **Cover Image** (§4.5).

```
ffmpeg -loop 1 -framerate 30 -i cover.png -i audio.wav \
  -c:v libx264 -tune stillimage -pix_fmt yuv420p -r 30 \
  -vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart -y out.mp4
```

- Final frame size is exactly **1280×720**, `yuv420p` (even dims), `-shortest` ties video to audio,
  `+faststart` for streaming.
- Even-dimension guarantee lives in the cover step (compositing to 1280×720), so the pad/scale
  above is a safety net, not the primary path.

## 4.5 Cover compositing (normative)

Every publish composites the cover from a **base** + **title** + **logo** in one step (decision #10):

1. **Base** = the user-chosen image, or the bundled **default base** when none chosen.
2. Scale/crop any inputs to **1280×720** (`scale` + `crop`) — center-crop on aspect mismatch.
3. `drawtext` the video **title** (escaped, font bundled; positioned per the default template:
   bottom-left band).
4. `overlay` the bundled **app logo** (top-centre, fixed size, transparent PNG/SVG rasterised).

One FFmpeg invocation produces `cover.png`; that is what §4.4 `-loop 1` consumes. The composed
cover is also reused as the video's thumbnail when no explicit thumbnail is supplied.

## 4.6 Error surfacing

- FFmpeg non-zero exit → `RenderError`/`EngineError` with the last stderr lines (sanitised).
- Missing runtime binary → `EngineError` with the re-check path (see `03` §3.3 and `02` §2.9).

## 4.7 Test seam

The `compileEditList → args` function is pure and golden-tested (see `08`): each edit-list shape
must produce an exact, reviewed FFmpeg argument snapshot. Render execution is covered by audio
goldens with **metric-based tolerances** — never sample-exact comparisons.