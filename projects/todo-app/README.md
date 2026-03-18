# Todo App

A Flutter web frontend for the [Todo API](../todo-api/).

**Live:** [https://ai.memention.net/todo-app/](https://ai.memention.net/todo-app/)

## Features

- User signup and login with email/password
- Create, edit, and delete todos
- Mark todos as done/undone with checkboxes
- Drag-and-drop reordering
- Responsive Material 3 design with light/dark theme support
- Persistent login via local storage

## Architecture

- **State management:** Provider (ChangeNotifier)
- **API communication:** `http` package with relative URLs (served behind same nginx)
- **Auth:** JWT tokens stored in SharedPreferences

## Project structure

```
lib/
├── main.dart                 # Entry point
├── app.dart                  # MaterialApp with theme and auth routing
├── models/
│   └── todo.dart             # Todo data model
├── services/
│   └── api_service.dart      # HTTP client for todo-api
├── providers/
│   ├── auth_provider.dart    # Authentication state
│   └── todo_provider.dart    # Todo list state
├── screens/
│   ├── login_screen.dart     # Login / signup form
│   └── todo_list_screen.dart # Main todo list with reordering
└── widgets/
    ├── todo_tile.dart        # Individual todo card
    ├── add_todo_dialog.dart  # New todo dialog
    └── edit_todo_dialog.dart # Edit todo dialog
```

## Build

```bash
flutter pub get
flutter build web --base-href /todo-app/ --release
```

Build output goes to `build/web/` and is served by nginx.

A GitHub Actions workflow (`.github/workflows/build-todo-app.yml`) automatically
rebuilds when source changes are pushed to `main`.

## Nginx

The app is served as static files at `/todo-app/`:

```nginx
location /todo-app/ {
    alias /home/epatel/vps-ai/projects/todo-app/build/web/;
    index index.html;
    try_files $uri $uri/ /todo-app/index.html;
}
```

API requests use relative paths (`/todo-api/...`) so they go through the same
nginx instance — no CORS issues.
