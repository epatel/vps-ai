# Quiz

Realtime multiplayer trivia game (Kahoot-style). One device hosts; others
join with a 4-letter room code and answer multiple-choice questions in real
time. Faster correct answers earn more points; the leaderboard shows after
every question.

Single-process Python server (`aiohttp`) serving both the static frontend
and a `/quiz/ws` websocket endpoint. State is in-memory only — restarting
the server clears all rooms.

## Files

```
server.py            aiohttp server + websocket protocol
questions.json       question deck (title + array of {q, choices, answer})
static/index.html    single-page frontend (host + player views)
quiz.service         systemd unit (port 8092)
setup.sh             venv + pip install
nginx.conf.example   nginx location blocks (proxy + websocket)
```

## Local run

```
bash setup.sh
./venv/bin/python server.py --port 8092
# open http://127.0.0.1:8092/quiz/
```

## Server deploy

The post-merge hook restarts `quiz.service` whenever `projects/quiz/` is
touched on `main`. The status page tracks it as `Quiz` at `/quiz`.

Nginx is configured (see `nginx.conf.example`) to proxy:

- `/quiz/ws` → `127.0.0.1:8092` with websocket upgrade headers
- `/quiz/`   → `127.0.0.1:8092`

## Protocol

Client → Server messages (JSON over websocket):

| `type` | Fields | Notes |
|---|---|---|
| `create` | — | Host: create a room. Returns `created` with `room` and `host_token`. |
| `rehost` | `room`, `host_token` | Reconnect as host. |
| `join` | `room`, `name` | Player join. Returns `joined` with `player_id`. |
| `start` | `room`, `host_token` | Begin first question. |
| `next` | `room`, `host_token` | Advance to next question (or finish). |
| `reveal` | `room`, `host_token` | Force-reveal current question. |
| `reset` | `room`, `host_token` | Back to lobby, scores cleared. |
| `answer` | `choice` (int) | Submit answer for current question. |
| `leave` | — | Remove yourself from the room. |

Server → Client:

| `type` | Sent to | Payload |
|---|---|---|
| `created` | host | `room`, `host_token`, `deck_size`, `title` |
| `joined`  | player | `room`, `player_id`, `name`, `title` |
| `lobby`   | room | `players: [{id,name,score}]`, `deck_size` |
| `question`| room | `index`, `total`, `question`, `choices`, `duration` |
| `answer_count` | host | `answered`, `total` |
| `reveal`  | host | `correct_index`, `counts[]`, `leaderboard`, `is_last` |
| `reveal`  | player | `correct_index`, `your_choice`, `you_correct`, `points_awarded`, `score`, `leaderboard` |
| `final`   | room | `leaderboard` |
| `error`   | sender | `message` |

## Scoring

Correct answer:
- 500 base + up to 500 bonus, scaled linearly by remaining time.
- 0 points for wrong or no answer.

## Customizing the deck

Edit `questions.json` and restart the service. Each question is `{q,
choices[], answer}` where `answer` is the 0-based index of the correct
choice.
