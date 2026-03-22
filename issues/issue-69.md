# Issue 69: Claude on status page

Add Claude instance count and history graph to the status page.

## Status: Complete

## Changes
- `projects/status-page/server.py`: Added `get_claude_count()` using `pgrep -c claude`, added history buffer and collector flush for claude instances (1-minute intervals, 1-hour history)
- `projects/status-page/index.html`: Added "Claude Instances" card with live count and canvas graph
