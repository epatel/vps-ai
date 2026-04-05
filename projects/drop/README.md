# Drop — Instant Cross-Device Sharing

Push text, links, images, and files from your phone to your desktop browser instantly.

**Live at:** https://ai.memention.net/drop/

## How it works

1. Open the desktop URL — a pairing code and QR code appear
2. On your phone, open the PWA URL or scan the QR code
3. Enter the pairing code — devices are now linked
4. Share content from your phone — it appears on the desktop in real-time

Pairing is persistent (stored in localStorage). Both devices auto-reconnect on subsequent visits.

## URLs

| What | URL |
|------|-----|
| Desktop | https://ai.memention.net/drop/ |
| Phone PWA | https://ai.memention.net/drop/pwa/ |

## Features

- **Text & links** — type or paste, links are auto-detected and clickable
- **Images** — shared inline with thumbnails on both sides
- **Files** — upload up to 50MB, download from desktop
- **Android Share Target** — install the PWA, then share directly from any app
- **Real-time sync** — items, deletions, and clears sync across devices instantly
- **Persistent storage** — items survive across sessions (SQLite)
- **Re-pairing** — "Pair Device" button generates a new code for the same room

## Tech Stack

- **Server:** Python 3 / aiohttp / aiosqlite
- **Desktop SPA:** Vanilla HTML/JS/CSS
- **Phone PWA:** Vanilla HTML/JS/CSS with Service Worker and Share Target API
- **Storage:** SQLite (rooms + items), disk (uploaded files)

## Development

```bash
# Setup
cd projects/drop
bash setup.sh

# Run locally
source venv/bin/activate
python server.py --port 8090

# Open in browser
# Desktop: http://localhost:8090/drop/
# Phone:   http://localhost:8090/drop/pwa/

# Run tests
python -m pytest tests/test_db.py -v
python -m tests.test_server
```

## Deployment

The service runs as a systemd unit on `ai.memention.net`.

```bash
# Install service
sudo cp drop.service /etc/systemd/system/
sudo systemctl enable --now drop

# Nginx config (see nginx.conf.example)
# Add /drop/ws (WebSocket upgrade) and /drop/ (proxy) location blocks

# Restart
sudo systemctl restart drop

# Logs
sudo journalctl -u drop -f
```

The post-merge git hook auto-restarts the service when project files change.

## Project Structure

```
projects/drop/
├── server.py              # aiohttp server (WebSocket + HTTP + static)
├── db.py                  # SQLite database (rooms, items)
├── requirements.txt       # aiohttp, aiosqlite
├── setup.sh               # Create venv, install deps
├── drop.service           # systemd unit file
├── nginx.conf.example     # nginx location blocks
├── static/
│   ├── desktop/           # Desktop SPA (pairing + feed)
│   └── pwa/               # Phone PWA (pairing + compose + share target)
├── tests/
│   ├── test_db.py         # Database unit tests (10)
│   └── test_server.py     # Server integration tests (6)
└── uploads/               # Stored files by room_id (gitignored)
```
