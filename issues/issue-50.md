# Issue #50: Fix badge color selection

## Status: Done

## Problem
Color selection for text items in the badge editor used `<input type="color">` which allowed any arbitrary color, but the e-paper badge only supports a limited color palette (BW, BWR, or BWYR).

## Solution
- Replaced `<input type="color">` pickers with custom palette-constrained color swatches
- Clicking a swatch opens a popup showing only the colors available in the current palette
- When the palette changes, all selected colors snap to the nearest available palette color
- Accent color row also dynamically updates to show only palette-available colors
- Initial default colors updated from non-palette values (e.g. `#e94560`) to actual palette colors (e.g. `#ff0000`)
