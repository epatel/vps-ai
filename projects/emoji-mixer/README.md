# Emoji Mixer

A browser-based emoji collage tool. Pick emojis, arrange them on a canvas, transform
them freely, and export the result as a transparent PNG.

Served at **`/emoji-mixer`** — <https://ai.memention.net/emoji-mixer>

## Features

The UI has the three requested parts plus a download button:

### 1. Mixing area (canvas)
- **Move** — drag any emoji.
- **Scale & rotate** — drag the orange corner handle on the selected emoji.
- A checkerboard background indicates transparency.
- Fine controls: scale and rotation sliders appear in the panel below the canvas.

### 2. Tool area
- **Layer** — bring forward / send backward / bring to front / send to back.
- **Transform** — scale up/down, rotate left/right, **mirror** (flip left↔right).
- **Edit** — duplicate, remove.

### 3. Emoji selection matrix
- Category tabs (Smileys, People, Animals, Food, Activity, Travel, Objects, Symbols, Flags).
- A live search box (matches the glyph or a keyword like `fire`, `heart`, `dog`).
- Tap any emoji to drop it into the centre of the mixing area.

### Download as PNG
- The **PNG** button in the header exports your composition (at 2× resolution,
  transparent background) and downloads `emoji-mix.png`.
- The export is **cropped tightly to the emojis** — the image is sized to the
  emojis' real pixel bounds (plus a couple of pixels for anti-aliasing) and any
  fully-transparent border is trimmed, so the PNG contains the emojis and nothing
  more.

## Extras
- **Tooltips** on every control (buttons, sliders, search, canvas) explain what
  each does, including keyboard shortcuts.
- Work is auto-saved to `localStorage`, so a reload restores your composition.
- Keyboard shortcuts when an emoji is selected: `Delete`/`Backspace` remove,
  `[` / `]` change layer, `m` mirror, `d` duplicate, `Esc` deselect.
- Fully responsive — the picker moves below the canvas on narrow / mobile screens
  and all interactions use pointer events (works with touch).

## Implementation
- Single static `index.html`, no build step, no dependencies.
- Emojis are rendered as text onto an HTML `<canvas>` (with the system color-emoji
  font), which is also what makes the PNG export pixel-identical to the on-screen view.
- Selection rectangles, hit-testing and the scale/rotate handle use each emoji's
  **measured glyph bounds** (sampled once per emoji from rendered pixels and cached)
  rather than a fixed square, so the bounding box hugs the actual glyph.

## Deployment
Static site served by nginx via an `alias` to this directory:

```nginx
location /emoji-mixer {
    alias /home/epatel/vps-ai/projects/emoji-mixer/;
    index index.html;
}
```

No server process or build is required.
