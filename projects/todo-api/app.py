#!/usr/bin/env python3
"""Todo API with SQLite persistence and JWT auth."""

import os
import re
import time
import uuid
import sqlite3
import secrets
import hashlib
from functools import wraps
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("TODO_DB_PATH", os.path.join(BASE_DIR, "todo.db"))
JWT_SECRET = os.environ.get("TODO_JWT_SECRET", secrets.token_hex(32))
JWT_EXPIRY_HOURS = int(os.environ.get("TODO_JWT_EXPIRY_HOURS", "24"))
BASE_URL = os.environ.get("TODO_BASE_URL", "https://ai.memention.net/todo-api")

MAILJET_API_KEY = os.environ.get("MJ_APIKEY_PUBLIC", "")
MAILJET_SECRET_KEY = os.environ.get("MJ_APIKEY_PRIVATE", "")
MAILJET_SENDER_EMAIL = os.environ.get("MJ_SENDER_EMAIL", "noreply@memention.net")

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create tables if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            verified INTEGER DEFAULT 0,
            verify_token TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            done INTEGER DEFAULT 0,
            sort_order REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_verify ON users(verify_token);
        """
    )
    conn.close()


# ---------------------------------------------------------------------------
# Email helper (Mailjet)
# ---------------------------------------------------------------------------


def send_verification_email(to_email: str, token: str):
    """Send a verification email via Mailjet."""
    if not MAILJET_API_KEY or not MAILJET_SECRET_KEY:
        app.logger.warning("Mailjet not configured – skipping email to %s", to_email)
        return False

    from mailjet_rest import Client

    mj = Client(auth=(MAILJET_API_KEY, MAILJET_SECRET_KEY), version="v3.1")
    verify_url = f"{BASE_URL}/auth/verify?token={token}"

    data = {
        "Messages": [
            {
                "From": {"Email": MAILJET_SENDER_EMAIL, "Name": "Todo App"},
                "To": [{"Email": to_email}],
                "Subject": "Verify your Todo account",
                "HTMLPart": (
                    f"<h3>Welcome to Todo!</h3>"
                    f"<p>Click the link below to verify your account:</p>"
                    f'<p><a href="{verify_url}">{verify_url}</a></p>'
                    f"<p>If you did not sign up, ignore this email.</p>"
                ),
            }
        ]
    }

    result = mj.send.create(data=data)
    ok = result.status_code == 200
    if not ok:
        app.logger.error("Mailjet error: %s %s", result.status_code, result.json())
    return ok


# ---------------------------------------------------------------------------
# Auth decorator
# ---------------------------------------------------------------------------


def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        g.user_id = payload["sub"]
        return f(*args, **kwargs)

    return decorated


def make_token(user_id: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        },
        JWT_SECRET,
        algorithm="HS256",
    )


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------


@app.route("/auth/signup", methods=["POST"])
def signup():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Invalid email"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    db = get_db()
    existing = db.execute("SELECT id, verified FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        if existing["verified"]:
            return jsonify({"error": "Email already registered"}), 409
        # Re-send verification for unverified user
        verify_token = secrets.token_urlsafe(48)
        pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        db.execute(
            "UPDATE users SET password_hash = ?, verify_token = ? WHERE id = ?",
            (pw_hash, verify_token, existing["id"]),
        )
        db.commit()
        send_verification_email(email, verify_token)
        return jsonify({"message": "Verification email re-sent. Check your inbox."}), 200

    user_id = str(uuid.uuid4())
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    verify_token = secrets.token_urlsafe(48)

    db.execute(
        "INSERT INTO users (id, email, password_hash, verify_token) VALUES (?, ?, ?, ?)",
        (user_id, email, pw_hash, verify_token),
    )
    db.commit()

    send_verification_email(email, verify_token)
    return jsonify({"message": "Signup successful. Check your email to verify your account."}), 201


@app.route("/auth/verify", methods=["GET"])
def verify_email():
    token = request.args.get("token", "")
    if not token:
        return jsonify({"error": "Missing token"}), 400

    db = get_db()
    user = db.execute("SELECT id FROM users WHERE verify_token = ?", (token,)).fetchone()
    if not user:
        return "<h2>Invalid or expired verification link.</h2>", 400

    db.execute("UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?", (user["id"],))
    db.commit()
    return "<h2>Email verified! You can now log in.</h2>", 200


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user["verified"]:
        return jsonify({"error": "Email not verified. Check your inbox."}), 403

    token = make_token(user["id"])
    return jsonify({"token": token, "user_id": user["id"], "email": user["email"]}), 200


@app.route("/auth/me", methods=["GET"])
@auth_required
def me():
    db = get_db()
    user = db.execute("SELECT id, email, created_at FROM users WHERE id = ?", (g.user_id,)).fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(dict(user)), 200


# ---------------------------------------------------------------------------
# Todo routes
# ---------------------------------------------------------------------------


@app.route("/todos", methods=["GET"])
@auth_required
def list_todos():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM todos WHERE user_id = ? ORDER BY sort_order ASC",
        (g.user_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows]), 200


@app.route("/todos", methods=["POST"])
@auth_required
def create_todo():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    description = data.get("description", "")

    if not title:
        return jsonify({"error": "Title is required"}), 400

    db = get_db()
    # Place at end: get max sort_order
    row = db.execute(
        "SELECT COALESCE(MAX(sort_order), 0) as mx FROM todos WHERE user_id = ?",
        (g.user_id,),
    ).fetchone()
    sort_order = (row["mx"] or 0) + 1.0

    todo_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO todos (id, user_id, title, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (todo_id, g.user_id, title, description, sort_order, now, now),
    )
    db.commit()

    todo = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    return jsonify(dict(todo)), 201


@app.route("/todos/<todo_id>", methods=["GET"])
@auth_required
def get_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(todo)), 200


@app.route("/todos/<todo_id>", methods=["PUT"])
@auth_required
def update_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    title = data.get("title", todo["title"])
    description = data.get("description", todo["description"])
    done = data.get("done", todo["done"])
    sort_order = data.get("sort_order", todo["sort_order"])
    now = datetime.now(timezone.utc).isoformat()

    db.execute(
        "UPDATE todos SET title=?, description=?, done=?, sort_order=?, updated_at=? WHERE id=?",
        (title, description, int(bool(done)), sort_order, now, todo_id),
    )
    db.commit()

    todo = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    return jsonify(dict(todo)), 200


@app.route("/todos/<todo_id>", methods=["DELETE"])
@auth_required
def delete_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    db.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    db.commit()
    return jsonify({"message": "Deleted"}), 200


@app.route("/todos/reorder", methods=["POST"])
@auth_required
def reorder_todos():
    """Accept a list of {id, sort_order} to bulk-reorder todos."""
    data = request.get_json(force=True)
    items = data.get("items")
    if not items or not isinstance(items, list):
        return jsonify({"error": "Expected 'items' array of {id, sort_order}"}), 400

    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    for item in items:
        tid = item.get("id")
        order = item.get("sort_order")
        if tid is None or order is None:
            continue
        db.execute(
            "UPDATE todos SET sort_order=?, updated_at=? WHERE id=? AND user_id=?",
            (order, now, tid, g.user_id),
        )
    db.commit()

    rows = db.execute(
        "SELECT * FROM todos WHERE user_id = ? ORDER BY sort_order ASC",
        (g.user_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows]), 200


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5003))
    app.run(host="127.0.0.1", port=port, debug=True)
