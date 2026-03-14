# Issue #48: Badge - Text item colors

## Status: Complete

## Changes
- Added per-text-item color pickers (text color + background color) next to each text input field
- Each of the 4 text items (Name, Title, Company, Extra) now has two color inputs: Text and Bg
- Mix template's `drawMixTextItem` now uses per-item `bgColor` instead of forced white
- Accent color button still syncs Company and Extra text colors by default
- State tracks `itemColors` with per-item text and bg colors
