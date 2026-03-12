# Issue #25: Flutter and Friends Badge

**Status:** Complete

## Summary
Web-based recreation of the Flutter & Friends Badge project, allowing users to design
and write images to e-paper badges via Web Bluetooth (BLE) in the browser.

## What was built
- Badge editor web app served at `/badge`
- 4 badge templates: Conference, Minimal, Developer, Social
- Custom image upload with drag-and-drop
- E-paper dithering (Floyd-Steinberg, Atkinson, Stucki)
- Support for 3 color palettes: BW, BWR, BWYR
- Multiple badge sizes (3.7", 2.9", 2.6") and orientations
- Web Bluetooth BLE connection to write to physical e-paper badges
- PNG download of the designed badge
- Binary image conversion matching the original Flutter protocol

## Files
- `projects/badge/index.html` - Main HTML page
- `projects/badge/badge.js` - App logic (rendering, dithering, BLE)
