# 05 — Editor UX

UI decision (wayfinder #6): **Variant A — Classic DAW** wins. The interactive prototype is the
reference: branch `prototype/editor-ui`, file `prototype/editor-ui.html` (worktree snapshot
`/var/folders/fy/fptc6c4n57s4tsxcbfcfzzzm0000gn/T/opencode/ui-prototype/prototype/editor-ui.html`).
This file fixes the layout, ordering, and states; pixels beyond these rules may vary.
UI language is **English only** (no i18n; see `09`).

## 5.1 Window layout (single window, light theme)

```
┌ Header ──────────────────────────────────────────────────────────────┐
│ [ServiceShare]   File(Open…  Exit)   Export…   Publish to YouTube…   │
├ Edit-op toolbar ─────────────────────────────────────────────────────┤
│ Trim · Cut region · Fade in/out · Gain/Normalize · Concatenate │   │
│                                                                     │
│ ─── Transport ───────────────────────────────────────────────────    │
│ ▶ (play) ⏸ (pause) ⏹ (stop)   position 0:00:00 / total   zoom − +   │
├ Work area ───────────────────────────────────────────────────────────┤
│ ruler (sec)                                                          │
│ waveform  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ┌selection┐                    │
│ selection overlay (draggable edges)                                  │
├ Status strip ────────────────────────────────────────────────────────┤
│ 44100 Hz · 16-bit · mono · 3:24.5    undo: 3 · redo: 0    READY     │
└──────────────────────────────────────────────────────────────────────┘
```

Fixed order decided in #6: on the edit-op row the **transport (▶⏸⏹ + position) comes after the
edit buttons and before the zoom controls** (zoom sits rightmost on that row).

## 5.2 Interaction model

- **Open** replaces the clip (confirm if edits exist). Drag-and-drop of a `.wav` onto the window
  also opens it.
- **Selection**: drag on the ruler/waveform; edge handles extend/shrink; click sets a cursor.
  Selection always snaps to whole samples; displayed as `HH:MM:SS.mmm → HH:MM:SS.mmm`.
- **Edit ops** apply to the current selection (or whole clip when none), each appending an undo
  step. Fade presents an inline duration field (default 2 s, 0.5–10). Gain presents a dB field
  (−30…+30). Normalize is a single click.
- **Concatenate** opens a file picker for a WAV; appended audio is resampled to the chain's common
  format (see `04` §4.3).
- **Undo/redo**: Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z (Ctrl+Y also). The strip shows current undo/redo
  counts.
- **Playback**: the transport streams the cached preview render (see `03` §3.4); position marker
  tracks edited-timeline coords; stop returns to play-start.

## 5.3 Playback / timeline coords

Ruler, waveform, selection, and position are all in **edited-timeline coordinates** — i.e. the
coords the user sees after edits, matching the preview cache. This is the invariant that keeps the
UI and engine consistent (see `04`).

## 5.4 States (normative)

| State | Appearance | Actions available |
| --- | --- | --- |
| Empty | Dim placeholder, "Open a WAV to begin" | Open |
| Loading | Spinner + "Opening…" | Cancel-ish (no-op) |
| Ready | Waveform + ruler | All |
| Playing | Transport reflects ▶→⏸ | Pause/Stop, seeking |
| Rendering | Progress spinner/banner (non-modal) | Queue/cancel render |
| Exporting | Non-modal progress + % | Cancel |
| Publishing | Publish panel (5.6) with stage progress | Cancel, back to editor |
| Error | Inline banner w/ code + message | Retry linked to catalogue (`02` §2.9) |

Empty and error states are **explicit** (decision #6): no dead clicks in Empty; errors render as a
visible, dismissible banner with an action button.

## 5.5 Publish panel flow

Modal opened from "Publish to YouTube…". Ordered steps (decision #10):

1. **Account** — if signed out: "Sign in with Google" (opens system browser; loopback callback;
   panel returns when done and shows the account/channel). If signed in: account chip + "Sign out".
2. **Cover preview** — shows the composited cover live (chosen image swapped over the default base,
   title + logo always applied); "Choose image…" opens a picker (PNG/JPEG); "Remove" returns to the
   default base. Recomposite preview updates on the fly.
   Below it, "Default cover" and "Default logo" each offer "Choose…" (PNG/JPEG, copied into the
   app's user data and used for every later cover) and, once replaced, a reset to the bundled image.
3. **Metadata** — Title (required; prefilled with the file name), Description (textarea, optional),
   Tags (comma list, optional), Privacy (default **Unlisted**; options Unlisted/Private/Public),
   Thumbnail (optional "Choose…"; else the composed cover is used, so no extra API call needed).
4. **Publish** — button "Publish to YouTube"; disabled until title is non-empty and (signed in).
   Progress shows stage: `Rendering video…` → `Uploading… NN%` (upload progress). A companion
   disclosure shows "Uploads today: N / 100" when available.
5. **Done** — success shows the new video link ("View on YouTube") + close; failure shows the code
   from `02` §2.9 with an action ("Retry" / quota "About quotas" link).

Warnings surfaced before upload: duration > 15 min → "Videos over 15 minutes require a verified
account on YouTube."; account/dev project in testing/unverified → one-time note about possible
private-lock (verify empirically, `06`).

## 5.6 Errors in the panel

Follow the catalogue in `02` §2.9. Non-blocking: rendering/uploading runs in the main process, the
panel is responsive throughout, and cancel lands a clean `Abort`.

## 5.7 Accessibility baseline

- All tool/transport buttons: `aria-label`, keyboard reachable (Tab order follows layout row order).
- Waveform alternative: numeric selection readout; focus visible on all interactive elements.
- Focus returns to the panel opener after publish completes (modal trap during the modal).