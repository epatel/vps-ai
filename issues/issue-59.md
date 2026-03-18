# Issue #59: Update todo-app

## Status: Complete

## Changes
1. **Markdown description display**: Clicking a todo item now expands to show its description rendered as markdown (using `flutter_markdown` package). An expand/collapse icon appears for items with descriptions.
2. **Fixed duplicate drag icons**: Removed the explicit `Icons.drag_handle` from TodoTile since `ReorderableListView` already provides its own drag handle.
3. **Confirm password on signup**: Added a "Confirm Password" field that appears during signup mode with validation that passwords match.
