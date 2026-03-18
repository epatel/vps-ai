# Issue #56: Make todo frontend

**Status:** Complete

## Summary
Created a Flutter web frontend for the todo API at `https://ai.memention.net/todo-app/`.

## What was done
- Created Flutter web project at `projects/todo-app/`
- Implemented login/signup screen with form validation
- Implemented todo list with create, edit, delete, toggle done, and drag-to-reorder
- Uses Provider for state management and relative API URLs
- Material 3 design with light/dark theme support
- Set up nginx to serve static files at `/todo-app/`
- Created GitHub Actions workflow for automated builds
