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
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_items_room_id ON items(room_id);
        """)
        # Migration: add pinned column if missing
        try:
            await self._db.execute("SELECT pinned FROM items LIMIT 1")
        except Exception:
            await self._db.execute("ALTER TABLE items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
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

    async def refresh_pairing_code(self, room_id, code_ttl_seconds=300):
        """Generate a new pairing code for an existing room."""
        pairing_code = self._generate_code()
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=code_ttl_seconds)).isoformat()
        await self._db.execute(
            "UPDATE rooms SET pairing_code = ?, code_expires_at = ? WHERE id = ?",
            (pairing_code, expires_at, room_id),
        )
        await self._db.commit()
        return pairing_code

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

    async def get_item(self, room_id, item_id):
        cursor = await self._db.execute(
            "SELECT * FROM items WHERE id = ? AND room_id = ?",
            (item_id, room_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def delete_item(self, room_id, item_id):
        await self._db.execute(
            "DELETE FROM items WHERE id = ? AND room_id = ?",
            (item_id, room_id),
        )
        await self._db.commit()

    async def pin_item(self, room_id, item_id, pinned=True):
        await self._db.execute(
            "UPDATE items SET pinned = ? WHERE id = ? AND room_id = ?",
            (1 if pinned else 0, item_id, room_id),
        )
        await self._db.commit()

    async def clear_items(self, room_id):
        await self._db.execute("DELETE FROM items WHERE room_id = ?", (room_id,))
        await self._db.commit()

    async def cleanup_expired_items(self, max_age_seconds=300):
        """Remove non-pinned items older than max_age_seconds. Returns list of (room_id, item_id) removed."""
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)).isoformat()
        cursor = await self._db.execute(
            "SELECT id, room_id, content, metadata, type FROM items WHERE pinned = 0 AND created_at < ?",
            (cutoff,),
        )
        expired = [dict(row) for row in await cursor.fetchall()]
        if expired:
            ids = [item["id"] for item in expired]
            placeholders = ",".join("?" for _ in ids)
            await self._db.execute(f"DELETE FROM items WHERE id IN ({placeholders})", ids)
            await self._db.commit()
        return expired

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
