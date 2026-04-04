"""Server integration tests. Run with: python -m tests.test_server

Uses a real server on a random port to avoid TestClient/TestServer
WebSocket interaction issues.
"""
import asyncio
import json
import os
import sys
import tempfile
import shutil
import socket
import threading

from aiohttp import web, ClientSession

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import create_app


def find_free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def recv(ws, timeout=5):
    msg = await asyncio.wait_for(ws.receive_json(), timeout=timeout)
    return msg


class ServerFixture:
    def __init__(self):
        self.td = tempfile.mkdtemp()
        self.port = find_free_port()
        self.runner = None

    async def start(self):
        app = await create_app(
            db_path=os.path.join(self.td, "test.db"),
            uploads_dir=os.path.join(self.td, "uploads"),
            static_dir=None,
        )
        self.app = app
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", self.port)
        await site.start()
        self.base = f"http://127.0.0.1:{self.port}"
        self.ws_url = f"ws://127.0.0.1:{self.port}/drop/ws"

    async def stop(self):
        await self.app["db"].close()
        await self.runner.cleanup()
        shutil.rmtree(self.td, ignore_errors=True)


async def pair(session, ws_url):
    dws = await session.ws_connect(ws_url)
    await dws.send_json({"type": "request_code"})
    code = (await recv(dws))["code"]

    pws = await session.ws_connect(ws_url)
    await pws.send_json({"type": "pair", "code": code})
    pt = (await recv(pws))["token"]
    dt = (await recv(dws))["token"]
    return dws, pws, dt, pt


async def test_pairing_flow(session, srv):
    dws, pws, dt, pt = await pair(session, srv.ws_url)
    assert len(dt) == 32
    assert len(pt) == 32
    assert dt != pt
    await dws.close()
    await pws.close()


async def test_send_text_item(session, srv):
    dws, pws, dt, pt = await pair(session, srv.ws_url)
    await pws.send_json({
        "type": "item", "token": pt,
        "item_type": "text", "content": "Hello from phone",
    })
    item = await recv(dws)
    assert item["content"] == "Hello from phone"
    assert item["sender"] == "phone"
    await dws.close()
    await pws.close()


async def test_reconnect_with_token(session, srv):
    dws, pws, dt, pt = await pair(session, srv.ws_url)
    await pws.send_json({
        "type": "item", "token": pt,
        "item_type": "link", "content": "https://example.com",
    })
    await recv(dws)
    await dws.close()
    await pws.close()

    dws2 = await session.ws_connect(srv.ws_url)
    await dws2.send_json({"type": "reconnect", "token": dt, "last_seen_id": 0})
    resp = await recv(dws2)
    assert resp["type"] == "reconnected"
    items = await recv(dws2)
    assert items["type"] == "items"
    assert len(items["items"]) == 1
    assert items["items"][0]["content"] == "https://example.com"
    await dws2.close()


async def test_invalid_pairing_code(session, srv):
    ws = await session.ws_connect(srv.ws_url)
    await ws.send_json({"type": "pair", "code": "XXXXXX"})
    resp = await recv(ws)
    assert resp["type"] == "error"
    await ws.close()


async def test_delete_item(session, srv):
    dws, pws, dt, pt = await pair(session, srv.ws_url)
    await pws.send_json({
        "type": "item", "token": pt,
        "item_type": "text", "content": "Delete me",
    })
    item = await recv(dws)
    item_id = item["id"]

    await dws.send_json({"type": "delete", "token": dt, "item_id": item_id})
    dm = await recv(pws)
    assert dm["type"] == "deleted"
    assert dm["item_id"] == item_id
    await dws.close()
    await pws.close()


async def test_file_upload_and_download(session, srv):
    dws, pws, dt, pt = await pair(session, srv.ws_url)
    from aiohttp import FormData
    data = FormData()
    data.add_field("token", pt)
    data.add_field("file", b"fake image data",
                   filename="test.png", content_type="image/png")
    resp = await session.post(f"{srv.base}/drop/api/upload", data=data)
    assert resp.status == 200
    rj = await resp.json()
    file_id = rj["item_id"]

    item = await recv(dws)
    assert item["item_type"] == "image"

    room = await srv.app["db"].find_room_by_token(pt)
    dl = await session.get(f"{srv.base}/drop/api/file/{room['id']}/{file_id}?token={pt}")
    assert dl.status == 200
    body = await dl.read()
    assert body == b"fake image data"
    await dws.close()
    await pws.close()


ALL_TESTS = [
    test_pairing_flow,
    test_send_text_item,
    test_reconnect_with_token,
    test_invalid_pairing_code,
    test_delete_item,
    test_file_upload_and_download,
]


async def run_all():
    srv = ServerFixture()
    await srv.start()
    passed = 0
    failed = 0

    async with ClientSession() as session:
        for test_fn in ALL_TESTS:
            name = test_fn.__name__
            try:
                await asyncio.wait_for(test_fn(session, srv), timeout=10)
                print(f"  PASS {name}")
                passed += 1
            except Exception as e:
                print(f"  FAIL {name}: {type(e).__name__}: {e}")
                failed += 1

    await srv.stop()
    print(f"\n{passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    ok = asyncio.run(run_all())
    sys.exit(0 if ok else 1)
