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

**Edit List**:
The ordered sequence of edit operations applied to a clip; the source of truth for undo/redo and for rendering the final audio.
_Avoid_: history, timeline, project

**Export**:
Rendering the edited audio to a file on disk (WAV or MP3). Distinct from publishing.
_Avoid_: save, output

## Publishing

**Publish**:
Turning the edited audio into a video (cover image + audio track) and uploading it to YouTube as a new video.
_Avoid_: upload, share, export-to-YouTube

**Cover Image**:
The static image combined with the audio to form the video that gets published. Composed by scaling/cropping a chosen image (or a bundled default base) to 1280×720 and compositing the video title and the app logo onto it.
_Avoid_: thumbnail, artwork

**Published Video**:
The YouTube video produced by the most recent successful publish, together with who its link has already been emailed to. Forgotten when the app quits, another clip is opened, or a new publish replaces it.
_Avoid_: publication, upload, result
