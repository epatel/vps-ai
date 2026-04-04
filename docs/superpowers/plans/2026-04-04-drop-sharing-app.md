# Drop — Instant Cross-Device Sharing App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-to-desktop instant sharing app with WebSocket relay, persistent feed, and PWA share target support.

**Architecture:** Python `aiohttp` server handles WebSocket connections, HTTP file upload/download, and static file serving on a single port. Desktop SPA and phone PWA are plain HTML/JS/CSS — no framework. SQLite stores rooms and items; uploaded files go to disk.

**Tech Stack:** Python 3 / aiohttp / websockets / SQLite / vanilla HTML+JS+CSS / PWA Share Target API

**Spec:** `docs/superpowers/specs/2026-04-04-drop-sharing-app-design.md`

---

## File Structure

```
projects/drop/
├── server.py              # aiohttp app: WebSocket handler, HTTP routes, static serving
├── db.py                  # SQLite database helper (rooms, items CRUD)
├── requirements.txt       # aiohttp, aiosqlite
├── setup.sh               # Create venv, install deps, init db
├── drop.service           # systemd unit file
├── .gitignore             # uploads/, venv/, *.db
├── static/
│   ├── desktop/
│   │   ├── index.html     # Desktop SPA (pairing + feed, single page)
│   │   ├── style.css      # Dark compact feed theme
│   │   └── app.js         # WebSocket client, feed rendering, pairing logic
│   └── pwa/
│       ├── index.html     # Phone PWA (pairing + compose, single page)
│       ├── style.css      # Dark theme matching desktop
│       ├── app.js         # WebSocket client, compose UI, share target handling
│       ├── manifest.json  # PWA manifest with share_target
│       └── sw.js          # Service worker (app shell cache + share target intercept)
├── tests/
│   ├── test_db.py         # Database unit tests
│   └── test_server.py     # Server integration tests (WebSocket + HTTP)
└── uploads/               # File storage by room_id (gitignored)
```

---

### Task 1: Project Scaffolding and Database Layer

**Files:**
- Create: `projects/drop/db.py`
- Create: `projects/drop/requirements.txt`
- Create: `projects/drop/setup.sh`
- Create: `projects/drop/.gitignore`
- Create: `projects/drop/tests/test_db.py`

- [ ] **Step 1: Create project directory and requirements**

```bash
mkdir -p projects/drop/tests projects/drop/static/desktop projects/drop/static/pwa projects/drop/uploads
```

`projects/drop/requirements.txt`:
```
aiohttp==3.11.18
aiosqlite==0.21.0
```

`projects/drop/.gitignore`:
```
venv/
uploads/
*.db
__pycache__/
```

- [ ] **Step 2: Create setup script**

`projects/drop/setup.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

mkdir -p uploads
echo "Setup complete. Activate with: source venv/bin/activate"
```

- [ ] **Step 3: Run setup**

```bash
cd projects/drop && bash setup.sh
```

- [ ] **Step 4: Write failing database tests**

`projects/drop/tests/test_db.py`:
```python
import asyncio
import os
import tempfile
import unittest

# Add parent to path so we can import db
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import Database


class TestDatabase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.db = Database(self.tmp.name)
        asyncio.get_event_loop().run_until_complete(self.db.init())

    def tearDown(self):
        asyncio.get_event_loop().run_until_complete(self.db.close())
        os.unlink(self.tmp.name)

    def run_async(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_create_room_with_pairing_code(self):
        room = self.run_async(self.db.create_room())
        self.assertIsNotNone(room["id"])
        self.assertIsNotNone(room["pairing_code"])
        self.assertEqual(len(room["pairing_code"]), 6)
        self.assertIsNotNone(room["token_a"])  # desktop token
        self.assertEqual(len(room["token_a"]), 32)

    def test_find_room_by_pairing_code(self):
        room = self.run_async(self.db.create_room())
        found = self.run_async(self.db.find_room_by_code(room["pairing_code"]))
        self.assertEqual(found["id"], room["id"])

    def test_complete_pairing(self):
        room = self.run_async(self.db.create_room())
        token_b = self.run_async(self.db.complete_pairing(room["id"]))
        self.assertEqual(len(token_b), 32)
        # Pairing code should be cleared
        found = self.run_async(self.db.find_room_by_code(room["pairing_code"]))
        self.assertIsNone(found)

    def test_find_room_by_token(self):
        room = self.run_async(self.db.create_room())
        token_b = self.run_async(self.db.complete_pairing(room["id"]))
        # Find by desktop token
        found_a = self.run_async(self.db.find_room_by_token(room["token_a"]))
        self.assertEqual(found_a["id"], room["id"])
        # Find by phone token
        found_b = self.run_async(self.db.find_room_by_token(token_b))
        self.assertEqual(found_b["id"], room["id"])

    def test_expired_pairing_code_not_found(self):
        room = self.run_async(self.db.create_room(code_ttl_seconds=0))
        import time
        time.sleep(0.1)
        found = self.run_async(self.db.find_room_by_code(room["pairing_code"]))
        self.assertIsNone(found)

    def test_add_and_get_items(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        item_id = self.run_async(
            self.db.add_item(room["id"], "text", "Hello world", "phone")
        )
        self.assertIsInstance(item_id, int)
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["content"], "Hello world")
        self.assertEqual(items[0]["type"], "text")
        self.assertEqual(items[0]["sender"], "phone")

    def test_get_items_since(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        id1 = self.run_async(self.db.add_item(room["id"], "text", "First", "phone"))
        id2 = self.run_async(self.db.add_item(room["id"], "link", "https://example.com", "phone"))
        items = self.run_async(self.db.get_items(room["id"], since_id=id1))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["content"], "https://example.com")

    def test_delete_item(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        item_id = self.run_async(self.db.add_item(room["id"], "text", "Delete me", "phone"))
        self.run_async(self.db.delete_item(room["id"], item_id))
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(len(items), 0)

    def test_clear_items(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        self.run_async(self.db.add_item(room["id"], "text", "One", "phone"))
        self.run_async(self.db.add_item(room["id"], "text", "Two", "phone"))
        self.run_async(self.db.clear_items(room["id"]))
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(len(items), 0)

    def test_add_item_with_metadata(self):
        room = self.run_async(self.db.create_room())
        self.run_async(self.db.complete_pairing(room["id"]))
        metadata = '{"size": 1024, "mime": "image/png", "filename": "photo.png"}'
        item_id = self.run_async(
            self.db.add_item(room["id"], "image", "abc123.png", "phone", metadata=metadata)
        )
        items = self.run_async(self.db.get_items(room["id"]))
        self.assertEqual(items[0]["metadata"], metadata)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd projects/drop && venv/bin/python -m pytest tests/test_db.py -v
```

Expected: `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 6: Implement database layer**

`projects/drop/db.py`:
```python
import aiosqlite
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta


class Database:
    def __init__(self, db_path="drop.db"):
        self.db_path = db_path
        self._db = None

    async def init(self):
        self._db = await aiosqlite.connect(self.db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        await self._db.executescript("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                token_a TEXT NOT NULL,
                token_b TEXT,
                pairing_code TEXT,
                code_expires_at TEXT,
                created_at TEXT NOT NULL,
                last_active TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rooms_token_a ON rooms(token_a);
            CREATE INDEX IF NOT EXISTS idx_rooms_token_b ON rooms(token_b);
            CREATE INDEX IF NOT EXISTS idx_rooms_pairing_code ON rooms(pairing_code);

            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                sender TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_items_room_id ON items(room_id);
        """)
        await self._db.commit()

    async def close(self):
        if self._db:
            await self._db.close()

    def _generate_code(self):
        chars = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(chars) for _ in range(6))

    def _generate_token(self):
        return secrets.token_hex(16)

    async def create_room(self, code_ttl_seconds=300):
        room_id = str(uuid.uuid4())
        token_a = self._generate_token()
        pairing_code = self._generate_code()
        now = datetime.now(timezone.utc).isoformat()
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=code_ttl_seconds)).isoformat()

        await self._db.execute(
            "INSERT INTO rooms (id, token_a, pairing_code, code_expires_at, created_at, last_active) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (room_id, token_a, pairing_code, expires_at, now, now),
        )
        await self._db.commit()
        return {"id": room_id, "token_a": token_a, "pairing_code": pairing_code}

    async def find_room_by_code(self, code):
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self._db.execute(
            "SELECT * FROM rooms WHERE pairing_code = ? AND code_expires_at > ?",
            (code, now),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def complete_pairing(self, room_id):
        token_b = self._generate_token()
        await self._db.execute(
            "UPDATE rooms SET token_b = ?, pairing_code = NULL, code_expires_at = NULL, "
            "last_active = ? WHERE id = ?",
            (token_b, datetime.now(timezone.utc).isoformat(), room_id),
        )
        await self._db.commit()
        return token_b

    async def find_room_by_token(self, token):
        cursor = await self._db.execute(
            "SELECT * FROM rooms WHERE token_a = ? OR token_b = ?",
            (token, token),
        )
        row = await cursor.fetchone()
        if row:
            await self._db.execute(
                "UPDATE rooms SET last_active = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), row["id"]),
            )
            await self._db.commit()
            return dict(row)
        return None

    async def add_item(self, room_id, item_type, content, sender, metadata=None):
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self._db.execute(
            "INSERT INTO items (room_id, type, content, metadata, sender, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (room_id, item_type, content, metadata, sender, now),
        )
        await self._db.commit()
        return cursor.lastrowid

    async def get_items(self, room_id, since_id=None):
        if since_id:
            cursor = await self._db.execute(
                "SELECT * FROM items WHERE room_id = ? AND id > ? ORDER BY id ASC",
                (room_id, since_id),
            )
        else:
            cursor = await self._db.execute(
                "SELECT * FROM items WHERE room_id = ? ORDER BY id ASC",
                (room_id,),
            )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def delete_item(self, room_id, item_id):
        await self._db.execute(
            "DELETE FROM items WHERE id = ? AND room_id = ?",
            (item_id, room_id),
        )
        await self._db.commit()

    async def clear_items(self, room_id):
        await self._db.execute("DELETE FROM items WHERE room_id = ?", (room_id,))
        await self._db.commit()

    async def cleanup_stale_rooms(self, max_age_days=30):
        cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
        cursor = await self._db.execute(
            "SELECT id FROM rooms WHERE last_active < ?", (cutoff,)
        )
        stale = [row["id"] for row in await cursor.fetchall()]
        if stale:
            placeholders = ",".join("?" for _ in stale)
            await self._db.execute(f"DELETE FROM items WHERE room_id IN ({placeholders})", stale)
            await self._db.execute(f"DELETE FROM rooms WHERE id IN ({placeholders})", stale)
            await self._db.commit()
        return stale
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd projects/drop && venv/bin/python -m pytest tests/test_db.py -v
```

Expected: All 10 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add projects/drop/db.py projects/drop/requirements.txt projects/drop/setup.sh projects/drop/.gitignore projects/drop/tests/test_db.py
git commit -m "feat(drop): add project scaffolding and database layer"
```

---

### Task 2: WebSocket Server — Pairing and Message Relay

**Files:**
- Create: `projects/drop/server.py`
- Create: `projects/drop/tests/test_server.py`

- [ ] **Step 1: Write failing server tests**

`projects/drop/tests/test_server.py`:
```python
import asyncio
import json
import os
import sys
import tempfile
import unittest

import aiohttp
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import create_app
from db import Database


class TestDropServer(AioHTTPTestCase):
    async def get_application(self):
        self.tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp_db.close()
        self.tmp_uploads = tempfile.mkdtemp()
        app = await create_app(
            db_path=self.tmp_db.name,
            uploads_dir=self.tmp_uploads,
            static_dir=None,
        )
        return app

    async def tearDownAsync(self):
        await self.app["db"].close()
        os.unlink(self.tmp_db.name)
        import shutil
        shutil.rmtree(self.tmp_uploads, ignore_errors=True)

    @unittest_run_loop
    async def test_pairing_flow(self):
        # Desktop connects, gets a code
        async with self.client.ws_connect("/drop/ws") as desktop_ws:
            await desktop_ws.send_json({"type": "request_code"})
            resp = await desktop_ws.receive_json()
            self.assertEqual(resp["type"], "code")
            code = resp["code"]
            self.assertEqual(len(code), 6)

            # Phone connects with the code
            async with self.client.ws_connect("/drop/ws") as phone_ws:
                await phone_ws.send_json({"type": "pair", "code": code})
                phone_resp = await phone_ws.receive_json()
                self.assertEqual(phone_resp["type"], "paired")
                phone_token = phone_resp["token"]

                # Desktop should also get paired notification
                desktop_resp = await desktop_ws.receive_json()
                self.assertEqual(desktop_resp["type"], "paired")
                desktop_token = desktop_resp["token"]

                self.assertNotEqual(phone_token, desktop_token)

    @unittest_run_loop
    async def test_send_text_item(self):
        # Pair first
        async with self.client.ws_connect("/drop/ws") as desktop_ws:
            await desktop_ws.send_json({"type": "request_code"})
            resp = await desktop_ws.receive_json()
            code = resp["code"]

            async with self.client.ws_connect("/drop/ws") as phone_ws:
                await phone_ws.send_json({"type": "pair", "code": code})
                phone_resp = await phone_ws.receive_json()
                phone_token = phone_resp["token"]
                desktop_resp = await desktop_ws.receive_json()

                # Phone sends text
                await phone_ws.send_json({
                    "type": "item",
                    "token": phone_token,
                    "item_type": "text",
                    "content": "Hello from phone",
                })

                # Desktop should receive it
                item_msg = await desktop_ws.receive_json()
                self.assertEqual(item_msg["type"], "item")
                self.assertEqual(item_msg["content"], "Hello from phone")
                self.assertEqual(item_msg["item_type"], "text")
                self.assertEqual(item_msg["sender"], "phone")

    @unittest_run_loop
    async def test_reconnect_with_token(self):
        # Pair
        async with self.client.ws_connect("/drop/ws") as desktop_ws:
            await desktop_ws.send_json({"type": "request_code"})
            resp = await desktop_ws.receive_json()
            code = resp["code"]

            async with self.client.ws_connect("/drop/ws") as phone_ws:
                await phone_ws.send_json({"type": "pair", "code": code})
                phone_resp = await phone_ws.receive_json()
                phone_token = phone_resp["token"]
                desktop_resp = await desktop_ws.receive_json()
                desktop_token = desktop_resp["token"]

                # Phone sends an item
                await phone_ws.send_json({
                    "type": "item",
                    "token": phone_token,
                    "item_type": "link",
                    "content": "https://example.com",
                })
                await desktop_ws.receive_json()  # consume the item message

        # Desktop reconnects with token
        async with self.client.ws_connect("/drop/ws") as desktop_ws2:
            await desktop_ws2.send_json({
                "type": "reconnect",
                "token": desktop_token,
                "last_seen_id": 0,
            })
            resp = await desktop_ws2.receive_json()
            self.assertEqual(resp["type"], "reconnected")

            items_resp = await desktop_ws2.receive_json()
            self.assertEqual(items_resp["type"], "items")
            self.assertEqual(len(items_resp["items"]), 1)
            self.assertEqual(items_resp["items"][0]["content"], "https://example.com")

    @unittest_run_loop
    async def test_invalid_pairing_code(self):
        async with self.client.ws_connect("/drop/ws") as ws:
            await ws.send_json({"type": "pair", "code": "XXXXXX"})
            resp = await ws.receive_json()
            self.assertEqual(resp["type"], "error")

    @unittest_run_loop
    async def test_delete_item(self):
        async with self.client.ws_connect("/drop/ws") as desktop_ws:
            await desktop_ws.send_json({"type": "request_code"})
            resp = await desktop_ws.receive_json()
            code = resp["code"]

            async with self.client.ws_connect("/drop/ws") as phone_ws:
                await phone_ws.send_json({"type": "pair", "code": code})
                phone_resp = await phone_ws.receive_json()
                phone_token = phone_resp["token"]
                desktop_resp = await desktop_ws.receive_json()
                desktop_token = desktop_resp["token"]

                # Send item
                await phone_ws.send_json({
                    "type": "item",
                    "token": phone_token,
                    "item_type": "text",
                    "content": "Delete me",
                })
                item_msg = await desktop_ws.receive_json()
                item_id = item_msg["id"]

                # Delete from desktop
                await desktop_ws.send_json({
                    "type": "delete",
                    "token": desktop_token,
                    "item_id": item_id,
                })
                del_msg = await phone_ws.receive_json()
                self.assertEqual(del_msg["type"], "deleted")
                self.assertEqual(del_msg["item_id"], item_id)

    @unittest_run_loop
    async def test_file_upload_and_download(self):
        # Pair first
        async with self.client.ws_connect("/drop/ws") as desktop_ws:
            await desktop_ws.send_json({"type": "request_code"})
            resp = await desktop_ws.receive_json()
            code = resp["code"]

            async with self.client.ws_connect("/drop/ws") as phone_ws:
                await phone_ws.send_json({"type": "pair", "code": code})
                phone_resp = await phone_ws.receive_json()
                phone_token = phone_resp["token"]
                await desktop_ws.receive_json()

                # Upload a file
                data = aiohttp.FormData()
                data.add_field("token", phone_token)
                data.add_field(
                    "file",
                    b"fake image data",
                    filename="test.png",
                    content_type="image/png",
                )
                upload_resp = await self.client.post("/drop/api/upload", data=data)
                self.assertEqual(upload_resp.status, 200)
                upload_json = await upload_resp.json()
                file_id = upload_json["item_id"]

                # Desktop should get WS notification
                item_msg = await desktop_ws.receive_json()
                self.assertEqual(item_msg["type"], "item")
                self.assertEqual(item_msg["item_type"], "image")

                # Download the file
                room = await self.app["db"].find_room_by_token(phone_token)
                dl_resp = await self.client.get(
                    f"/drop/api/file/{room['id']}/{file_id}?token={phone_token}"
                )
                self.assertEqual(dl_resp.status, 200)
                body = await dl_resp.read()
                self.assertEqual(body, b"fake image data")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd projects/drop && venv/bin/python -m pytest tests/test_server.py -v
```

Expected: `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 3: Implement the server**

`projects/drop/server.py`:
```python
import argparse
import asyncio
import json
import logging
import os
import uuid
from collections import defaultdict
from pathlib import Path

from aiohttp import web

from db import Database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Maps room_id -> {"desktop": websocket, "phone": websocket}
connections: dict[str, dict[str, web.WebSocketResponse]] = {}
# Maps pending pairing code -> desktop websocket
pending_pairs: dict[str, web.WebSocketResponse] = {}
# Maps websocket -> (room_id, role)
ws_rooms: dict[web.WebSocketResponse, tuple[str, str]] = {}

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


async def handle_ws(request):
    ws = web.WebSocketResponse(max_msg_size=1024 * 1024)
    await ws.prepare(request)
    db: Database = request.app["db"]

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    await ws.send_json({"type": "error", "message": "Invalid JSON"})
                    continue

                msg_type = data.get("type")

                if msg_type == "request_code":
                    room = await db.create_room()
                    pending_pairs[room["pairing_code"]] = ws
                    connections[room["id"]] = {"desktop": ws}
                    ws_rooms[ws] = (room["id"], "desktop")
                    await ws.send_json({
                        "type": "code",
                        "code": room["pairing_code"],
                        "expires_in": 300,
                    })

                elif msg_type == "pair":
                    code = data.get("code", "").strip().upper()
                    room = await db.find_room_by_code(code)
                    if not room:
                        await ws.send_json({"type": "error", "message": "Invalid or expired code"})
                        continue

                    token_b = await db.complete_pairing(room["id"])
                    room_id = room["id"]

                    # Register phone connection
                    if room_id in connections:
                        connections[room_id]["phone"] = ws
                    else:
                        connections[room_id] = {"phone": ws}
                    ws_rooms[ws] = (room_id, "phone")

                    # Clean up pending pair
                    pending_pairs.pop(code, None)

                    # Notify phone
                    await ws.send_json({
                        "type": "paired",
                        "token": token_b,
                        "room_id": room_id,
                    })

                    # Notify desktop
                    desktop_ws = connections[room_id].get("desktop")
                    if desktop_ws and not desktop_ws.closed:
                        await desktop_ws.send_json({
                            "type": "paired",
                            "token": room["token_a"],
                            "room_id": room_id,
                        })

                elif msg_type == "reconnect":
                    token = data.get("token", "")
                    last_seen_id = data.get("last_seen_id", 0)
                    room = await db.find_room_by_token(token)
                    if not room:
                        await ws.send_json({"type": "error", "message": "Invalid token"})
                        continue

                    room_id = room["id"]
                    role = "desktop" if token == room["token_a"] else "phone"

                    if room_id not in connections:
                        connections[room_id] = {}
                    connections[room_id][role] = ws
                    ws_rooms[ws] = (room_id, role)

                    await ws.send_json({"type": "reconnected", "room_id": room_id})

                    # Send missed items
                    items = await db.get_items(room_id, since_id=last_seen_id)
                    await ws.send_json({
                        "type": "items",
                        "items": items,
                    })

                elif msg_type == "item":
                    token = data.get("token", "")
                    room = await db.find_room_by_token(token)
                    if not room:
                        await ws.send_json({"type": "error", "message": "Invalid token"})
                        continue

                    room_id = room["id"]
                    sender = "desktop" if token == room["token_a"] else "phone"
                    item_type = data.get("item_type", "text")
                    content = data.get("content", "")

                    item_id = await db.add_item(room_id, item_type, content, sender)
                    item = (await db.get_items(room_id, since_id=item_id - 1))[0]

                    # Send to the other side
                    other_role = "phone" if sender == "desktop" else "desktop"
                    other_ws = connections.get(room_id, {}).get(other_role)
                    if other_ws and not other_ws.closed:
                        await other_ws.send_json({"type": "item", **item})

                elif msg_type == "delete":
                    token = data.get("token", "")
                    room = await db.find_room_by_token(token)
                    if not room:
                        continue
                    room_id = room["id"]
                    item_id = data.get("item_id")
                    await db.delete_item(room_id, item_id)

                    # Notify other side
                    sender_role = "desktop" if token == room["token_a"] else "phone"
                    other_role = "phone" if sender_role == "desktop" else "desktop"
                    other_ws = connections.get(room_id, {}).get(other_role)
                    if other_ws and not other_ws.closed:
                        await other_ws.send_json({"type": "deleted", "item_id": item_id})

                elif msg_type == "clear":
                    token = data.get("token", "")
                    room = await db.find_room_by_token(token)
                    if not room:
                        continue
                    room_id = room["id"]
                    await db.clear_items(room_id)

                    # Notify other side
                    sender_role = "desktop" if token == room["token_a"] else "phone"
                    other_role = "phone" if sender_role == "desktop" else "desktop"
                    other_ws = connections.get(room_id, {}).get(other_role)
                    if other_ws and not other_ws.closed:
                        await other_ws.send_json({"type": "cleared"})

            elif msg.type in (web.WSMsgType.ERROR, web.WSMsgType.CLOSE):
                break
    finally:
        # Clean up connection tracking
        if ws in ws_rooms:
            room_id, role = ws_rooms.pop(ws)
            room_conns = connections.get(room_id, {})
            if room_conns.get(role) is ws:
                del room_conns[role]
            if not room_conns:
                connections.pop(room_id, None)

    return ws


async def handle_upload(request):
    db: Database = request.app["db"]
    uploads_dir: str = request.app["uploads_dir"]

    reader = await request.multipart()
    token = None
    file_data = None
    filename = None
    content_type = None
    total_size = 0

    async for field in reader:
        if field.name == "token":
            token = (await field.read(decode=True)).decode()
        elif field.name == "file":
            filename = field.filename
            content_type = field.headers.get("Content-Type", "application/octet-stream")
            chunks = []
            while True:
                chunk = await field.read_chunk(8192)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_UPLOAD_SIZE:
                    return web.json_response(
                        {"error": "File too large (max 50MB)"}, status=413
                    )
                chunks.append(chunk)
            file_data = b"".join(chunks)

    if not token:
        return web.json_response({"error": "Missing token"}, status=401)

    room = await db.find_room_by_token(token)
    if not room:
        return web.json_response({"error": "Invalid token"}, status=401)

    if not file_data or not filename:
        return web.json_response({"error": "No file provided"}, status=400)

    room_id = room["id"]
    sender = "desktop" if token == room["token_a"] else "phone"

    # Save file to disk
    ext = Path(filename).suffix.lower()
    file_uuid = str(uuid.uuid4())
    safe_filename = file_uuid + ext
    room_dir = os.path.join(uploads_dir, room_id)
    os.makedirs(room_dir, exist_ok=True)
    file_path = os.path.join(room_dir, safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_data)

    # Determine item type
    item_type = "image" if content_type.startswith("image/") else "file"
    metadata = json.dumps({
        "size": len(file_data),
        "mime": content_type,
        "filename": filename,
        "stored_as": safe_filename,
    })

    item_id = await db.add_item(room_id, item_type, safe_filename, sender, metadata=metadata)
    item = (await db.get_items(room_id, since_id=item_id - 1))[0]

    # Notify paired device via WebSocket
    other_role = "phone" if sender == "desktop" else "desktop"
    other_ws = connections.get(room_id, {}).get(other_role)
    if other_ws and not other_ws.closed:
        await other_ws.send_json({"type": "item", **item})

    return web.json_response({"ok": True, "item_id": item_id})


async def handle_file_download(request):
    db: Database = request.app["db"]
    uploads_dir: str = request.app["uploads_dir"]

    room_id = request.match_info["room_id"]
    item_id = int(request.match_info["item_id"])
    token = request.query.get("token", "")

    room = await db.find_room_by_token(token)
    if not room or room["id"] != room_id:
        return web.json_response({"error": "Unauthorized"}, status=401)

    items = await db.get_items(room_id, since_id=item_id - 1)
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        return web.json_response({"error": "Not found"}, status=404)

    meta = json.loads(item["metadata"]) if item["metadata"] else {}
    stored_as = meta.get("stored_as", item["content"])
    original_name = meta.get("filename", stored_as)
    mime = meta.get("mime", "application/octet-stream")

    file_path = os.path.join(uploads_dir, room_id, stored_as)
    if not os.path.exists(file_path):
        return web.json_response({"error": "File not found"}, status=404)

    return web.FileResponse(
        file_path,
        headers={
            "Content-Type": mime,
            "Content-Disposition": f'inline; filename="{original_name}"',
        },
    )


async def handle_share_target(request):
    """Handle PWA share target POST — serves the PWA which picks up shared data."""
    # The share target POST lands here; we serve the PWA index.html
    # The PWA's JS reads the form data from the URL/body and processes it
    static_dir = request.app.get("static_dir")
    if static_dir:
        pwa_index = os.path.join(static_dir, "pwa", "index.html")
        if os.path.exists(pwa_index):
            return web.FileResponse(pwa_index)
    return web.Response(text="Share target not configured", status=500)


async def create_app(db_path="drop.db", uploads_dir="uploads", static_dir="static"):
    app = web.Application(client_max_size=MAX_UPLOAD_SIZE + 1024 * 1024)

    db = Database(db_path)
    await db.init()
    app["db"] = db
    app["uploads_dir"] = uploads_dir
    app["static_dir"] = static_dir

    os.makedirs(uploads_dir, exist_ok=True)

    # WebSocket
    app.router.add_get("/drop/ws", handle_ws)

    # API
    app.router.add_post("/drop/api/upload", handle_upload)
    app.router.add_get("/drop/api/file/{room_id}/{item_id}", handle_file_download)
    app.router.add_post("/drop/share-target", handle_share_target)

    # Static files
    if static_dir and os.path.isdir(static_dir):
        if os.path.isdir(os.path.join(static_dir, "pwa")):
            app.router.add_static("/drop/pwa/", os.path.join(static_dir, "pwa"))
        if os.path.isdir(os.path.join(static_dir, "desktop")):
            app.router.add_static("/drop/", os.path.join(static_dir, "desktop"))

    return app


async def cleanup_task(app):
    """Periodic cleanup of stale rooms."""
    db: Database = app["db"]
    while True:
        await asyncio.sleep(3600)  # Every hour
        try:
            stale = await db.cleanup_stale_rooms()
            if stale:
                uploads_dir = app["uploads_dir"]
                for room_id in stale:
                    room_dir = os.path.join(uploads_dir, room_id)
                    if os.path.isdir(room_dir):
                        import shutil
                        shutil.rmtree(room_dir)
                log.info(f"Cleaned up {len(stale)} stale rooms")
        except Exception as e:
            log.error(f"Cleanup error: {e}")


async def on_startup(app):
    app["cleanup_task"] = asyncio.create_task(cleanup_task(app))


async def on_shutdown(app):
    app["cleanup_task"].cancel()
    await app["db"].close()


def main():
    parser = argparse.ArgumentParser(description="Drop sharing server")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--db", default="drop.db")
    parser.add_argument("--uploads", default="uploads")
    args = parser.parse_args()

    async def init():
        app = await create_app(
            db_path=args.db,
            uploads_dir=args.uploads,
            static_dir="static",
        )
        app.on_startup.append(on_startup)
        app.on_shutdown.append(on_shutdown)
        return app

    web.run_app(asyncio.run(init()), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd projects/drop && venv/bin/python -m pytest tests/test_server.py -v
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/drop/server.py projects/drop/tests/test_server.py
git commit -m "feat(drop): add WebSocket server with pairing, messaging, and file upload"
```

---

### Task 3: Desktop SPA — Pairing Screen and Feed

**Files:**
- Create: `projects/drop/static/desktop/index.html`
- Create: `projects/drop/static/desktop/style.css`
- Create: `projects/drop/static/desktop/app.js`

- [ ] **Step 1: Create desktop HTML**

`projects/drop/static/desktop/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Drop</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="app">
        <header>
            <h1>Drop</h1>
            <div id="status" class="status disconnected">Disconnected</div>
        </header>

        <!-- Pairing Screen -->
        <div id="pairing-screen" class="screen">
            <div class="pairing-container">
                <h2>Pair Your Phone</h2>
                <p class="subtitle">Enter this code on your phone, or scan the QR code</p>
                <div id="pairing-code" class="code">------</div>
                <div id="qr-code" class="qr-container"></div>
                <p class="hint">Code expires in <span id="code-timer">5:00</span></p>
            </div>
        </div>

        <!-- Feed Screen -->
        <div id="feed-screen" class="screen hidden">
            <div class="feed-header">
                <span>Shared Items</span>
                <button id="clear-btn" class="btn-clear" title="Clear all items">Clear All</button>
            </div>
            <div id="feed" class="feed">
                <div id="empty-state" class="empty-state">
                    <p>No items yet</p>
                    <p class="subtitle">Share something from your phone</p>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
    <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create desktop CSS**

`projects/drop/static/desktop/style.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh;
}

header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid #333;
}

header h1 {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
}

.status {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 12px;
}

.status.connected { background: #1b3a2d; color: #4ecca3; }
.status.disconnected { background: #3a1b1b; color: #ff6b6b; }
.status.connecting { background: #3a351b; color: #ffd93d; }

.screen { padding: 20px; }
.hidden { display: none !important; }

/* Pairing Screen */
.pairing-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
}

.pairing-container h2 {
    font-size: 24px;
    margin-bottom: 8px;
}

.subtitle {
    color: #888;
    font-size: 14px;
    margin-bottom: 24px;
}

.code {
    font-size: 48px;
    font-weight: bold;
    letter-spacing: 12px;
    color: #6c63ff;
    padding: 16px 24px;
    background: #252540;
    border-radius: 12px;
    margin-bottom: 24px;
    font-family: 'SF Mono', 'Fira Code', monospace;
}

.qr-container {
    background: #fff;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 16px;
}

.qr-container canvas, .qr-container img {
    display: block;
}

.hint {
    color: #666;
    font-size: 13px;
}

/* Feed Screen */
.feed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    font-size: 14px;
    color: #888;
}

.btn-clear {
    background: none;
    border: 1px solid #444;
    color: #888;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
}

.btn-clear:hover { border-color: #ff6b6b; color: #ff6b6b; }

.feed {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #666;
}

.empty-state .subtitle { margin-top: 8px; }

/* Feed Items */
.feed-item {
    background: #252540;
    border-radius: 8px;
    padding: 14px;
    border-left: 3px solid #6c63ff;
    position: relative;
    animation: slideIn 0.2s ease;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.feed-item.type-link { border-left-color: #6c63ff; }
.feed-item.type-image { border-left-color: #4ecca3; }
.feed-item.type-text { border-left-color: #ff6b6b; }
.feed-item.type-file { border-left-color: #ffd93d; }

.item-meta {
    font-size: 11px;
    color: #666;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
}

.item-content { font-size: 14px; }
.item-content a { color: #8b9cf7; text-decoration: none; }
.item-content a:hover { text-decoration: underline; }

.item-content img {
    max-width: 100%;
    max-height: 300px;
    border-radius: 6px;
    margin-top: 4px;
    cursor: pointer;
}

.item-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
}

.btn-action {
    background: #333;
    border: none;
    color: #ccc;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
}

.btn-action:hover { background: #444; }

.btn-download {
    background: #4ecca3;
    color: #1a1a2e;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    text-decoration: none;
    display: inline-block;
}

.item-delete {
    position: absolute;
    top: 8px;
    right: 10px;
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 16px;
    padding: 2px 6px;
    border-radius: 4px;
}

.item-delete:hover { color: #ff6b6b; background: #3a1b1b; }

.copied-toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4ecca3;
    color: #1a1a2e;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
}

.copied-toast.show { opacity: 1; }
```

- [ ] **Step 3: Create desktop JavaScript**

`projects/drop/static/desktop/app.js`:
```javascript
(function () {
    const BASE = '/drop';
    const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${BASE}/ws`;

    const TOKEN_KEY = 'drop_token';
    const ROOM_KEY = 'drop_room';
    const LAST_SEEN_KEY = 'drop_last_seen';

    let ws = null;
    let token = localStorage.getItem(TOKEN_KEY);
    let roomId = localStorage.getItem(ROOM_KEY);
    let lastSeenId = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10);
    let reconnectTimeout = null;
    let codeTimerInterval = null;

    const $ = (sel) => document.querySelector(sel);
    const show = (el) => el.classList.remove('hidden');
    const hide = (el) => el.classList.add('hidden');

    function setStatus(state, text) {
        const el = $('#status');
        el.className = 'status ' + state;
        el.textContent = text || state.charAt(0).toUpperCase() + state.slice(1);
    }

    function connect() {
        if (ws && ws.readyState <= 1) return;
        setStatus('connecting', 'Connecting...');

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            if (token && roomId) {
                ws.send(JSON.stringify({
                    type: 'reconnect',
                    token: token,
                    last_seen_id: lastSeenId,
                }));
            } else {
                ws.send(JSON.stringify({ type: 'request_code' }));
            }
        };

        ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            handleMessage(data);
        };

        ws.onclose = () => {
            setStatus('disconnected');
            scheduleReconnect();
        };

        ws.onerror = () => {
            ws.close();
        };
    }

    function scheduleReconnect() {
        if (reconnectTimeout) return;
        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
        }, 3000);
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'code':
                showPairingScreen(data.code, data.expires_in);
                setStatus('connecting', 'Waiting for pair...');
                break;

            case 'paired':
                token = data.token;
                roomId = data.room_id;
                localStorage.setItem(TOKEN_KEY, token);
                localStorage.setItem(ROOM_KEY, roomId);
                setStatus('connected');
                showFeedScreen();
                break;

            case 'reconnected':
                roomId = data.room_id;
                setStatus('connected');
                showFeedScreen();
                break;

            case 'items':
                data.items.forEach(item => addItemToFeed(item));
                break;

            case 'item':
                addItemToFeed(data);
                break;

            case 'deleted':
                removeItemFromFeed(data.item_id);
                break;

            case 'cleared':
                clearFeed();
                break;

            case 'error':
                console.error('Server error:', data.message);
                if (data.message === 'Invalid token') {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(ROOM_KEY);
                    token = null;
                    roomId = null;
                    ws.send(JSON.stringify({ type: 'request_code' }));
                }
                break;
        }
    }

    function showPairingScreen(code, expiresIn) {
        show($('#pairing-screen'));
        hide($('#feed-screen'));
        $('#pairing-code').textContent = code;

        // QR code
        const qrContainer = $('#qr-code');
        qrContainer.innerHTML = '';
        const pairUrl = `${location.origin}${BASE}/pwa/?pair=${code}`;
        const qr = qrcode(0, 'M');
        qr.addData(pairUrl);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(5, 0);

        // Timer
        let remaining = expiresIn;
        if (codeTimerInterval) clearInterval(codeTimerInterval);
        codeTimerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(codeTimerInterval);
                // Request new code
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'request_code' }));
                }
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            $('#code-timer').textContent = `${m}:${s.toString().padStart(2, '0')}`;
        }, 1000);
    }

    function showFeedScreen() {
        hide($('#pairing-screen'));
        show($('#feed-screen'));
        if (codeTimerInterval) clearInterval(codeTimerInterval);
    }

    function addItemToFeed(item) {
        hide($('#empty-state'));
        const feed = $('#feed');

        const div = document.createElement('div');
        div.className = `feed-item type-${item.type || item.item_type}`;
        div.dataset.id = item.id;

        const itemType = item.type || item.item_type;
        const meta = item.metadata ? (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata) : {};
        const timeStr = formatTime(item.created_at);

        let contentHtml = '';
        switch (itemType) {
            case 'link':
                contentHtml = `<a href="${escapeHtml(item.content)}" target="_blank" rel="noopener">${escapeHtml(item.content)}</a>`;
                break;
            case 'text':
                contentHtml = `<span class="text-content" style="cursor:pointer" title="Click to copy">${escapeHtml(item.content)}</span>`;
                break;
            case 'image':
                const imgUrl = `${BASE}/api/file/${roomId}/${item.id}?token=${encodeURIComponent(token)}`;
                contentHtml = `<img src="${imgUrl}" alt="${escapeHtml(meta.filename || 'image')}" loading="lazy">`;
                break;
            case 'file':
                const fileUrl = `${BASE}/api/file/${roomId}/${item.id}?token=${encodeURIComponent(token)}`;
                const size = meta.size ? formatSize(meta.size) : '';
                contentHtml = `${escapeHtml(meta.filename || item.content)} <span style="color:#666;font-size:11px">${size}</span> <a href="${fileUrl}" download="${escapeHtml(meta.filename || 'file')}" class="btn-download">Download</a>`;
                break;
        }

        div.innerHTML = `
            <div class="item-meta">
                <span>${capitalize(itemType)} · ${timeStr}</span>
            </div>
            <div class="item-content">${contentHtml}</div>
            <button class="item-delete" title="Delete">&times;</button>
        `;

        // Click-to-copy for text items
        if (itemType === 'text') {
            div.querySelector('.text-content').addEventListener('click', () => {
                navigator.clipboard.writeText(item.content);
                showToast('Copied to clipboard');
            });
        }

        // Delete button
        div.querySelector('.item-delete').addEventListener('click', () => {
            ws.send(JSON.stringify({
                type: 'delete',
                token: token,
                item_id: item.id,
            }));
            removeItemFromFeed(item.id);
        });

        // Insert at top (after empty-state)
        const firstItem = feed.querySelector('.feed-item');
        if (firstItem) {
            feed.insertBefore(div, firstItem);
        } else {
            feed.appendChild(div);
        }

        // Track last seen
        if (item.id > lastSeenId) {
            lastSeenId = item.id;
            localStorage.setItem(LAST_SEEN_KEY, lastSeenId.toString());
        }
    }

    function removeItemFromFeed(itemId) {
        const el = document.querySelector(`.feed-item[data-id="${itemId}"]`);
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 200);
        }
        // Show empty state if no items
        setTimeout(() => {
            if (!document.querySelector('.feed-item')) {
                show($('#empty-state'));
            }
        }, 250);
    }

    function clearFeed() {
        document.querySelectorAll('.feed-item').forEach(el => el.remove());
        show($('#empty-state'));
    }

    // Clear button
    $('#clear-btn').addEventListener('click', () => {
        if (confirm('Clear all shared items?')) {
            ws.send(JSON.stringify({ type: 'clear', token: token }));
            clearFeed();
        }
    });

    // Utilities
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function formatTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return d.toLocaleDateString();
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function showToast(msg) {
        let toast = document.querySelector('.copied-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'copied-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1500);
    }

    // Start
    connect();
})();
```

- [ ] **Step 4: Manual test — start the server and verify in browser**

```bash
cd projects/drop && source venv/bin/activate && python server.py --port 8090
```

Open `http://localhost:8090/drop/` — should see pairing screen with code and QR code.

- [ ] **Step 5: Commit**

```bash
git add projects/drop/static/desktop/
git commit -m "feat(drop): add desktop SPA with pairing screen and feed UI"
```

---

### Task 4: Phone PWA — Compose UI and Share Target

**Files:**
- Create: `projects/drop/static/pwa/index.html`
- Create: `projects/drop/static/pwa/style.css`
- Create: `projects/drop/static/pwa/app.js`
- Create: `projects/drop/static/pwa/manifest.json`
- Create: `projects/drop/static/pwa/sw.js`

- [ ] **Step 1: Create PWA HTML**

`projects/drop/static/pwa/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Drop</title>
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#1a1a2e">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="app">
        <header>
            <h1>Drop</h1>
            <div id="status" class="status disconnected">Disconnected</div>
        </header>

        <!-- Pairing Screen -->
        <div id="pairing-screen" class="screen">
            <div class="pairing-container">
                <h2>Pair with Desktop</h2>
                <p class="subtitle">Enter the code shown on your desktop, or scan its QR code</p>
                <input type="text" id="pair-input" class="pair-input" maxlength="6"
                       placeholder="Enter code" autocomplete="off" autocapitalize="characters">
                <button id="pair-btn" class="btn-primary">Connect</button>
            </div>
        </div>

        <!-- Compose Screen -->
        <div id="compose-screen" class="screen hidden">
            <div class="compose-area">
                <textarea id="compose-input" class="compose-input" placeholder="Paste or type something..." rows="3"></textarea>
                <div class="compose-actions">
                    <button id="send-btn" class="btn-primary">Send</button>
                    <label class="btn-secondary" id="image-btn">
                        <input type="file" id="image-input" accept="image/*" capture="environment" hidden>
                        📷
                    </label>
                    <label class="btn-secondary" id="file-btn">
                        <input type="file" id="file-input" hidden>
                        📎
                    </label>
                </div>
            </div>

            <div class="history-header">Recent</div>
            <div id="history" class="history">
                <div id="empty-state" class="empty-state">
                    <p>Nothing shared yet</p>
                </div>
            </div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create PWA CSS**

`projects/drop/static/pwa/style.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh;
    -webkit-tap-highlight-color: transparent;
}

header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #333;
    position: sticky;
    top: 0;
    background: #1a1a2e;
    z-index: 10;
}

header h1 { font-size: 18px; font-weight: 600; color: #fff; }

.status {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 10px;
}

.status.connected { background: #1b3a2d; color: #4ecca3; }
.status.disconnected { background: #3a1b1b; color: #ff6b6b; }
.status.connecting { background: #3a351b; color: #ffd93d; }

.screen { padding: 16px; }
.hidden { display: none !important; }

/* Pairing */
.pairing-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
}

.pairing-container h2 { font-size: 22px; margin-bottom: 8px; }

.subtitle { color: #888; font-size: 13px; margin-bottom: 20px; }

.pair-input {
    font-size: 32px;
    text-align: center;
    letter-spacing: 8px;
    background: #252540;
    border: 2px solid #333;
    border-radius: 12px;
    color: #fff;
    padding: 12px 16px;
    width: 220px;
    margin-bottom: 16px;
    font-family: 'SF Mono', 'Fira Code', monospace;
}

.pair-input:focus { border-color: #6c63ff; outline: none; }

.btn-primary {
    background: #6c63ff;
    color: #fff;
    border: none;
    padding: 12px 32px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    width: 220px;
    font-weight: 600;
}

.btn-primary:active { background: #5a52e0; }
.btn-primary:disabled { opacity: 0.5; }

/* Compose */
.compose-area {
    background: #252540;
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 16px;
}

.compose-input {
    width: 100%;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 8px;
    color: #e0e0e0;
    padding: 10px;
    font-size: 14px;
    resize: none;
    font-family: inherit;
    margin-bottom: 10px;
}

.compose-input:focus { border-color: #6c63ff; outline: none; }

.compose-actions {
    display: flex;
    gap: 8px;
}

.compose-actions .btn-primary {
    flex: 1;
    padding: 10px;
    width: auto;
}

.btn-secondary {
    background: #333;
    color: #ccc;
    border: none;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn-secondary:active { background: #444; }

/* History */
.history-header {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
    padding: 0 4px;
}

.history {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.empty-state {
    text-align: center;
    padding: 40px 16px;
    color: #555;
    font-size: 14px;
}

.history-item {
    background: #252540;
    border-radius: 8px;
    padding: 10px 12px;
    border-left: 3px solid #6c63ff;
    animation: slideIn 0.2s ease;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
}

.history-item.type-link { border-left-color: #6c63ff; }
.history-item.type-image { border-left-color: #4ecca3; }
.history-item.type-text { border-left-color: #ff6b6b; }
.history-item.type-file { border-left-color: #ffd93d; }

.history-item .meta {
    font-size: 10px;
    color: #555;
    margin-top: 4px;
}

.history-item .content {
    font-size: 13px;
    color: #ccc;
    word-break: break-all;
}

.history-item .content a { color: #8b9cf7; text-decoration: none; }

/* Upload progress */
.upload-progress {
    background: #252540;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
    text-align: center;
    color: #888;
    font-size: 13px;
}

/* Toast */
.toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4ecca3;
    color: #1a1a2e;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 13px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 100;
}

.toast.show { opacity: 1; }
```

- [ ] **Step 3: Create PWA JavaScript**

`projects/drop/static/pwa/app.js`:
```javascript
(function () {
    const BASE = '/drop';
    const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${BASE}/ws`;

    const TOKEN_KEY = 'drop_token';
    const ROOM_KEY = 'drop_room';

    let ws = null;
    let token = localStorage.getItem(TOKEN_KEY);
    let roomId = localStorage.getItem(ROOM_KEY);
    let reconnectTimeout = null;
    let pendingShareData = null;

    const $ = (sel) => document.querySelector(sel);
    const show = (el) => el.classList.remove('hidden');
    const hide = (el) => el.classList.add('hidden');

    function setStatus(state, text) {
        const el = $('#status');
        el.className = 'status ' + state;
        el.textContent = text || state.charAt(0).toUpperCase() + state.slice(1);
    }

    // Check for share target data in URL
    function checkShareTarget() {
        const params = new URLSearchParams(location.search);
        const sharedTitle = params.get('title') || '';
        const sharedText = params.get('text') || '';
        const sharedUrl = params.get('url') || '';

        const content = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join('\n');
        if (content) {
            pendingShareData = { type: 'text', content: content };
            // Clean URL
            history.replaceState(null, '', location.pathname);
        }

        // Check for pair code in URL
        const pairCode = params.get('pair');
        if (pairCode && !token) {
            $('#pair-input').value = pairCode;
        }
    }

    function connect() {
        if (ws && ws.readyState <= 1) return;
        setStatus('connecting', 'Connecting...');

        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            if (token && roomId) {
                ws.send(JSON.stringify({ type: 'reconnect', token: token, last_seen_id: 0 }));
            } else {
                setStatus('disconnected', 'Not paired');
            }
        };

        ws.onmessage = (e) => handleMessage(JSON.parse(e.data));

        ws.onclose = () => {
            setStatus('disconnected');
            scheduleReconnect();
        };

        ws.onerror = () => ws.close();
    }

    function scheduleReconnect() {
        if (reconnectTimeout) return;
        reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
        }, 3000);
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'paired':
                token = data.token;
                roomId = data.room_id;
                localStorage.setItem(TOKEN_KEY, token);
                localStorage.setItem(ROOM_KEY, roomId);
                setStatus('connected');
                showComposeScreen();
                processPendingShare();
                break;

            case 'reconnected':
                roomId = data.room_id;
                setStatus('connected');
                showComposeScreen();
                processPendingShare();
                break;

            case 'items':
                data.items.forEach(item => addToHistory(item));
                break;

            case 'item':
                // Item confirmed / received from other side
                break;

            case 'error':
                console.error('Server error:', data.message);
                if (data.message === 'Invalid token') {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(ROOM_KEY);
                    token = null;
                    roomId = null;
                    showPairingScreen();
                }
                break;
        }
    }

    function showPairingScreen() {
        show($('#pairing-screen'));
        hide($('#compose-screen'));
    }

    function showComposeScreen() {
        hide($('#pairing-screen'));
        show($('#compose-screen'));
    }

    function processPendingShare() {
        if (pendingShareData && token) {
            const input = $('#compose-input');
            input.value = pendingShareData.content;
            pendingShareData = null;
        }
    }

    // Pairing
    $('#pair-btn').addEventListener('click', () => {
        const code = $('#pair-input').value.trim().toUpperCase();
        if (code.length !== 6) return;
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'pair', code: code }));
        }
    });

    $('#pair-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('#pair-btn').click();
    });

    // Sending text/links
    $('#send-btn').addEventListener('click', async () => {
        const input = $('#compose-input');
        const content = input.value.trim();
        if (!content || !ws || ws.readyState !== 1) return;

        const itemType = isUrl(content) ? 'link' : 'text';
        ws.send(JSON.stringify({
            type: 'item',
            token: token,
            item_type: itemType,
            content: content,
        }));

        addToHistory({ type: itemType, content: content, sender: 'phone', created_at: new Date().toISOString() });
        input.value = '';
        showToast('Sent!');
    });

    // Image upload
    $('#image-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
        e.target.value = '';
    });

    // File upload
    $('#file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
        e.target.value = '';
    });

    async function uploadFile(file) {
        if (!token) return;
        if (file.size > 50 * 1024 * 1024) {
            showToast('File too large (max 50MB)');
            return;
        }

        const formData = new FormData();
        formData.append('token', token);
        formData.append('file', file);

        showToast('Uploading...');

        try {
            const resp = await fetch(`${BASE}/api/upload`, {
                method: 'POST',
                body: formData,
            });

            if (resp.ok) {
                const itemType = file.type.startsWith('image/') ? 'image' : 'file';
                addToHistory({
                    type: itemType,
                    content: file.name,
                    sender: 'phone',
                    created_at: new Date().toISOString(),
                    metadata: JSON.stringify({ filename: file.name, size: file.size }),
                });
                showToast('Sent!');
            } else {
                const err = await resp.json();
                showToast(err.error || 'Upload failed');
            }
        } catch (e) {
            showToast('Upload failed');
        }
    }

    function addToHistory(item) {
        hide($('#empty-state'));
        const history = $('#history');

        const div = document.createElement('div');
        const itemType = item.type || item.item_type;
        div.className = `history-item type-${itemType}`;

        const meta = item.metadata ? (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata) : {};
        let contentText = item.content;
        if (itemType === 'image' || itemType === 'file') {
            contentText = meta.filename || item.content;
        }

        const contentHtml = itemType === 'link'
            ? `<a href="${escapeHtml(item.content)}" target="_blank">${escapeHtml(item.content)}</a>`
            : escapeHtml(contentText);

        div.innerHTML = `
            <div class="content">${contentHtml}</div>
            <div class="meta">${capitalize(itemType)} · just now</div>
        `;

        const firstItem = history.querySelector('.history-item');
        if (firstItem) {
            history.insertBefore(div, firstItem);
        } else {
            history.appendChild(div);
        }
    }

    function isUrl(str) {
        try {
            const url = new URL(str);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function showToast(msg) {
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1500);
    }

    // Init
    checkShareTarget();
    if (token && roomId) {
        showComposeScreen();
    } else {
        showPairingScreen();
    }
    connect();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('SW registration failed:', err);
        });
    }
})();
```

- [ ] **Step 4: Create PWA manifest**

`projects/drop/static/pwa/manifest.json`:
```json
{
    "name": "Drop",
    "short_name": "Drop",
    "description": "Instant phone-to-desktop sharing",
    "start_url": "/drop/pwa/",
    "scope": "/drop/pwa/",
    "display": "standalone",
    "background_color": "#1a1a2e",
    "theme_color": "#1a1a2e",
    "icons": [
        {
            "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%236c63ff'/><text x='50' y='68' font-size='50' text-anchor='middle' fill='white' font-family='system-ui'>↗</text></svg>",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any"
        }
    ],
    "share_target": {
        "action": "/drop/pwa/",
        "method": "GET",
        "params": {
            "title": "title",
            "text": "text",
            "url": "url"
        }
    }
}
```

- [ ] **Step 5: Create service worker**

`projects/drop/static/pwa/sw.js`:
```javascript
const CACHE_NAME = 'drop-v1';
const SHELL_FILES = [
    '/drop/pwa/',
    '/drop/pwa/style.css',
    '/drop/pwa/app.js',
    '/drop/pwa/manifest.json',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Don't cache API calls or WebSocket
    if (url.pathname.startsWith('/drop/api/') || url.pathname.startsWith('/drop/ws')) {
        return;
    }

    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
```

- [ ] **Step 6: Manual test — open PWA in mobile browser or DevTools mobile view**

```bash
cd projects/drop && source venv/bin/activate && python server.py --port 8090
```

1. Open `http://localhost:8090/drop/` in one browser tab (desktop)
2. Open `http://localhost:8090/drop/pwa/` in another tab (simulating phone)
3. Enter the pairing code from desktop into phone
4. Send text from phone — should appear on desktop
5. Upload an image from phone — should display inline on desktop

- [ ] **Step 7: Commit**

```bash
git add projects/drop/static/pwa/
git commit -m "feat(drop): add phone PWA with compose UI, share target, and service worker"
```

---

### Task 5: File Share Target for Images

The GET-based share target in Task 4 handles text and URLs. For sharing images/files from other apps, the PWA needs a POST-based share target with `enctype: multipart/form-data`.

**Files:**
- Modify: `projects/drop/static/pwa/manifest.json`
- Modify: `projects/drop/static/pwa/sw.js`
- Modify: `projects/drop/static/pwa/app.js`

- [ ] **Step 1: Update manifest to add file share target**

Replace the `share_target` in `projects/drop/static/pwa/manifest.json`:
```json
{
    "name": "Drop",
    "short_name": "Drop",
    "description": "Instant phone-to-desktop sharing",
    "start_url": "/drop/pwa/",
    "scope": "/drop/pwa/",
    "display": "standalone",
    "background_color": "#1a1a2e",
    "theme_color": "#1a1a2e",
    "icons": [
        {
            "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%236c63ff'/><text x='50' y='68' font-size='50' text-anchor='middle' fill='white' font-family='system-ui'>↗</text></svg>",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any"
        }
    ],
    "share_target": {
        "action": "/drop/share-target",
        "method": "POST",
        "enctype": "multipart/form-data",
        "params": {
            "title": "title",
            "text": "text",
            "url": "url",
            "files": [
                {
                    "name": "files",
                    "accept": ["image/*", "video/*", "application/*", "text/*", "*/*"]
                }
            ]
        }
    }
}
```

- [ ] **Step 2: Update service worker to intercept share target POST**

Add this to the fetch handler in `projects/drop/static/pwa/sw.js`, before the existing fetch handler logic:

Replace the entire `sw.js`:
```javascript
const CACHE_NAME = 'drop-v1';
const SHELL_FILES = [
    '/drop/pwa/',
    '/drop/pwa/style.css',
    '/drop/pwa/app.js',
    '/drop/pwa/manifest.json',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Intercept share target POST
    if (url.pathname === '/drop/share-target' && e.request.method === 'POST') {
        e.respondWith(handleShareTarget(e.request));
        return;
    }

    // Don't cache API calls or WebSocket
    if (url.pathname.startsWith('/drop/api/') || url.pathname.startsWith('/drop/ws')) {
        return;
    }

    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});

async function handleShareTarget(request) {
    const formData = await request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const files = formData.getAll('files');

    // Store shared data for the app to pick up
    const shareData = { title, text, url, files: [] };

    // If there are files, store them temporarily
    if (files.length > 0) {
        const cache = await caches.open('drop-share-temp');
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const tempUrl = `/drop/share-temp/${Date.now()}-${i}-${file.name}`;
            await cache.put(tempUrl, new Response(file, {
                headers: {
                    'Content-Type': file.type,
                    'X-Filename': file.name,
                }
            }));
            shareData.files.push(tempUrl);
        }
    }

    // Redirect to PWA with share data reference
    const textContent = [title, text, url].filter(Boolean).join('\n');
    const params = new URLSearchParams();
    if (textContent) params.set('shared_text', textContent);
    if (shareData.files.length > 0) params.set('shared_files', shareData.files.join(','));

    return Response.redirect(`/drop/pwa/?${params.toString()}`, 303);
}
```

- [ ] **Step 3: Update app.js to handle shared files from service worker cache**

Add to `checkShareTarget()` in `projects/drop/static/pwa/app.js` — replace the function:

```javascript
    function checkShareTarget() {
        const params = new URLSearchParams(location.search);

        // Handle text/URL shares
        const sharedText = params.get('shared_text') || '';
        const sharedTitle = params.get('title') || '';
        const sharedTextOld = params.get('text') || '';
        const sharedUrl = params.get('url') || '';
        const textContent = sharedText || [sharedTitle, sharedTextOld, sharedUrl].filter(Boolean).join('\n');

        if (textContent) {
            pendingShareData = { type: 'text', content: textContent };
        }

        // Handle file shares
        const sharedFiles = params.get('shared_files');
        if (sharedFiles) {
            const fileUrls = sharedFiles.split(',');
            pendingShareFiles = fileUrls;
        }

        // Check for pair code in URL
        const pairCode = params.get('pair');
        if (pairCode && !token) {
            $('#pair-input').value = pairCode;
        }

        // Clean URL
        if (location.search) {
            history.replaceState(null, '', location.pathname);
        }
    }
```

And add the file processing. Add `let pendingShareFiles = null;` at the top near `pendingShareData`, and update `processPendingShare()`:

```javascript
    async function processPendingShare() {
        if (pendingShareData && token) {
            const input = $('#compose-input');
            input.value = pendingShareData.content;
            pendingShareData = null;
            // Auto-send text shares
            $('#send-btn').click();
        }

        if (pendingShareFiles && token) {
            const cache = await caches.open('drop-share-temp');
            for (const fileUrl of pendingShareFiles) {
                const resp = await cache.match(fileUrl);
                if (resp) {
                    const blob = await resp.blob();
                    const filename = resp.headers.get('X-Filename') || 'shared-file';
                    const file = new File([blob], filename, { type: blob.type });
                    await uploadFile(file);
                    await cache.delete(fileUrl);
                }
            }
            pendingShareFiles = null;
        }
    }
```

- [ ] **Step 4: Manual test**

On an Android device with the PWA installed:
1. Share an image from the Gallery to "Drop"
2. Verify the image is auto-uploaded and appears on the desktop feed

- [ ] **Step 5: Commit**

```bash
git add projects/drop/static/pwa/
git commit -m "feat(drop): add file/image share target support via service worker"
```

---

### Task 6: Deployment Configuration

**Files:**
- Create: `projects/drop/drop.service`
- Modify: `hooks/post-merge`
- Modify: `.gitignore` (root)

- [ ] **Step 1: Create systemd service file**

`projects/drop/drop.service`:
```ini
[Unit]
Description=Drop sharing server
After=network.target

[Service]
Type=simple
User=epatel
WorkingDirectory=/home/epatel/vps_ai/projects/drop
ExecStart=/home/epatel/vps_ai/projects/drop/venv/bin/python server.py --port 8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Add to post-merge hook SERVICE_MAP**

Add this entry to the `SERVICE_MAP` associative array in `hooks/post-merge`:
```bash
["projects/drop"]="drop"
```

- [ ] **Step 3: Add nginx config documentation**

Create a comment in `projects/drop/drop.service` or a note. The nginx config to add on the server:

```nginx
# Add to /etc/nginx/sites-available/ai.memention.net

location /drop/ws {
    proxy_pass http://127.0.0.1:8090/drop/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}

location /drop/ {
    proxy_pass http://127.0.0.1:8090/drop/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 55M;
}
```

- [ ] **Step 4: Update root .gitignore**

Add to the project's root `.gitignore`:
```
projects/drop/uploads/
projects/drop/venv/
projects/drop/*.db
```

- [ ] **Step 5: Run setup-hooks to install updated post-merge hook**

```bash
bash setup-hooks.sh
```

- [ ] **Step 6: Commit**

```bash
git add projects/drop/drop.service hooks/post-merge .gitignore
git commit -m "feat(drop): add deployment config (systemd, nginx, post-merge hook)"
```

---

### Task 7: End-to-End Verification

- [ ] **Step 1: Run all tests**

```bash
cd projects/drop && source venv/bin/activate
python -m pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 2: Start server and test full flow locally**

```bash
cd projects/drop && python server.py --port 8090
```

Verify:
1. Open `http://localhost:8090/drop/` — see pairing code + QR
2. Open `http://localhost:8090/drop/pwa/` in another window — enter code
3. Both transition to their respective screens
4. Type text in phone PWA and send — appears on desktop
5. Paste a URL — appears as clickable link on desktop
6. Upload an image — appears inline on desktop
7. Delete an item from desktop — removed from feed
8. Close both tabs, reopen — both reconnect automatically without re-pairing
9. Send items while desktop is closed — they appear on reconnect

- [ ] **Step 3: Commit any fixes**

```bash
git add -u projects/drop/
git commit -m "fix(drop): fixes from end-to-end testing"
```
