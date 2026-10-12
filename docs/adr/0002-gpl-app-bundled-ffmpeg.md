# 0002: GPL-3.0 app, bundled GPL-configured FFmpeg

ServiceShare is licensed GPL-3.0 and bundles a GPL-configured FFmpeg build via the npm `ffmpeg-static` package (per-platform binaries shipped in `extraResources`, resolved at runtime with a version check and PATH fallback).

Chosen because bundling gives zero user setup and a pinned, deterministic FFmpeg, while the GPL build owns the best H.264 encoder (`libx264`) for the YouTube MP4. An LGPL build + `libopenh264` was considered and rejected for weaker encoding; it remains the escape hatch only if a closed-source fork is ever desired.