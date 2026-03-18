# Issue #54: Make a todo API

## Status: Complete

## What was done
- Created Todo API at `projects/todo-api/` using Flask + SQLite
- JWT-based authentication with bcrypt password hashing
- User signup with Mailjet email verification flow
- Full CRUD for todo items with ordering support (float-based sort_order)
- Reorder endpoint for frontend drag-and-drop
- Descriptions support markdown (stored as-is, parsed by frontend)
- Service running at https://ai.memention.net/todo-api/
- Configured nginx proxy and systemd service
- Updated post-merge hook for auto-restart on deploy
