# Drop — Instant Cross-Device Sharing App

**Date:** 2026-04-04
**Project:** `projects/drop/`
**URL:** `https://ai.memention.net/drop/`

## Overview

Drop is an instant sharing app that lets you push content (links, text, images, files) from an Android phone to a desktop browser. A PWA installed on Android acts as the sender, a Python WebSocket broker relays messages, and a browser-based SPA on desktop displays a live feed of shared items.

Devices pair once using a 6-digit code (or QR scan). After pairing, both devices store a room token in localStorage and auto-reconnect on every visit. Shared items persist in SQLite until manually cleared.

## Core Requirements

- **Phone → Desktop sharing** of text, links, images, and files
- **Desktop → Phone** sharing deferred to a future version
- **1:1 pairing** — one phone, one desktop per room
- **One-time pairing** via 6-digit code or QR code, persistent via localStorage tokens
- **Persistent feed** — items survive across sessions, cleared manually
- **50MB file size limit** per upload
- All routes under `/drop/` prefix (nginx multi-project setup)

## Architecture

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│  Android PWA    │◄──────────────────────────►│  Python Broker   │
│  (Share Target  │    JSON messages over wss   │  (asyncio +     │
│   + Compose UI) │                             │   websockets)   │
└─────────────────┘                             │                 │
                                                │  SQLite for     │
┌─────────────────┐         WebSocket          │  persistence    │
│  Desktop Browser│◄──────────────────────────►│                 │
│  (Static SPA)   │    JSON messages over wss   │  Static file    │
└─────────────────┘                             │  serving        │
                                                └─────────────────┘
```

**Tech stack:**
- Python 3 with `asyncio` + `websockets` library (matches existing asteroids project pattern)
- SQLite for persistence (rooms, items)
- Static HTML/JS/CSS for both PWA and desktop SPA (no framework)
- Files stored on disk under `uploads/<room_id>/`
- nginx reverse proxy with WebSocket upgrade support

## Pairing Flow

### Desktop side
1. Opens `https://ai.memention.net/drop/` → WebSocket connects → server generates a 6-digit alphanumeric code
2. Page shows the code as large text + QR code (QR encodes `https://ai.memention.net/drop/?pair=ABC123`)
3. Waits for pairing — once paired, transitions to the feed view
4. Room token saved to localStorage — subsequent visits skip pairing and go straight to feed

### Phone side
1. Opens the PWA → if no room token in localStorage, shows pairing input
2. Enters the code manually (or if opened via QR, code is pre-filled from URL parameter)
3. WebSocket connects with the code → broker links both connections into a room
4. Room token saved to localStorage → transitions to compose/share screen
5. Subsequent opens skip pairing and go straight to compose screen

### Room lifecycle
- Room identified by a random UUID, created when pairing succeeds
- Pairing code is ephemeral — discarded after use, expires after 5 minutes
- Room tokens are 32-character random hex strings, one per device, stored in localStorage
- On reconnect, client sends its room token; broker sends any unseen items (tracked via `last_seen_id` per client)
- Rooms inactive for 30 days are garbage-collected (room, items, and uploaded files deleted)

## Content Types

| Type  | How it's sent                          | Desktop display                          |
|-------|----------------------------------------|------------------------------------------|
| Link  | WebSocket JSON message                 | Clickable link with URL                  |
| Text  | WebSocket JSON message                 | Text block, click to copy                |
| Image | HTTP POST upload, then WS notification | Inline image in feed                     |
| File  | HTTP POST upload, then WS notification | Filename + size + download button        |

### Upload flow (images/files)
1. Phone POSTs to `/drop/api/upload` with room token + file
2. Server stores file on disk under `uploads/<room_id>/<uuid>.<ext>`
3. Server creates item record in SQLite, pushes WS message to desktop
4. Desktop fetches file via `/drop/api/file/<room_id>/<file_id>` (authenticated by room token as query param)

### PWA Share Target
- PWA manifest declares `share_target` for text, URLs, and files
- Sharing from any Android app sends data to the PWA via POST to `/drop/share-target`
- Service worker intercepts, extracts shared data, sends through normal upload/message flow
- If the PWA is opened fresh via share (no active WebSocket), the shared content is queued in memory and sent automatically once the WebSocket connects and authenticates with the stored room token

## UI Design

### Desktop — Dark Compact Feed
- Dark theme (`#1a1a2e` background)
- Items as cards with colored left borders by type:
  - Purple (`#6c63ff`) for links
  - Green (`#4ecca3`) for images
  - Red (`#ff6b6b`) for text
  - Yellow (`#ffd93d`) for files
- Newest items at top
- Header shows connection status and pairing info
- Items include timestamp, content preview, and action (click link, copy text, download file)

### Phone PWA — Compose + History
- Dark theme matching desktop
- Top: compose area with text input, Send button, camera button, file picker button
- Below: scrollable list of recently sent items with type indicators and timestamps
- Connection status indicator in header
- When opened via share sheet, compose area pre-filled with shared content

### Pairing screens
- Desktop: large 6-digit code centered on screen + QR code below
- Phone: simple text input for code, or auto-filled if opened via QR URL

## Server Structure

```
projects/drop/
├── server.py          # Main async server (websockets + HTTP)
├── requirements.txt   # websockets, aiohttp
├── db.py              # SQLite helper (rooms, items)
├── static/
│   ├── desktop/       # Desktop SPA (HTML/JS/CSS)
│   └── pwa/           # Phone PWA (HTML/JS/CSS, manifest, service worker)
└── uploads/           # Stored files by room_id (gitignored)
```

### SQLite Schema

**rooms:**
- `id` TEXT PRIMARY KEY (UUID)
- `token_a` TEXT (desktop token)
- `token_b` TEXT (phone token)
- `pairing_code` TEXT (nullable, cleared after pairing)
- `code_expires_at` TEXT (ISO timestamp)
- `created_at` TEXT
- `last_active` TEXT

**items:**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `room_id` TEXT (FK to rooms)
- `type` TEXT (text/link/image/file)
- `content` TEXT (text content or filename)
- `metadata` TEXT (JSON — file size, mime type, original filename)
- `sender` TEXT (phone/desktop)
- `created_at` TEXT

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| WS | `/drop/ws` | Room token or pairing code | WebSocket connection |
| POST | `/drop/api/upload` | Room token | Upload image/file |
| GET | `/drop/api/file/<room_id>/<file_id>` | Room token (query param) | Download file |
| POST | `/drop/share-target` | Session/token | PWA share target receiver |

### WebSocket Messages

**Client → Server:**
- `{"type": "pair", "code": "ABC123"}` — pair with code
- `{"type": "reconnect", "token": "..."}` — reconnect to existing room
- `{"type": "item", "token": "...", "item_type": "text|link", "content": "..."}` — send text/link
- `{"type": "clear", "token": "..."}` — clear all items
- `{"type": "delete", "token": "...", "item_id": 123}` — delete single item

**Server → Client:**
- `{"type": "paired", "token": "...", "room_id": "..."}` — pairing successful
- `{"type": "code", "code": "ABC123", "expires_in": 300}` — pairing code for desktop
- `{"type": "item", "id": 1, "item_type": "text", "content": "...", "sender": "phone", "created_at": "..."}` — new item
- `{"type": "items", "items": [...]}` — batch of missed items on reconnect
- `{"type": "deleted", "item_id": 123}` — item deleted
- `{"type": "cleared"}` — all items cleared
- `{"type": "error", "message": "..."}` — error

## Security

- Room tokens (32-char random hex) act as bearer tokens — no user accounts
- All API endpoints require valid room token
- File uploads validated: MIME type check, 50MB limit, filename sanitization
- Rate limiting: max 10 uploads per minute per room
- Uploaded files served with `Content-Disposition` headers to prevent browser execution
- WebSocket connections authenticated on first message

## Deployment

- Systemd service (e.g., port 8090)
- Add to `hooks/post-merge` SERVICE_MAP: `["projects/drop"]="drop"`
- nginx location block:
  - `/drop/` → proxy to server
  - `/drop/ws` → proxy with WebSocket upgrade headers
- PWA manifest with `share_target` and service worker for app shell caching
- `uploads/` directory gitignored
