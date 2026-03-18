#!/usr/bin/env python3
"""Asteroids game server with shared game area and highscores."""

import argparse
import asyncio
import json
import math
import os
import random
import time
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import websockets

# Game state
players = {}
asteroids = []
bullets = []
highscores = []
next_player_id = 1
next_asteroid_id = 1
next_bullet_id = 1

GAME_WIDTH = 1200
GAME_HEIGHT = 800
MAX_ASTEROIDS = 12
PLAYER_RADIUS = 15
SAFE_SPAWN_DIST = 150
INVINCIBLE_TICKS = 90  # 3 seconds at 30 FPS
KILL_POINTS = 200
HIGHSCORE_FILE = os.path.join(os.path.dirname(__file__), 'highscores.json')


def load_highscores():
    global highscores
    try:
        if os.path.exists(HIGHSCORE_FILE):
            with open(HIGHSCORE_FILE, 'r') as f:
                highscores = json.load(f)
    except Exception as e:
        print(f"Error loading highscores: {e}")
        highscores = []


def save_highscores():
    try:
        with open(HIGHSCORE_FILE, 'w') as f:
            json.dump(highscores[:10], f, indent=2)
    except Exception as e:
        print(f"Error saving highscores: {e}")


def add_highscore(name, score):
    global highscores
    # Keep only the top score per player name
    existing = next((hs for hs in highscores if hs['name'] == name), None)
    if existing:
        if score > existing['score']:
            existing['score'] = score
            existing['date'] = datetime.now().isoformat()
    else:
        highscores.append({'name': name, 'score': score, 'date': datetime.now().isoformat()})
    highscores.sort(key=lambda x: x['score'], reverse=True)
    highscores = highscores[:10]
    save_highscores()


def spawn_asteroid(size='large'):
    global next_asteroid_id
    sizes = {'large': 40, 'medium': 25, 'small': 15}
    points = {'large': 20, 'medium': 50, 'small': 100}

    # Spawn from edges
    edge = random.choice(['top', 'bottom', 'left', 'right'])
    if edge == 'top':
        x, y = random.randint(0, GAME_WIDTH), 0
    elif edge == 'bottom':
        x, y = random.randint(0, GAME_WIDTH), GAME_HEIGHT
    elif edge == 'left':
        x, y = 0, random.randint(0, GAME_HEIGHT)
    else:
        x, y = GAME_WIDTH, random.randint(0, GAME_HEIGHT)

    angle = random.uniform(0, 360)
    speed = random.uniform(1, 3)

    asteroid = {
        'id': next_asteroid_id,
        'x': x,
        'y': y,
        'vx': speed * (0.5 - random.random()) * 2,
        'vy': speed * (0.5 - random.random()) * 2,
        'size': size,
        'radius': sizes[size],
        'points': points[size],
        'rotation': random.uniform(0, 360),
        'rotationSpeed': random.uniform(-2, 2),
        'vertices': random.randint(7, 12)
    }
    next_asteroid_id += 1
    return asteroid


def init_asteroids():
    global asteroids
    asteroids = [spawn_asteroid('large') for _ in range(6)]


def find_safe_spawn():
    """Find a spawn position far from other players and asteroids."""
    for _ in range(50):
        x = random.randint(50, GAME_WIDTH - 50)
        y = random.randint(50, GAME_HEIGHT - 50)
        safe = True
        for p in players.values():
            if p.get('dead'):
                continue
            dx = x - p['x']
            dy = y - p['y']
            if (dx*dx + dy*dy) ** 0.5 < SAFE_SPAWN_DIST:
                safe = False
                break
        if safe:
            for a in asteroids:
                dx = x - a['x']
                dy = y - a['y']
                if (dx*dx + dy*dy) ** 0.5 < a['radius'] + SAFE_SPAWN_DIST * 0.5:
                    safe = False
                    break
        if safe:
            return x, y
    # Fallback: pick the position farthest from any player
    best_x, best_y, best_dist = GAME_WIDTH / 2, GAME_HEIGHT / 2, 0
    for _ in range(20):
        x = random.randint(50, GAME_WIDTH - 50)
        y = random.randint(50, GAME_HEIGHT - 50)
        min_dist = float('inf')
        for p in players.values():
            if p.get('dead'):
                continue
            dx = x - p['x']
            dy = y - p['y']
            d = (dx*dx + dy*dy) ** 0.5
            if d < min_dist:
                min_dist = d
        if min_dist > best_dist:
            best_dist = min_dist
            best_x, best_y = x, y
    return best_x, best_y


class GameHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(__file__), **kwargs)

    def do_GET(self):
        # Strip /asteroids prefix if present
        if self.path.startswith('/asteroids'):
            self.path = self.path[10:] or '/'

        if self.path == '/' or self.path == '':
            self.path = '/index.html'

        if self.path == '/api/highscores':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(highscores).encode())
            return

        return super().do_GET()

    def log_message(self, format, *args):
        print(f"[HTTP {datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def run_http_server(port):
    server = HTTPServer(('127.0.0.1', port), GameHTTPHandler)
    print(f"HTTP server running on http://127.0.0.1:{port}")
    server.serve_forever()


connected_clients = set()


async def broadcast(message):
    if connected_clients:
        await asyncio.gather(*[client.send(message) for client in connected_clients])


async def game_loop():
    global asteroids, bullets

    while True:
        # Update asteroids
        for asteroid in asteroids:
            asteroid['x'] = (asteroid['x'] + asteroid['vx']) % GAME_WIDTH
            asteroid['y'] = (asteroid['y'] + asteroid['vy']) % GAME_HEIGHT
            asteroid['rotation'] += asteroid['rotationSpeed']

        # Spawn new asteroids if needed
        while len(asteroids) < MAX_ASTEROIDS:
            asteroids.append(spawn_asteroid('large'))

        # Update bullets
        bullets_to_remove = []
        for bullet in bullets:
            bullet['x'] += bullet['vx']
            bullet['y'] += bullet['vy']
            bullet['lifetime'] -= 1

            if bullet['lifetime'] <= 0:
                bullets_to_remove.append(bullet)
                continue

            # Wrap around
            bullet['x'] = bullet['x'] % GAME_WIDTH
            bullet['y'] = bullet['y'] % GAME_HEIGHT

            # Check collision with asteroids
            for asteroid in asteroids[:]:
                dx = bullet['x'] - asteroid['x']
                dy = bullet['y'] - asteroid['y']
                dist = (dx*dx + dy*dy) ** 0.5

                if dist < asteroid['radius']:
                    # Hit!
                    bullets_to_remove.append(bullet)

                    # Award points to player
                    if bullet['playerId'] in players:
                        players[bullet['playerId']]['score'] += asteroid['points']

                    # Split asteroid or remove
                    asteroids.remove(asteroid)
                    if asteroid['size'] == 'large':
                        for _ in range(2):
                            new_ast = spawn_asteroid('medium')
                            new_ast['x'] = asteroid['x']
                            new_ast['y'] = asteroid['y']
                            asteroids.append(new_ast)
                    elif asteroid['size'] == 'medium':
                        for _ in range(2):
                            new_ast = spawn_asteroid('small')
                            new_ast['x'] = asteroid['x']
                            new_ast['y'] = asteroid['y']
                            asteroids.append(new_ast)
                    break

            # Check collision with players
            if bullet in bullets_to_remove:
                continue
            for pid, target in list(players.items()):
                if target.get('dead'):
                    continue
                if pid == bullet['playerId']:
                    continue  # Can't shoot yourself
                if target.get('invincible', 0) > 0:
                    continue
                dx = bullet['x'] - target['x']
                dy = bullet['y'] - target['y']
                dist = (dx*dx + dy*dy) ** 0.5
                if dist < PLAYER_RADIUS + 3:
                    bullets_to_remove.append(bullet)
                    # Award kill points to shooter
                    shooter_id = bullet['playerId']
                    if shooter_id in players:
                        players[shooter_id]['score'] += KILL_POINTS
                    target['lives'] -= 1
                    if target['lives'] <= 0:
                        target['dead'] = True
                        target['killedBy'] = players[shooter_id]['name'] if shooter_id in players else ''
                        add_highscore(target['name'], target['score'])
                    else:
                        sx, sy = find_safe_spawn()
                        target['x'] = sx
                        target['y'] = sy
                        target['vx'] = 0
                        target['vy'] = 0
                        target['invincible'] = INVINCIBLE_TICKS
                    break

        for bullet in bullets_to_remove:
            if bullet in bullets:
                bullets.remove(bullet)

        # Tick down invincibility
        for pid, player in players.items():
            if player.get('invincible', 0) > 0:
                player['invincible'] -= 1

        # Check player-asteroid collisions
        for pid, player in list(players.items()):
            if player.get('dead'):
                continue
            if player.get('invincible', 0) > 0:
                continue
            for asteroid in asteroids:
                dx = player['x'] - asteroid['x']
                dy = player['y'] - asteroid['y']
                dist = (dx*dx + dy*dy) ** 0.5

                if dist < asteroid['radius'] + PLAYER_RADIUS:
                    player['lives'] -= 1
                    if player['lives'] <= 0:
                        player['dead'] = True
                        player['killedBy'] = ''
                        add_highscore(player['name'], player['score'])
                    else:
                        sx, sy = find_safe_spawn()
                        player['x'] = sx
                        player['y'] = sy
                        player['vx'] = 0
                        player['vy'] = 0
                        player['invincible'] = INVINCIBLE_TICKS
                    break

        # Broadcast state
        state = {
            'type': 'state',
            'players': players,
            'asteroids': asteroids,
            'bullets': bullets,
            'highscores': highscores[:5]
        }

        if connected_clients:
            await broadcast(json.dumps(state))

        await asyncio.sleep(1/30)  # 30 FPS


async def handle_client(websocket):
    global next_player_id, next_bullet_id, players, bullets

    player_id = None
    connected_clients.add(websocket)

    try:
        async for message in websocket:
            data = json.loads(message)

            if data['type'] == 'join':
                player_id = next_player_id
                next_player_id += 1

                sx, sy = find_safe_spawn()
                players[player_id] = {
                    'id': player_id,
                    'name': data.get('name', f'Player{player_id}')[:12],
                    'x': sx,
                    'y': sy,
                    'angle': random.randint(0, 359),
                    'vx': 0,
                    'vy': 0,
                    'score': 0,
                    'lives': 3,
                    'color': f'hsl({random.randint(0, 360)}, 70%, 60%)',
                    'dead': False,
                    'invincible': INVINCIBLE_TICKS,
                    'killedBy': ''
                }

                await websocket.send(json.dumps({
                    'type': 'joined',
                    'playerId': player_id,
                    'gameWidth': GAME_WIDTH,
                    'gameHeight': GAME_HEIGHT
                }))

            elif data['type'] == 'input' and player_id and player_id in players:
                player = players[player_id]
                if player.get('dead'):
                    continue

                # Update player based on input
                if data.get('thrust'):
                    rad = math.radians(player['angle'])
                    player['vx'] += math.cos(rad) * 0.3
                    player['vy'] += math.sin(rad) * 0.3
                    # Limit speed
                    speed = (player['vx']**2 + player['vy']**2) ** 0.5
                    if speed > 8:
                        player['vx'] = player['vx'] / speed * 8
                        player['vy'] = player['vy'] / speed * 8

                if data.get('left'):
                    player['angle'] -= 5
                if data.get('right'):
                    player['angle'] += 5

                if data.get('fire'):
                    rad = math.radians(player['angle'])
                    bullet = {
                        'id': next_bullet_id,
                        'playerId': player_id,
                        'x': player['x'] + math.cos(rad) * 20,
                        'y': player['y'] + math.sin(rad) * 20,
                        'vx': math.cos(rad) * 10 + player['vx'] * 0.5,
                        'vy': math.sin(rad) * 10 + player['vy'] * 0.5,
                        'lifetime': 60,
                        'color': player['color']
                    }
                    next_bullet_id += 1
                    bullets.append(bullet)

                # Apply friction and update position
                player['vx'] *= 0.99
                player['vy'] *= 0.99
                player['x'] = (player['x'] + player['vx']) % GAME_WIDTH
                player['y'] = (player['y'] + player['vy']) % GAME_HEIGHT

            elif data['type'] == 'respawn' and player_id and player_id in players:
                player = players[player_id]
                if player.get('dead'):
                    sx, sy = find_safe_spawn()
                    player['dead'] = False
                    player['lives'] = 3
                    player['score'] = 0
                    player['x'] = sx
                    player['y'] = sy
                    player['vx'] = 0
                    player['vy'] = 0
                    player['invincible'] = INVINCIBLE_TICKS
                    player['killedBy'] = ''

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        if player_id and player_id in players:
            # Save score before removing
            if players[player_id]['score'] > 0:
                add_highscore(players[player_id]['name'], players[player_id]['score'])
            del players[player_id]


async def main_async(ws_port):
    init_asteroids()

    server = await websockets.serve(handle_client, '127.0.0.1', ws_port)
    print(f"WebSocket server running on ws://127.0.0.1:{ws_port}")

    await asyncio.gather(
        server.wait_closed(),
        game_loop()
    )


def main():
    parser = argparse.ArgumentParser(description='Asteroids game server')
    parser.add_argument('-p', '--port', type=int, default=8082,
                        help='HTTP port (default: 8082)')
    parser.add_argument('-w', '--ws-port', type=int, default=8083,
                        help='WebSocket port (default: 8083)')
    args = parser.parse_args()

    load_highscores()

    # Start HTTP server in thread
    http_thread = threading.Thread(target=run_http_server, args=(args.port,), daemon=True)
    http_thread.start()

    print(f"Asteroids server starting...")
    print(f"  HTTP:      http://127.0.0.1:{args.port}")
    print(f"  WebSocket: ws://127.0.0.1:{args.ws_port}")

    try:
        asyncio.run(main_async(args.ws_port))
    except KeyboardInterrupt:
        print("\nShutting down...")


if __name__ == '__main__':
    main()
