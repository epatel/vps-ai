#!/usr/bin/env python3
"""Multiplayer quiz game server.

A Kahoot-style trivia game. One client takes the "host" role and creates a
room — the room shows a 4-letter code on the host's screen. Other clients
join by entering the code. The host advances questions; players submit
answers in real time. Faster correct answers earn more points.

Single-process aiohttp server: serves the static frontend and a websocket
endpoint at /quiz/ws. State is in-memory only — restarting clears all rooms.
"""

import argparse
import asyncio
import json
import logging
import os
import random
import secrets
import string
import time
from pathlib import Path

from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Tunables
QUESTION_TIME_S = 20.0
LOBBY_MAX_PLAYERS = 30
ROOM_CODE_LENGTH = 4
ROOM_TTL_S = 60 * 60 * 4   # 4 hours of inactivity → cleanup
NAME_MAX_LEN = 20


def make_room_code(existing):
    """Generate a unique uppercase room code (letters only — readable)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # no I/O for readability
    while True:
        code = "".join(random.choice(alphabet) for _ in range(ROOM_CODE_LENGTH))
        if code not in existing:
            return code


class Room:
    def __init__(self, code, host_token, deck):
        self.code = code
        self.host_token = host_token
        self.deck = deck                 # list of question dicts
        self.host_ws = None              # current host websocket
        self.players = {}                # player_id -> {"name", "score", "ws"}
        self.next_player_id = 1
        # Game state
        self.phase = "lobby"             # lobby | question | reveal | final
        self.q_index = -1                # current question index
        self.q_started = 0.0             # monotonic time when question began
        self.q_ends = 0.0                # monotonic time when question times out
        self.answers = {}                # player_id -> {"choice", "elapsed", "correct"}
        self.timeout_task = None
        self.last_activity = time.monotonic()

    # ----- player roster -----

    def player_list(self):
        return [
            {"id": pid, "name": p["name"], "score": p["score"]}
            for pid, p in self.players.items()
        ]

    def leaderboard(self):
        return sorted(self.player_list(), key=lambda p: -p["score"])

    # ----- broadcasting -----

    async def send_host(self, msg):
        ws = self.host_ws
        if ws is None:
            return
        try:
            await ws.send_str(json.dumps(msg))
        except Exception:
            pass

    async def send_player(self, player_id, msg):
        p = self.players.get(player_id)
        if not p or p["ws"] is None:
            return
        try:
            await p["ws"].send_str(json.dumps(msg))
        except Exception:
            pass

    async def broadcast(self, msg, include_host=True):
        text = json.dumps(msg)
        targets = []
        for pid, p in self.players.items():
            if p["ws"] is not None:
                targets.append(p["ws"])
        if include_host and self.host_ws is not None:
            targets.append(self.host_ws)
        for ws in targets:
            try:
                await ws.send_str(text)
            except Exception:
                pass

    # ----- game flow -----

    async def start_question(self):
        self.phase = "question"
        self.q_index += 1
        self.answers = {}
        self.q_started = time.monotonic()
        self.q_ends = self.q_started + QUESTION_TIME_S

        q = self.deck[self.q_index]
        public_q = {
            "type": "question",
            "index": self.q_index,
            "total": len(self.deck),
            "question": q["q"],
            "choices": q["choices"],
            "duration": QUESTION_TIME_S,
        }
        await self.broadcast(public_q)

        # Schedule auto-reveal on timeout
        if self.timeout_task is not None:
            self.timeout_task.cancel()
        self.timeout_task = asyncio.create_task(self._auto_reveal(self.q_index))

    async def _auto_reveal(self, q_index):
        try:
            await asyncio.sleep(QUESTION_TIME_S)
        except asyncio.CancelledError:
            return
        # Only reveal if still on this question and not already revealed
        if self.q_index == q_index and self.phase == "question":
            await self.reveal()

    async def submit_answer(self, player_id, choice):
        if self.phase != "question":
            return
        if player_id not in self.players:
            return
        if player_id in self.answers:
            return  # already answered
        if not isinstance(choice, int) or choice < 0:
            return
        q = self.deck[self.q_index]
        if choice >= len(q["choices"]):
            return

        elapsed = max(0.0, time.monotonic() - self.q_started)
        correct = (choice == q["answer"])
        # Score: full 1000 if instant, decaying linearly to 500 at full time.
        # Half marks for participation if you got it right but slow.
        if correct:
            frac = max(0.0, 1.0 - elapsed / QUESTION_TIME_S)
            points = int(500 + 500 * frac)
        else:
            points = 0
        self.answers[player_id] = {
            "choice": choice,
            "elapsed": elapsed,
            "correct": correct,
            "points": points,
        }
        self.players[player_id]["score"] += points

        # Tell the host how many have answered
        await self.send_host({
            "type": "answer_count",
            "answered": len(self.answers),
            "total": len(self.players),
        })

        # If everyone answered, reveal early
        if len(self.answers) >= len(self.players) and len(self.players) > 0:
            await self.reveal()

    async def reveal(self):
        if self.phase != "question":
            return
        if self.timeout_task is not None:
            self.timeout_task.cancel()
            self.timeout_task = None
        self.phase = "reveal"
        q = self.deck[self.q_index]
        # Per-player result for personal feedback
        for pid in self.players:
            ans = self.answers.get(pid)
            await self.send_player(pid, {
                "type": "reveal",
                "correct_index": q["answer"],
                "your_choice": ans["choice"] if ans else None,
                "you_correct": ans["correct"] if ans else False,
                "points_awarded": ans["points"] if ans else 0,
                "score": self.players[pid]["score"],
                "leaderboard": self.leaderboard(),
            })
        # Host gets aggregate distribution
        counts = [0] * len(q["choices"])
        for ans in self.answers.values():
            counts[ans["choice"]] += 1
        await self.send_host({
            "type": "reveal",
            "correct_index": q["answer"],
            "counts": counts,
            "leaderboard": self.leaderboard(),
            "is_last": self.q_index >= len(self.deck) - 1,
        })

    async def finish(self):
        self.phase = "final"
        await self.broadcast({
            "type": "final",
            "leaderboard": self.leaderboard(),
        })

    async def reset(self):
        if self.timeout_task is not None:
            self.timeout_task.cancel()
            self.timeout_task = None
        self.phase = "lobby"
        self.q_index = -1
        self.answers = {}
        for p in self.players.values():
            p["score"] = 0
        await self.broadcast({
            "type": "lobby",
            "players": self.player_list(),
            "deck_size": len(self.deck),
        })


# ----- HTTP / WS handlers -----

async def handle_ws(request):
    ws = web.WebSocketResponse(heartbeat=30.0)
    await ws.prepare(request)
    rooms = request.app["rooms"]

    # Stuff bound to this connection
    bound_room_code = None
    bound_role = None        # "host" or "player"
    bound_player_id = None

    def cleanup_binding():
        nonlocal bound_room_code, bound_role, bound_player_id
        if not bound_room_code:
            return
        room = rooms.get(bound_room_code)
        if not room:
            bound_room_code = None
            return
        if bound_role == "host" and room.host_ws is ws:
            room.host_ws = None
        elif bound_role == "player" and bound_player_id in room.players:
            # Mark websocket as gone but keep score in case they reconnect.
            room.players[bound_player_id]["ws"] = None
        bound_room_code = None
        bound_role = None
        bound_player_id = None

    try:
        async for msg in ws:
            if msg.type != web.WSMsgType.TEXT:
                if msg.type in (web.WSMsgType.ERROR, web.WSMsgType.CLOSE):
                    break
                continue
            try:
                data = json.loads(msg.data)
            except json.JSONDecodeError:
                await ws.send_str(json.dumps({"type": "error", "message": "bad json"}))
                continue

            t = data.get("type")

            if t == "create":
                # Host creates a new room
                deck_data = request.app["deck"]
                # Optional: shuffle deck per room
                deck = list(deck_data)
                random.shuffle(deck)
                code = make_room_code(rooms)
                token = secrets.token_hex(8)
                room = Room(code, token, deck)
                room.host_ws = ws
                rooms[code] = room
                cleanup_binding()  # in case this ws was previously bound
                bound_room_code = code
                bound_role = "host"
                await ws.send_str(json.dumps({
                    "type": "created",
                    "room": code,
                    "host_token": token,
                    "deck_size": len(deck),
                    "title": request.app["deck_title"],
                }))

            elif t == "rehost":
                # Host reconnects with their token
                code = (data.get("room") or "").strip().upper()
                token = data.get("host_token") or ""
                room = rooms.get(code)
                if not room or room.host_token != token:
                    await ws.send_str(json.dumps({"type": "error", "message": "invalid host"}))
                    continue
                room.host_ws = ws
                cleanup_binding()
                bound_room_code = code
                bound_role = "host"
                await ws.send_str(json.dumps({
                    "type": "rehosted",
                    "room": code,
                    "deck_size": len(room.deck),
                    "phase": room.phase,
                    "players": room.player_list(),
                    "title": request.app["deck_title"],
                }))

            elif t == "join":
                code = (data.get("room") or "").strip().upper()
                name = (data.get("name") or "").strip()[:NAME_MAX_LEN] or "Player"
                room = rooms.get(code)
                if not room:
                    await ws.send_str(json.dumps({"type": "error", "message": "no such room"}))
                    continue
                if len(room.players) >= LOBBY_MAX_PLAYERS:
                    await ws.send_str(json.dumps({"type": "error", "message": "room is full"}))
                    continue
                if room.phase not in ("lobby",):
                    # Allow late join during reveal between questions; refuse mid-question
                    if room.phase == "question":
                        await ws.send_str(json.dumps({"type": "error", "message": "game in progress"}))
                        continue
                pid = room.next_player_id
                room.next_player_id += 1
                room.players[pid] = {"name": name, "score": 0, "ws": ws}
                cleanup_binding()
                bound_room_code = code
                bound_role = "player"
                bound_player_id = pid
                await ws.send_str(json.dumps({
                    "type": "joined",
                    "room": code,
                    "player_id": pid,
                    "name": name,
                    "title": request.app["deck_title"],
                }))
                await room.broadcast({
                    "type": "lobby",
                    "players": room.player_list(),
                    "deck_size": len(room.deck),
                })

            elif t == "start":
                code = (data.get("room") or "").strip().upper()
                token = data.get("host_token") or ""
                room = rooms.get(code)
                if not room or room.host_token != token:
                    await ws.send_str(json.dumps({"type": "error", "message": "invalid host"}))
                    continue
                if not room.players:
                    await ws.send_str(json.dumps({"type": "error", "message": "no players"}))
                    continue
                room.q_index = -1
                for p in room.players.values():
                    p["score"] = 0
                await room.start_question()

            elif t == "next":
                code = (data.get("room") or "").strip().upper()
                token = data.get("host_token") or ""
                room = rooms.get(code)
                if not room or room.host_token != token:
                    continue
                if room.phase == "reveal":
                    if room.q_index >= len(room.deck) - 1:
                        await room.finish()
                    else:
                        await room.start_question()
                elif room.phase == "question":
                    # Force-reveal current question
                    await room.reveal()

            elif t == "reveal":
                code = (data.get("room") or "").strip().upper()
                token = data.get("host_token") or ""
                room = rooms.get(code)
                if not room or room.host_token != token:
                    continue
                await room.reveal()

            elif t == "reset":
                code = (data.get("room") or "").strip().upper()
                token = data.get("host_token") or ""
                room = rooms.get(code)
                if not room or room.host_token != token:
                    continue
                await room.reset()

            elif t == "answer":
                # Player submits answer
                if bound_role != "player" or bound_room_code is None:
                    continue
                room = rooms.get(bound_room_code)
                if not room:
                    continue
                choice = data.get("choice")
                await room.submit_answer(bound_player_id, choice)

            elif t == "leave":
                # Voluntary leave by player
                if bound_role == "player" and bound_room_code:
                    room = rooms.get(bound_room_code)
                    if room and bound_player_id in room.players:
                        room.players.pop(bound_player_id, None)
                        await room.broadcast({
                            "type": "lobby",
                            "players": room.player_list(),
                            "deck_size": len(room.deck),
                        })
                    cleanup_binding()

            else:
                await ws.send_str(json.dumps({"type": "error", "message": f"unknown type {t!r}"}))

            # Bump room activity timestamp
            if bound_room_code and bound_room_code in rooms:
                rooms[bound_room_code].last_activity = time.monotonic()

    finally:
        cleanup_binding()

    return ws


def load_deck(path):
    with open(path) as f:
        data = json.load(f)
    title = data.get("title", "Quiz")
    questions = data.get("questions", [])
    # Validate
    cleaned = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        if not all(k in q for k in ("q", "choices", "answer")):
            continue
        if not isinstance(q["choices"], list) or not q["choices"]:
            continue
        if not isinstance(q["answer"], int):
            continue
        if q["answer"] < 0 or q["answer"] >= len(q["choices"]):
            continue
        cleaned.append({
            "q": str(q["q"]),
            "choices": [str(c) for c in q["choices"]],
            "answer": q["answer"],
        })
    if not cleaned:
        raise SystemExit(f"No valid questions found in {path}")
    return title, cleaned


async def index_handler(request):
    static_dir = request.app["static_dir"]
    index = Path(static_dir) / "index.html"
    if index.exists():
        return web.FileResponse(index)
    return web.Response(text="quiz: index missing", status=404)


async def health(request):
    return web.json_response({"ok": True, "rooms": len(request.app["rooms"])})


async def cleanup_loop(app):
    """Drop rooms that have been idle for too long."""
    while True:
        try:
            await asyncio.sleep(300)
            now = time.monotonic()
            stale = [code for code, room in app["rooms"].items()
                     if now - room.last_activity > ROOM_TTL_S]
            for code in stale:
                room = app["rooms"].pop(code, None)
                if room and room.timeout_task:
                    room.timeout_task.cancel()
            if stale:
                log.info(f"reaped {len(stale)} stale rooms")
        except asyncio.CancelledError:
            break
        except Exception as e:
            log.error(f"cleanup error: {e}")


async def on_startup(app):
    app["cleanup_task"] = asyncio.create_task(cleanup_loop(app))


async def on_shutdown(app):
    task = app.get("cleanup_task")
    if task:
        task.cancel()


def create_app(deck_path, static_dir):
    title, deck = load_deck(deck_path)
    app = web.Application()
    app["rooms"] = {}
    app["deck"] = deck
    app["deck_title"] = title
    app["static_dir"] = static_dir

    app.router.add_get("/quiz/health", health)
    app.router.add_get("/quiz/ws", handle_ws)
    app.router.add_get("/quiz/", index_handler)
    app.router.add_get("/quiz", index_handler)
    if static_dir and os.path.isdir(static_dir):
        app.router.add_static("/quiz/", static_dir)

    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    return app


def main():
    parser = argparse.ArgumentParser(description="Quiz game server")
    parser.add_argument("--port", type=int, default=8092)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--deck", default=str(Path(__file__).parent / "questions.json"))
    parser.add_argument("--static", default=str(Path(__file__).parent / "static"))
    args = parser.parse_args()

    app = create_app(args.deck, args.static)
    web.run_app(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
