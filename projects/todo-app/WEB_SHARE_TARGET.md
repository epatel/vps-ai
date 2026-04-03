# Web Share Target for Flutter Web PWA

This document describes how the Todo App receives shared links from the browser/OS share sheet using the Web Share Target API.

## How it works

1. User installs the Todo App as a PWA ("Add to Home Screen" in Chrome)
2. When sharing a URL from any app/browser, "Todos" appears as a share target
3. Selecting it opens the Todo App with the Add Todo dialog pre-filled with the shared title and URL
4. User confirms to save it as a todo

## Requirements

- The app must be **installed as a PWA** (Add to Home Screen)
- Works on: Android Chrome, desktop Chrome/Edge, Chrome OS
- **iOS Safari does not support Web Share Target**

## What was needed

### 1. Custom service worker (`web/sw.js`)

Flutter's built-in service worker (`flutter_service_worker.js`) immediately unregisters itself on activation — it's a no-op stub. Chrome requires an active service worker with a `fetch` handler for PWA installation and share target support.

We provide our own minimal service worker that stays active:

```js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
```

Registered from `index.html` (not via Flutter's loader):

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js');
    });
  }
</script>
```

### 2. Disable Flutter's service worker registration (`web/flutter_bootstrap.js`)

Custom bootstrap that calls `_flutter.loader.load()` **without** `serviceWorkerSettings`, preventing Flutter from registering its self-destructing service worker:

```js
{{flutter_js}}
{{flutter_build_config}}

_flutter.loader.load();
```

### 3. Share target in manifest (`web/manifest.json`)

```json
{
  "share_target": {
    "action": "./",
    "method": "GET",
    "enctype": "application/x-www-form-urlencoded",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

The `enctype` must be set explicitly — Chrome warns if it's missing.

The manifest also needs `id`, `name`, `short_name`, `display: standalone`, and valid icons for PWA installability.

### 4. Share parameter handler (`lib/services/share_handler.dart`)

Reads `title`, `text`, and `url` query parameters from `Uri.base` on app startup. Builds a todo title and description from them, then cleans the URL via `history.replaceState` to prevent re-triggering on reload.

Uses `package:web` (not the deprecated `dart:html`).

### 5. Pre-filled Add Todo dialog

`AddTodoDialog` accepts optional `initialTitle` and `initialDescription` parameters. When the app detects shared data at startup, it passes it through `main.dart` → `app.dart` → `TodoListScreen`, which auto-opens the dialog pre-filled.

## Build command

```bash
flutter build web --base-href /todo-app/ --pwa-strategy=none
```

The `--pwa-strategy=none` flag (deprecated but functional) tells Flutter not to generate its own service worker logic. The custom `flutter_bootstrap.js` also prevents registration regardless.

## Files changed

- `web/manifest.json` — added `share_target`, `id`, improved `name`/`short_name`
- `web/sw.js` — new custom service worker
- `web/flutter_bootstrap.js` — custom bootstrap without service worker settings
- `web/index.html` — registers `sw.js`
- `lib/services/share_handler.dart` — reads share query params
- `lib/widgets/add_todo_dialog.dart` — accepts initial values
- `lib/screens/todo_list_screen.dart` — auto-opens dialog with shared data
- `lib/app.dart` — passes shared data through
- `lib/main.dart` — captures share params at startup
- `pubspec.yaml` — added `web` package dependency
