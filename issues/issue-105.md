# Issue #105: Fix drag

## Problem

Todo-app: long-press to drag-reorder is still broken on mobile web despite
earlier fixes in issues #101 and #103.

## Root cause

The previous fix (#103) added `touch-action: pan-y` to `body` in
`projects/todo-app/web/index.html`. This was counter-productive:

- `touch-action: pan-y` tells the **browser** it owns vertical pan gestures,
  so the browser captures `touchmove` events as page scrolls and never
  forwards them to Flutter.
- Drag-reorder is inherently a vertical drag. After long-press finishes and
  the user moves their finger, the browser intercepts the movement and
  Flutter's drag gesture never sees the updates — the card stays put.
- Flutter's glass pane (`flt-glass-pane`) already sets `touch-action: none`
  on itself at runtime, so a body-level `pan-y` override is both redundant
  and harmful.

A secondary issue: the `proxyDecorator` used `Curves.easeInOut` which
starts very slowly, so users long-pressing successfully didn't see
immediate visual feedback and assumed nothing happened.

## Fix

- `projects/todo-app/web/index.html`:
  - Remove `touch-action: pan-y` from body.
  - Explicitly force `touch-action: none !important` on `flutter-view` and
    `flt-glass-pane` so the Flutter canvas owns all touch gestures.
  - Keep context-menu prevention and add `selectstart` suppression so text
    selection doesn't start during a long press.
  - Add `overscroll-behavior: none` to stop rubber-band / pull-to-refresh
    stealing the pointer.
- `projects/todo-app/lib/screens/todo_list_screen.dart`:
  - Switch the proxy decorator's easing from `easeInOut` to `easeOut` so
    feedback is near-instant when drag starts.
  - Bump elevation (8 → 12) and scale (1.03 → 1.04) slightly for clearer
    "item is being dragged" feedback.

## Result

Long-press on a todo card now reliably starts drag-reorder on mobile web;
the visual lift/shadow appears immediately so the user knows the gesture
registered, and subsequent vertical finger movement is forwarded to Flutter
instead of being eaten by the browser's native scroll.
