# ServiceShare

Desktop application for basic WAV audio editing and publishing the result to YouTube.

## Editing

**Clip**:
The WAV audio content loaded into the editor's single track.
_Avoid_: file, audio file

**Selection**:
A time region of the current clip, in seconds or samples, that edit operations target.
_Avoid_: highlight, marked portion

**Edit Operation**:
A single user-invoked transformation applied to a selection (trim, cut/delete region, fade in/out, gain/normalize, concatenate).
_Avoid_: effect, transform, tool

**Export**:
Rendering the edited audio to a file on disk (WAV, MP3, or AAC). Distinct from publishing.
_Avoid_: save, output

## Publishing

**Publish**:
Turning the edited audio into a video (cover image + audio track) and uploading it to YouTube as a new video.
_Avoid_: upload, share, export-to-YouTube

**Cover Image**:
The static image combined with the audio to form the video that gets published.
_Avoid_: thumbnail, artwork