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
- A live search box — matches the glyph, a name/keyword (`banana`, `sweden`,
  `castle`), or a whole category (`flags`, `food`). Every emoji is searchable
  by name (generated from the unicode-emoji-json dataset).
- Tap any emoji to drop it into the centre of the mixing area.

### Import your own images
Images become items that behave exactly like emojis — move, scale, rotate,
mirror, layer, duplicate, and export them the same way.
- **🖼️ Image** button in the header opens a file picker (multi-select).
- **Drag & drop** image files onto the canvas (dropped at the cursor).
- **Paste** an image from the clipboard (`Cmd/Ctrl+V`).
- Stored as data URLs so they persist across reloads and keep the PNG export
  fully working (no canvas tainting). Large images are downscaled to 1600 px
  on the longest side to keep storage and performance sane.

### Render quality (header selector)
Large emojis can look rough because platform color-emoji fonts are bitmaps.
A header dropdown picks how glyphs are drawn (remembered across reloads):
- **HD Native** — the platform's own emoji, drawn into a supersampled
  backing store so they antialias smoothly. No network needed; keeps the
  native look.
- **Twemoji (SVG)** / **Noto (SVG)** — vector glyphs from a CDN that stay
  crisp at any size and in the exported PNG. Loaded with CORS so export still
  works; any glyph a set lacks falls back to the platform font.

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
- Emojis are rendered onto an HTML `<canvas>` — either as text (with the system
  color-emoji font) or as vector SVG images (Twemoji/Noto), selectable at runtime.
  Imported pictures are a third item kind drawn from a decoded `<img>`. The same
  paint path (`paintItem`) feeds the live canvas and the PNG export, so the
  download matches the on-screen view.
- Every item — emoji or image — shares one transform/selection model; bounds are
  derived from the glyph (measured) or the image (aspect ratio), so selection
  rectangles and the scale/rotate handle hug whatever is actually drawn.
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
