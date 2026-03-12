# Issue #33: Update QR

**Status:** Fixed

## Problem
1. No obvious way to set QR code content - users couldn't find where to enter the QR URL/text
2. QR codes couldn't be scanned on Android - dithering algorithm was corrupting the QR modules

## Fix
- Added a dedicated "QR Code Content" input field that appears when the QR Code template is selected
- Disabled dithering for the QR code template (QR codes must be crisp black/white to be scannable)
- Added proper quiet zone (4-module white border) around QR codes per QR spec
- Ensured minimum cell size (3px portrait, 2px landscape) for reliable scanning
- Changed to error correction level L for simpler QR codes with larger cells
