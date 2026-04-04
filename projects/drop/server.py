import argparse
import asyncio
import json
import logging
import os
import uuid
from pathlib import Path

from aiohttp import web

from db import Database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Maps room_id -> {"desktop": websocket, "phone": websocket}
connections: dict[str, dict[str, web.WebSocketResponse]] = {}
# Maps websocket -> (room_id, role)
ws_rooms: dict[web.WebSocketResponse, tuple[str, str]] = {}

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


async def notify_peer(room_id, target_role, message):
    """Send a message to the other device in a room. Safe to call from any handler."""
    peer = connections.get(room_id, {}).get(target_role)
    if peer is not None:
        try:
            await peer.send_str(json.dumps(message))
        except Exception:
            pass


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
                    await ws.send_str(json.dumps({"type": "error", "message": "Invalid JSON"}))
                    continue

                msg_type = data.get("type")

                if msg_type == "request_code":
                    room = await db.create_room()
                    connections[room["id"]] = {"desktop": ws}
                    ws_rooms[ws] = (room["id"], "desktop")
                    await ws.send_str(json.dumps({
                        "type": "code",
                        "code": room["pairing_code"],
                        "expires_in": 300,
                    }))

                elif msg_type == "pair":
                    code = data.get("code", "").strip().upper()
                    room = await db.find_room_by_code(code)
                    if not room:
                        await ws.send_str(json.dumps({"type": "error", "message": "Invalid or expired code"}))
                        continue

                    token_b = await db.complete_pairing(room["id"])
                    room_id = room["id"]

                    if room_id in connections:
                        connections[room_id]["phone"] = ws
                    else:
                        connections[room_id] = {"phone": ws}
                    ws_rooms[ws] = (room_id, "phone")

                    await ws.send_str(json.dumps({
                        "type": "paired",
                        "token": token_b,
                        "room_id": room_id,
                    }))

                    await notify_peer(room_id, "desktop", {
                        "type": "paired",
                        "token": room["token_a"],
                        "room_id": room_id,
                    })

                elif msg_type == "reconnect":
                    token = data.get("token", "")
                    last_seen_id = data.get("last_seen_id", 0)
                    room = await db.find_room_by_token(token)
                    if not room:
                        await ws.send_str(json.dumps({"type": "error", "message": "Invalid token"}))
                        continue

                    room_id = room["id"]
                    role = "desktop" if token == room["token_a"] else "phone"

                    if room_id not in connections:
                        connections[room_id] = {}
                    connections[room_id][role] = ws
                    ws_rooms[ws] = (room_id, role)

                    await ws.send_str(json.dumps({"type": "reconnected", "room_id": room_id}))

                    items = await db.get_items(room_id, since_id=last_seen_id)
                    await ws.send_str(json.dumps({"type": "items", "items": items}))

                elif msg_type == "item":
                    token = data.get("token", "")
                    room = await db.find_room_by_token(token)
                    if not room:
                        await ws.send_str(json.dumps({"type": "error", "message": "Invalid token"}))
                        continue

                    room_id = room["id"]
                    sender = "desktop" if token == room["token_a"] else "phone"
                    item_type = data.get("item_type", "text")
                    content = data.get("content", "")

                    item_id = await db.add_item(room_id, item_type, content, sender)
                    item = (await db.get_items(room_id, since_id=item_id - 1))[0]

                    # Build message with "type": "item" and "item_type" from db
                    item_msg = {
                        "type": "item",
                        "id": item["id"],
                        "item_type": item["type"],
                        "content": item["content"],
                        "metadata": item["metadata"],
                        "sender": item["sender"],
                        "created_at": item["created_at"],
                    }

                    other_role = "phone" if sender == "desktop" else "desktop"
                    await notify_peer(room_id, other_role, item_msg)

                elif msg_type == "delete":
                    token = data.get("token", "")
                    room = await db.find_room_by_token(token)
                    if not room:
                        continue
                    room_id = room["id"]
                    item_id = data.get("item_id")
                    await db.delete_item(room_id, item_id)

                    sender_role = "desktop" if token == room["token_a"] else "phone"
                    other_role = "phone" if sender_role == "desktop" else "desktop"
                    await notify_peer(room_id, other_role, {"type": "deleted", "item_id": item_id})

                elif msg_type == "clear":
                    token = data.get("token", "")
                    room = await db.find_room_by_token(token)
                    if not room:
                        continue
                    room_id = room["id"]
                    await db.clear_items(room_id)

                    sender_role = "desktop" if token == room["token_a"] else "phone"
                    other_role = "phone" if sender_role == "desktop" else "desktop"
                    await notify_peer(room_id, other_role, {"type": "cleared"})

            elif msg.type in (web.WSMsgType.ERROR, web.WSMsgType.CLOSE):
                break
    finally:
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

    ext = Path(filename).suffix.lower()
    file_uuid = str(uuid.uuid4())
    safe_filename = file_uuid + ext
    room_dir = os.path.join(uploads_dir, room_id)
    os.makedirs(room_dir, exist_ok=True)
    file_path = os.path.join(room_dir, safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_data)

    item_type = "image" if content_type.startswith("image/") else "file"
    metadata = json.dumps({
        "size": len(file_data),
        "mime": content_type,
        "filename": filename,
        "stored_as": safe_filename,
    })

    item_id = await db.add_item(room_id, item_type, safe_filename, sender, metadata=metadata)
    item = (await db.get_items(room_id, since_id=item_id - 1))[0]

    item_msg = {
        "type": "item",
        "id": item["id"],
        "item_type": item["type"],
        "content": item["content"],
        "metadata": item["metadata"],
        "sender": item["sender"],
        "created_at": item["created_at"],
    }

    other_role = "phone" if sender == "desktop" else "desktop"
    await notify_peer(room_id, other_role, item_msg)

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

    app.router.add_get("/drop/ws", handle_ws)
    app.router.add_post("/drop/api/upload", handle_upload)
    app.router.add_get("/drop/api/file/{room_id}/{item_id}", handle_file_download)
    app.router.add_post("/drop/share-target", handle_share_target)

    if static_dir and os.path.isdir(static_dir):
        if os.path.isdir(os.path.join(static_dir, "pwa")):
            app.router.add_static("/drop/pwa/", os.path.join(static_dir, "pwa"))
        if os.path.isdir(os.path.join(static_dir, "desktop")):
            app.router.add_static("/drop/", os.path.join(static_dir, "desktop"))

    return app


async def cleanup_task(app):
    db: Database = app["db"]
    while True:
        await asyncio.sleep(3600)
        try:
            stale = await db.cleanup_stale_rooms()
            if stale:
                uploads_dir = app["uploads_dir"]
                import shutil
                for room_id in stale:
                    room_dir = os.path.join(uploads_dir, room_id)
                    if os.path.isdir(room_dir):
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
