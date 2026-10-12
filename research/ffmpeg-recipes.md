# FFmpeg command recipes for audio editing

Primary-source reference for the concrete operations ServiceShare needs. All commands target
a modern (2026) FFmpeg release (the 7.x/8.x docs are the ones cited). Examples use `input.wav`
etc. as placeholders.

Key top-level facts:

- A **simple** filtergraph (`-af` / `-filter:a`) has exactly one input and one output of the
  same type and is attached to one output stream; a **complex** filtergraph
  (`-filter_complex`) can have many inputs/outputs and is global. `-af` is an alias for
  `-filter:a`. <https://ffmpeg.org/ffmpeg.html#Simple-filtergraphs>
- FFmpeg picks an output encoder automatically if you do not pass `-c:a`; to force one use
  `-c:a <name>`. `-map` selects streams explicitly.
  <https://ffmpeg.org/ffmpeg.html#Stream-selection-1>

---

## 1. Trim / cut, and excise a region

### 1a. Keep a sub-region (`atrim`)

`atrim` keeps one continuous subpart. `start`/`end`/`duration` are time-duration specs that
read the **frame timestamp**; `start_sample`/`end_sample` count samples instead. It does
**not** modify timestamps, so add `asetpts` to re-zero them.
<https://ffmpeg.org/ffmpeg-filters.html#atrim>

```sh
# Keep 30s..45s and reset timestamps to zero
ffmpeg -i input.wav -af "atrim=start=30:end=45,asetpts=PTS-STARTPTS" -c:a pcm_s16le out.wav

# Keep only the first 90 seconds
ffmpeg -i input.wav -af "atrim=end=90,asetpts=PTS-STARTPTS" out.wav
```

For lossless/fast trimming when you do not need filtering, `-ss`/`-to`/`-t` as **input**
options seek first and are cheaper (`-ss` before `-i` is fast input seeking; `-c copy`
avoids re-encode). The filter form above is the sample-accurate route.

### 1b. Delete (excise) a middle region and concatenate the remainder

Use the complex **concat filter** with two `atrim` legs. Each leg must be re-zeroed with
`asetpts` because "all segments must start at timestamp 0".
<https://ffmpeg.org/ffmpeg-filters.html#concat>

```sh
# Remove 30s..45s from a single input, joining [0..30s] + [45s..end]
ffmpeg -i input.wav -filter_complex \
  "[0:a]atrim=end=30,asetpts=PTS-STARTPTS[a1]; \
   [0:a]atrim=start=45,asetpts=PTS-STARTPTS[a2]; \
   [a1][a2]concat=n=2:v=0:a=1[out]" \
  -map "[out]" -c:a pcm_s16le out.wav
```

`concat=n=<segments>:v=<n video>:a=<n audio>`; audio-only is `v=0:a=1`. The filter
automatically picks a common sample format/rate/channel layout for the inputs, pads the
shorter side of a segment with silence, and requires all segments to start at PTS 0.
<https://ffmpeg.org/ffmpeg-filters.html#concat>

---

## 2. Concatenate multiple files

### 2a. Same codec / sample rate / channels / time base → **concat demuxer** (stream copy)

The concat demuxer reads a text list and demuxes the files as if muxed together. "All files
must have the same streams (same codecs, same time base, etc.)." It adjusts timestamps so
each file starts where the previous ends. Use `-c copy` for a lossless, fast join.
<https://ffmpeg.org/ffmpeg-formats.html#concat-1>

`list.txt`:
```
file 'part1.wav'
file 'part2.wav'
```

```sh
ffmpeg -f concat -safe 0 -i list.txt -c copy out.wav
```

- `safe` defaults to `1`, which rejects absolute/protocol paths; pass `-safe 0` to allow
  arbitrary paths. <https://ffmpeg.org/ffmpeg-formats.html#concat-1>
- Optional `duration` / `inpoint` / `outpoint` directives per file override duration and
  trim. <https://ffmpeg.org/ffmpeg-formats.html#Syntax>

### 2b. Different sample rates / channels / codecs → **concat filter** (re-encode)

The concat filter works on decoded audio and "will automatically select … a common sample
format, sample rate and channel layout for audio streams" (other settings must be converted
explicitly). Because it forces a single common format, all inputs are resampled/re-mixed as
needed. <https://ffmpeg.org/ffmpeg-filters.html#concat>
<https://ffmpeg.org/ffmpeg.html#Complex-filtergraphs>

```sh
ffmpeg -i a.mp3 -i b.wav -i c.flac -filter_complex \
  "[0:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a0]; \
   [1:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a1]; \
   [2:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a2]; \
   [a0][a1][a2]concat=n=3:v=0:a=1[out]" \
  -map "[out]" -c:a pcm_s16le out.wav
```

`aresample=<rate>` forces a sample rate; `aformat` forces sample format and channel layout.
When the input already shares these, they are pass-through.
<https://ffmpeg.org/ffmpeg-filters.html#aresample-1>
<https://ffmpeg.org/ffmpeg-filters.html#aformat-1>

> Rule of thumb: concat **demuxer** = same format, stream copy, fastest; concat **filter** =
> heterogeneous inputs, always decodes/re-encodes.

---

## 3. Fade in / fade out (`afade`)

`afade` options: `type` (`in`/`out`), `start_time`/`st` (or `start_sample`/`ss`),
`duration`/`d` (or `nb_samples`/`ns`), and `curve` (default `tri`, linear).
<https://ffmpeg.org/ffmpeg-filters.html#afade-1>

```sh
# Fade in 0..3s and fade out the last 3s of a 60s file
ffmpeg -i input.wav -af "afade=t=in:st=0:d=3,afade=t=out:st=57:d=3" out.wav

# Official doc examples:
#   afade=t=in:ss=0:d=15          (fade in first 15 s)
#   afade=t=out:st=875:d=25       (fade out last 25 s of a 900 s file)
```

`st`/`d` are time-duration specs; `ss`/`ns` are sample counts. `silence` (default 0.0) sets
the fade-end gain and `unity` (default 1.0) the fade-start gain.
<https://ffmpeg.org/ffmpeg-filters.html#afade-1>
<https://ffmpeg.org/ffmpeg-utils.html#time-duration-syntax>

---

## 4. Volume / gain and loudness normalization

### 4a. Simple gain (`volume`)

`volume` accepts a multiplier or a dB value; output is clipped to max.
<https://ffmpeg.org/ffmpeg-filters.html#volume>

```sh
ffmpeg -i input.wav -af "volume=0.5" out.wav          # halve (also = 1/2 or -6.0206dB)
ffmpeg -i input.wav -af "volume=6dB" out.wav          # +6 dB
ffmpeg -i input.wav -af "volume=volume=6dB:precision=fixed" out.wav
```

### 4b. EBU R128 loudness normalization (`loudnorm`)

Options: `I` integrated target (default –24 LUFS, range –70…–5), `LRA` (default 7,
range 1…50), `TP` true peak (default –2, range –9…0). Single-pass is dynamic; two-pass is
more accurate. In **dynamic** mode the stream is internally upsampled to 192 kHz for true-peak
detection, so set the output rate explicitly with `-ar` or `aresample`.
<https://ffmpeg.org/ffmpeg-filters.html#loudnorm>

Single pass:
```sh
ffmpeg -i input.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 out.wav
```

**Two-pass** (recommended when targeting a spec, e.g. streaming/podcast):

Pass 1 — measure only, print JSON to stderr (`-f null -` discards output):
```sh
ffmpeg -i input.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null -
```

Pass 2 — feed the measured values back and force linear scaling. For **linear** mode
`measured_I`, `measured_LRA`, `measured_TP` and `measured_thresh` must all be specified.
<https://ffmpeg.org/ffmpeg-filters.html#loudnorm>
```sh
ffmpeg -i input.wav -af \
  "loudnorm=I=-16:TP=-1.5:LRA=11:\
measured_I=-22.50:measured_LRA=14.20:measured_TP=-3.10:measured_thresh=-32.80:\
offset=0.10:linear=true:print_format=summary" \
  -ar 48000 out.wav
```

Map pass-1 JSON fields to pass-2 options: `input_i`→`measured_I`, `input_lra`→`measured_LRA`,
`input_tp`→`measured_TP`, `input_thresh`→`measured_thresh`, `target_offset`→`offset`
(the two-pass method is the documented recommendation on the FFmpeg wiki,
<https://trac.ffmpeg.org/wiki/AudioVolume>).

If the linear conditions cannot be met, loudnorm silently reverts to dynamic:
"Target LRA shouldn't be lower than source LRA and the change in integrated loudness shouldn't
result in a true peak which exceeds the target TP."
<https://ffmpeg.org/ffmpeg-filters.html#loudnorm>

`print_format` is one of `summary` / `json` / `none` (default `none`); `stats_file` writes the
stats to a file or `-`. <https://ffmpeg.org/ffmpeg-filters.html#loudnorm>

For measurement only, `ebur128` (with `peak=true` for true-peak) is the alternate scanner.
<https://ffmpeg.org/ffmpeg-filters.html#ebur128-1>

---

## 5. Encode / export

### WAV (PCM)
```sh
ffmpeg -i input.wav -c:a pcm_s16le out.wav     # 16-bit PCM (default WAV codec)
ffmpeg -i input.wav -c:a pcm_s24le out.wav     # 24-bit
```
The `wav` muxer is RIFF; `-rf64 auto` switches to RF64 only past 4 GB if needed.
<https://ffmpeg.org/ffmpeg-formats.html#wav-2>

### MP3 (`libmp3lame`)
Requires a build with `--enable-libmp3lame`. `b` sets CBR/ABR bitrate; `q` sets VBR quality
(LAME `-V`); `compression_level` 0–9 tunes speed/quality.
<https://ffmpeg.org/ffmpeg-codecs.html#libmp3lame-1>
```sh
ffmpeg -i input.wav -c:a libmp3lame -q:a 2 out.mp3    # VBR ~190 kbps (good default)
ffmpeg -i input.wav -c:a libmp3lame -b:a 192k out.mp3 # CBR
```

### AAC (native `aac` encoder)
The native `aac` is FFmpeg's default AAC encoder (no external library). `b` sets the bitrate
and **activates CBR**; default when unspecified is 128 kbps. Profile defaults to AAC-LC.
<https://ffmpeg.org/ffmpeg-codecs.html#aac>
```sh
ffmpeg -i input.wav -c:a aac -b:a 192k out.m4a     # AAC-LC in MP4/M4A
ffmpeg -i input.wav -c:a aac -b:a 128k out.aac     # raw ADTS
```
Notes:
- For HE-AAC you need `libfdk_aac` (`-profile:a aac_he`), which requires
  `--enable-libfdk-aac` and is non-free; the native encoder is AAC-LC only.
  <https://ffmpeg.org/ffmpeg-codecs.html#libfdk-aac>
- Quality-wise `libfdk_aac` > native `aac` for AAC-LC; use `libfdk_aac` only if your build has
  it, otherwise `-c:a aac -b:a 192k` is the portable choice.
  <https://trac.ffmpeg.org/wiki/Encode/AAC>

---

## 6. Mux a static cover image + audio into an MP4 (YouTube-friendly)

Requirements: still image looped for the whole audio duration, `yuv420p` pixel format for
broad player compatibility, `-shortest` to end at the audio, and `+faststart` to move the
`moov` atom to the front for streaming.

```sh
ffmpeg -loop 1 -framerate 2 -i cover.png -i audio.wav \
  -c:v libx264 -tune stillimage -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -c:a aac -b:a 192k \
  -shortest -movflags +faststart \
  out.mp4
```

Why each flag:
- `-loop 1` on the `image2` input loops the still so it lasts as long as needed. The `image2`
  demuxer's `loop` option: "If set to 1, loop over the input. Default value is 0."
  <https://ffmpeg.org/ffmpeg-formats.html#image2-1>
  (`-framerate 2` is enough for a static image; 1 is fine too.)
- `-pix_fmt yuv420p` sets the pixel format; `libx264`/most players require `yuv420p`.
  <https://ffmpeg.org/ffmpeg.html#Advanced-Video-options>
- `scale=trunc(iw/2)*2:trunc(ih/2)*2` forces even width/height, which `yuv420p` requires.
- `-tune stillimage` optimizes x264 for a static frame. The libx264 wrapper exposes `tune`
  ("Set tuning of the encoding params"); `stillimage` is an x264 tune value (list it with
  `x264 --fullhelp`). <https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb>
- `-shortest` ends the output when the shortest stream ends (the audio), so the looped image
  does not run forever. <https://ffmpeg.org/ffmpeg.html#Main-options>
- `-movflags +faststart` runs a second pass moving the index (`moov` atom) to the beginning
  "for better playback". It is off by default. <https://ffmpeg.org/ffmpeg-formats.html#Fragmentation>
  and <https://ffmpeg.org/ffmpeg-formats.html#mov_002fmp4_002f3gp>

Alternative to `-loop 1`: make the image input duration match the audio with
`-stream_loop -1 -i cover.png` (`-stream_loop -1` = infinite), still combined with `-shortest`.
<https://ffmpeg.org/ffmpeg.html#Main-options>

---

## 7. Probe media (`ffprobe`)

Read duration / sample rate / channels for the app.

```sh
# Container duration in seconds (machine-readable)
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 input.wav

# Audio stream fields as JSON
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate,channels,channel_layout,duration,bit_rate \
  -of json input.wav

# All streams, JSON
ffprobe -v error -show_streams -of json input.mp4
```

Flags:
- `-v error` suppresses the banner/info noise.
- `-show_entries` selects section entries; `-show_streams`, `-show_format` are shortcuts.
- `-select_streams a:0` limits output to the first audio stream.
- `-of json` (alias `-output_format`) selects the writer; the `default` writer emits
  `key=value` lines. `nokey`/`noprint_wrappers` strip keys/section headers for easy parsing.
<https://ffmpeg.org/ffprobe.html#Main-options>
<https://ffmpeg.org/ffprobe.html#Writers>

---

## Version / build caveats

- Native `aac`: `-b:a` selects CBR; VBR uses `-q:a` (CLI) / `global_quality` (API). Default
  128 kbps. <https://ffmpeg.org/ffmpeg-codecs.html#aac>
- `loudnorm` `LRA` valid range is 1.0–50.0 in current docs (older 4.1 docs said 1.0–20.0).
  Use the current docs. <https://ffmpeg.org/ffmpeg-filters.html#loudnorm>
- `apad` with no options pads indefinitely; for a finite pad use `pad_len`/`pad_dur` or
  `whole_len`/`whole_dur` (mutually exclusive pairs). Older FFmpeg (≤4.4) treated a zero
  `pad_dur`/`whole_dur` as indefinite. <https://ffmpeg.org/ffmpeg-filters.html#apad>
- The concat **demuxer** `auto_convert` (default 1) only auto-inserts the
  `h264_mp4toannexb` bitstream filter for H.264-in-MP4; it does **not** resample audio, so
  mismatched audio still needs the concat filter.
  <https://ffmpeg.org/ffmpeg-formats.html#concat-1>
- The exact existence of `libmp3lame` / `libfdk_aac` depends on how FFmpeg was built
  (`-codecs` lists them). The native `aac` and `pcm_*` encoders are always present.
- To set a fixed output sample rate after loudnorm (which upsamples internally in dynamic
  mode) use `-ar` or an explicit `aresample`.
  <https://ffmpeg.org/ffmpeg-filters.html#loudnorm>

---

## Sources

- <https://ffmpeg.org/ffmpeg.html>
- <https://ffmpeg.org/ffmpeg-filters.html>
- <https://ffmpeg.org/ffmpeg-formats.html>
- <https://ffmpeg.org/ffmpeg-codecs.html>
- <https://ffmpeg.org/ffmpeg-utils.html>
- <https://ffmpeg.org/ffprobe.html>
- <https://trac.ffmpeg.org/wiki/AudioVolume>
- <https://trac.ffmpeg.org/wiki/Concatenate>
- <https://trac.ffmpeg.org/wiki/Encode/MP3>
- <https://trac.ffmpeg.org/wiki/Encode/AAC>
