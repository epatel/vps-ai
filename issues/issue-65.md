# Issue 65: Make a count down clock

## Status: Complete

## Description
Countdown clock at `/trumps48hours` counting down to March 23, 2026 at 23:44:00 GMT.

## What was done
- Created `projects/trumps48hours/index.html` - a single-page countdown clock
- Design: dark theme with red accents, Orbitron font, particle effects, animated grid background
- Format: T-HH:MM.SS with flip animations on digit changes
- Progress bar showing elapsed time over 48-hour window
- "TARGET REACHED" message when countdown completes
- Configured nginx to serve at `/trumps48hours`
