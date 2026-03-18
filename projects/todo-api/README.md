# Todo API

REST API for managing todo items with user authentication.

## Features

- User signup with email verification via Mailjet
- JWT-based authentication
- CRUD operations for todo items
- Reorderable todo items (float-based sort_order)
- Markdown descriptions supported
- SQLite persistence

## API Endpoints

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/todo-api/auth/signup` | Register a new user |
| GET | `/todo-api/auth/verify?token=...` | Verify email address |
| POST | `/todo-api/auth/login` | Login and get JWT token |
| GET | `/todo-api/auth/me` | Get current user info |

### Todos (requires `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/todo-api/todos` | List all todos (ordered) |
| POST | `/todo-api/todos` | Create a todo |
| GET | `/todo-api/todos/:id` | Get a single todo |
| PUT | `/todo-api/todos/:id` | Update a todo |
| DELETE | `/todo-api/todos/:id` | Delete a todo |
| POST | `/todo-api/todos/reorder` | Bulk reorder todos |

### Signup

```bash
curl -X POST https://ai.memention.net/todo-api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "mypassword"}'
```

### Login

```bash
curl -X POST https://ai.memention.net/todo-api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "mypassword"}'
```

### Create Todo

```bash
curl -X POST https://ai.memention.net/todo-api/todos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "description": "## Items\n- Milk\n- Bread"}'
```

### Reorder Todos

```bash
curl -X POST https://ai.memention.net/todo-api/todos/reorder \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"id": "uuid1", "sort_order": 1}, {"id": "uuid2", "sort_order": 2}]}'
```

## Setup

```bash
cd projects/todo-api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your values

# Install and start service
sudo cp todo-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now todo-api
```

## Tech Stack

- Python 3 / Flask
- SQLite (WAL mode)
- JWT (PyJWT)
- bcrypt for password hashing
- Mailjet for email verification
- gunicorn for production
