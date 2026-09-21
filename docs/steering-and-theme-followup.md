# Steering and theme follow-up

The preceding `bc98779` change covers camera performance only. This follow-up
addresses steering presentation, reviewer context, and explicit theme context.

## Steering

- Capture a display boundary when a user sends steering during a managed run.
  Project subsequent progress below that message, including the suffix of a
  streaming message that crosses the boundary. Existing tool actions retain
  their original position and still receive completion updates.
- Show the final answer, run duration and artifacts after the last steer. Keep
  the complete runtime run intact in storage. Restore model history using the
  same chronological projection after refresh. Multiple steers are supported.
- Label RPC acceptance as “Sent to agent,” not proof of incorporation. Surface
  delivery failures on the steering message. Request a specific, natural model
  acknowledgement in the next progress update; do not synthesize one in the UI.
- Keep the original question, observed research and reviewer work when steering
  updates an active run. A new completed-run follow-up still starts fresh review
  bookkeeping. Existing native turn/steer dispatch remains in use.

## Themes

- Send the current theme with user input. Return fresh theme context and both
  host token palettes from canvas read, plan and review, and code-workspace canvas
  context. Explicitly tell the model to support theme switching and preserve
  evidence pixels.
- Share neutral/accent/note tokens between public native rendering and private
  rendering. Previously their light-mode muted, violet and line values differed.
- Record the actual theme used for review images; recapture on theme changes
  while the observation surface is mounted and reject stale-theme captures.
  The model can distinguish the current theme from an older retained capture.
- Preserve literal swatch colors while accounting for their background when
  adapting descendant text.

This is not universal palette certification. The existing renderer adapts
supported solid foregrounds, surfaces, borders and SVG colors reversibly.
Raster images/screenshots, generated media, gradients, patterns, unsupported
color expressions, and semantic distinctions between chart colors need explicit
design and visual inspection. Original evidence is not recolored. A literal
brand swatch can remain exact while its surrounding label uses themed ink.

Validation: source/diff review only; no tests, builds or browser evaluations were
run, per the user's standing instruction. Deploy both the Vercel client and the
Render worker for the complete change. Existing running worker sessions retain
the instructions with which they were created; use a new run after deployment.
