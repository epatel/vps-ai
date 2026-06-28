# Issue #120: fix emoji-mixer details

## Requests
1. Add tooltips
2. When creating PNG, crop so it only contains emojis and nothing more
3. Bounding rectangle looks off

## Status: Done

## Changes (`projects/emoji-mixer/index.html`)
- **Tooltips** added/enriched on every control: tool buttons (with keyboard
  shortcuts), the canvas, scale/rotation sliders, search box and header buttons.
- **PNG crop**: export canvas is sized to the emojis' real pixel bounds (small
  anti-alias margin) and fully-transparent borders are trimmed, so the PNG
  contains only the emojis.
- **Selection rectangle fix**: emoji glyph bounds are now measured from rendered
  pixels (cached per emoji) instead of assuming a centred square. The selection
  box, hit-testing and the scale/rotate handle now hug the actual glyph.

Static site, served by nginx — no build/service changes required.
