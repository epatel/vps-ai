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
from flask import Flask, request, jsonify, g, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps
import io

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

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
THUMBS_DIR = os.path.join(UPLOADS_DIR, "thumbs")
os.makedirs(THUMBS_DIR, exist_ok=True)

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_IMAGES_PER_TODO = 10
MAX_IMAGE_DIMENSION = 1920
THUMB_DIMENSION = 300
JPEG_QUALITY = 85
DARK_BG_COLOR = (30, 30, 46)  # #1e1e2e - app dark mode surface color

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

        CREATE TABLE IF NOT EXISTS todo_images (
            id TEXT PRIMARY KEY,
            todo_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT DEFAULT '',
            sort_order REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_todo_images_todo ON todo_images(todo_id, sort_order);
        """
    )
    # Add reset_token columns if they don't exist (migration for existing DBs)
    try:
        conn.execute("ALTER TABLE users ADD COLUMN reset_token TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN reset_token_expires TEXT")
    except sqlite3.OperationalError:
        pass
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


def send_password_reset_email(to_email: str, token: str):
    """Send a password reset email via Mailjet."""
    if not MAILJET_API_KEY or not MAILJET_SECRET_KEY:
        app.logger.warning("Mailjet not configured – skipping reset email to %s", to_email)
        return False

    from mailjet_rest import Client

    mj = Client(auth=(MAILJET_API_KEY, MAILJET_SECRET_KEY), version="v3.1")
    reset_url = f"{BASE_URL}/auth/reset-password?token={token}"

    data = {
        "Messages": [
            {
                "From": {"Email": MAILJET_SENDER_EMAIL, "Name": "Todo App"},
                "To": [{"Email": to_email}],
                "Subject": "Reset your Todo password",
                "HTMLPart": (
                    f"<h3>Password Reset</h3>"
                    f"<p>You requested a password reset for your Todo account.</p>"
                    f"<p>Click the link below to reset your password. This link expires in 1 hour.</p>"
                    f'<p><a href="{reset_url}">Reset Password</a></p>'
                    f"<p>If you did not request this, ignore this email.</p>"
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
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        elif request.args.get("token"):
            token = request.args.get("token")
        if not token:
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
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
# Image helpers
# ---------------------------------------------------------------------------


def process_image(file_storage, max_dim=MAX_IMAGE_DIMENSION):
    """Read an uploaded file, auto-orient, resize, convert to JPEG. Returns bytes."""
    img = Image.open(file_storage)
    img = ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'LA', 'PA'):
        background = Image.new('RGB', img.size, DARK_BG_COLOR)
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    w, h = img.size
    if max(w, h) > max_dim:
        ratio = max_dim / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=JPEG_QUALITY)
    buf.seek(0)
    return buf.read()


def make_thumbnail(full_path, thumb_path):
    """Generate a thumbnail from a full-size JPEG."""
    img = Image.open(full_path)
    w, h = img.size
    ratio = THUMB_DIMENSION / max(w, h)
    img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    img.save(thumb_path, format='JPEG', quality=JPEG_QUALITY)


def attach_images(db, todos):
    """Attach images list to a list of todo dicts."""
    if not todos:
        return todos
    todo_ids = [t['id'] for t in todos]
    placeholders = ','.join('?' * len(todo_ids))
    rows = db.execute(
        f"SELECT * FROM todo_images WHERE todo_id IN ({placeholders}) ORDER BY sort_order ASC",
        todo_ids,
    ).fetchall()
    images_by_todo = {}
    for r in rows:
        images_by_todo.setdefault(r['todo_id'], []).append({
            'id': r['id'],
            'todo_id': r['todo_id'],
            'original_name': r['original_name'],
            'sort_order': r['sort_order'],
            'thumb_url': f"/images/{r['id']}/thumb",
            'full_url': f"/images/{r['id']}",
            'created_at': r['created_at'],
        })
    for t in todos:
        t['images'] = images_by_todo.get(t['id'], [])
    return todos


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


@app.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()

    if not email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return jsonify({"error": "Invalid email"}), 400

    db = get_db()
    user = db.execute("SELECT id, verified FROM users WHERE email = ?", (email,)).fetchone()

    # Always return success to avoid leaking whether email exists
    success_msg = {"message": "If an account with that email exists, a password reset link has been sent."}

    if not user or not user["verified"]:
        return jsonify(success_msg), 200

    reset_token = secrets.token_urlsafe(48)
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    db.execute(
        "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
        (reset_token, expires, user["id"]),
    )
    db.commit()

    send_password_reset_email(email, reset_token)
    return jsonify(success_msg), 200


@app.route("/auth/reset-password", methods=["GET"])
def reset_password_form():
    """Show a simple HTML form to reset password."""
    token = request.args.get("token", "")
    if not token:
        return "<h2>Invalid reset link.</h2>", 400

    db = get_db()
    user = db.execute("SELECT id, reset_token_expires FROM users WHERE reset_token = ?", (token,)).fetchone()
    if not user:
        return "<h2>Invalid or expired reset link.</h2>", 400

    expires = datetime.fromisoformat(user["reset_token_expires"])
    if datetime.now(timezone.utc) > expires:
        return "<h2>This reset link has expired. Please request a new one.</h2>", 400

    return f"""<!DOCTYPE html>
<html><head><title>Reset Password</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body {{ font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }}
.card {{ background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); max-width: 400px; width: 90%; }}
h2 {{ margin-top: 0; color: #333; }}
input {{ width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; }}
button {{ width: 100%; padding: 12px; background: #6750a4; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; margin-top: 8px; }}
button:hover {{ background: #7c68b5; }}
.error {{ color: #c62828; margin-top: 8px; display: none; }}
.success {{ color: #2e7d32; margin-top: 8px; display: none; }}
</style></head><body>
<div class="card">
<h2>Reset Password</h2>
<form id="resetForm">
<input type="password" id="password" placeholder="New password (min 8 chars)" required minlength="8">
<input type="password" id="confirmPassword" placeholder="Confirm new password" required>
<button type="submit">Reset Password</button>
<p class="error" id="error"></p>
<p class="success" id="success"></p>
</form>
</div>
<script>
document.getElementById('resetForm').addEventListener('submit', async function(e) {{
    e.preventDefault();
    const pw = document.getElementById('password').value;
    const cpw = document.getElementById('confirmPassword').value;
    const errEl = document.getElementById('error');
    const sucEl = document.getElementById('success');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';
    if (pw.length < 8) {{ errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display = 'block'; return; }}
    if (pw !== cpw) {{ errEl.textContent = 'Passwords do not match'; errEl.style.display = 'block'; return; }}
    try {{
        const res = await fetch('/todo-api/auth/reset-password', {{
            method: 'POST', headers: {{'Content-Type': 'application/json'}},
            body: JSON.stringify({{token: '{token}', password: pw}})
        }});
        const data = await res.json();
        if (res.ok) {{ sucEl.textContent = data.message || 'Password reset! You can now log in.'; sucEl.style.display = 'block'; document.getElementById('resetForm').querySelector('button').disabled = true; }}
        else {{ errEl.textContent = data.error || 'Reset failed'; errEl.style.display = 'block'; }}
    }} catch(e) {{ errEl.textContent = 'Connection error'; errEl.style.display = 'block'; }}
}});
</script></body></html>""", 200


@app.route("/auth/reset-password", methods=["POST"])
def reset_password():
    """Reset password using a valid reset token."""
    data = request.get_json(force=True)
    token = data.get("token", "")
    password = data.get("password", "")

    if not token:
        return jsonify({"error": "Missing token"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    db = get_db()
    user = db.execute("SELECT id, reset_token_expires FROM users WHERE reset_token = ?", (token,)).fetchone()
    if not user:
        return jsonify({"error": "Invalid or expired reset link"}), 400

    expires = datetime.fromisoformat(user["reset_token_expires"])
    if datetime.now(timezone.utc) > expires:
        return jsonify({"error": "Reset link has expired. Please request a new one."}), 400

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    db.execute(
        "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
        (pw_hash, user["id"]),
    )
    db.commit()

    return jsonify({"message": "Password reset successfully. You can now log in with your new password."}), 200


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
    todos = [dict(r) for r in rows]
    attach_images(db, todos)
    return jsonify(todos), 200


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
    todo_dict = dict(todo)
    attach_images(db, [todo_dict])
    return jsonify(todo_dict), 201


@app.route("/todos/<todo_id>", methods=["GET"])
@auth_required
def get_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404
    todo_dict = dict(todo)
    attach_images(db, [todo_dict])
    return jsonify(todo_dict), 200


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
    todo_dict = dict(todo)
    attach_images(db, [todo_dict])
    return jsonify(todo_dict), 200


@app.route("/todos/<todo_id>", methods=["DELETE"])
@auth_required
def delete_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    # Clean up image files before deleting the todo
    images = db.execute(
        "SELECT filename FROM todo_images WHERE todo_id = ?", (todo_id,)
    ).fetchall()
    for img in images:
        full_path = os.path.join(UPLOADS_DIR, img["filename"])
        thumb_path = os.path.join(THUMBS_DIR, img["filename"])
        for path in (full_path, thumb_path):
            try:
                os.remove(path)
            except OSError:
                pass

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
    todos = [dict(r) for r in rows]
    attach_images(db, todos)
    return jsonify(todos), 200


# ---------------------------------------------------------------------------
# Image routes
# ---------------------------------------------------------------------------


@app.route("/todos/<todo_id>/images", methods=["POST"])
@auth_required
def upload_image(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files["image"]
    if not file or not file.filename:
        return jsonify({"error": "No image file provided"}), 400

    # Check file size
    file.seek(0, 2)
    file_size = file.tell()
    file.seek(0)
    if file_size > MAX_IMAGE_SIZE:
        return jsonify({"error": f"Image exceeds {MAX_IMAGE_SIZE // (1024*1024)}MB limit"}), 400

    # Check image count
    count = db.execute(
        "SELECT COUNT(*) as cnt FROM todo_images WHERE todo_id = ?", (todo_id,)
    ).fetchone()["cnt"]
    if count >= MAX_IMAGES_PER_TODO:
        return jsonify({"error": f"Maximum {MAX_IMAGES_PER_TODO} images per todo"}), 400

    original_name = secure_filename(file.filename or "image.jpg")
    image_id = str(uuid.uuid4())
    filename = f"{image_id}.jpg"

    try:
        image_bytes = process_image(file)
    except Exception as e:
        return jsonify({"error": f"Invalid image: {str(e)}"}), 400

    full_path = os.path.join(UPLOADS_DIR, filename)
    with open(full_path, "wb") as f:
        f.write(image_bytes)

    # Determine sort_order
    row = db.execute(
        "SELECT COALESCE(MAX(sort_order), 0) as mx FROM todo_images WHERE todo_id = ?",
        (todo_id,),
    ).fetchone()
    sort_order = (row["mx"] or 0) + 1.0

    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO todo_images (id, todo_id, filename, original_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (image_id, todo_id, filename, original_name, sort_order, now),
    )
    db.commit()

    return jsonify({
        "id": image_id,
        "todo_id": todo_id,
        "original_name": original_name,
        "sort_order": sort_order,
        "thumb_url": f"/images/{image_id}/thumb",
        "full_url": f"/images/{image_id}",
        "created_at": now,
    }), 201


@app.route("/images/<image_id>", methods=["GET"])
@auth_required
def serve_image(image_id):
    db = get_db()
    row = db.execute(
        """SELECT ti.filename FROM todo_images ti
           JOIN todos t ON t.id = ti.todo_id
           WHERE ti.id = ? AND t.user_id = ?""",
        (image_id, g.user_id),
    ).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404

    full_path = os.path.join(UPLOADS_DIR, row["filename"])
    if not os.path.exists(full_path):
        return jsonify({"error": "File not found"}), 404

    return send_file(full_path, mimetype="image/jpeg")


@app.route("/images/<image_id>/thumb", methods=["GET"])
@auth_required
def serve_thumbnail(image_id):
    db = get_db()
    row = db.execute(
        """SELECT ti.filename FROM todo_images ti
           JOIN todos t ON t.id = ti.todo_id
           WHERE ti.id = ? AND t.user_id = ?""",
        (image_id, g.user_id),
    ).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404

    full_path = os.path.join(UPLOADS_DIR, row["filename"])
    thumb_path = os.path.join(THUMBS_DIR, row["filename"])

    if not os.path.exists(full_path):
        return jsonify({"error": "File not found"}), 404

    if not os.path.exists(thumb_path):
        make_thumbnail(full_path, thumb_path)

    return send_file(thumb_path, mimetype="image/jpeg")


@app.route("/images/<image_id>", methods=["DELETE"])
@auth_required
def delete_image(image_id):
    db = get_db()
    row = db.execute(
        """SELECT ti.id, ti.filename FROM todo_images ti
           JOIN todos t ON t.id = ti.todo_id
           WHERE ti.id = ? AND t.user_id = ?""",
        (image_id, g.user_id),
    ).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404

    full_path = os.path.join(UPLOADS_DIR, row["filename"])
    thumb_path = os.path.join(THUMBS_DIR, row["filename"])
    for path in (full_path, thumb_path):
        try:
            os.remove(path)
        except OSError:
            pass

    db.execute("DELETE FROM todo_images WHERE id = ?", (image_id,))
    db.commit()
    return jsonify({"message": "Deleted"}), 200


@app.route("/todos/<todo_id>/images/reorder", methods=["POST"])
@auth_required
def reorder_images(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(force=True)
    items = data.get("items")
    if not items or not isinstance(items, list):
        return jsonify({"error": "Expected 'items' array of {id, sort_order}"}), 400

    for item in items:
        iid = item.get("id")
        order = item.get("sort_order")
        if iid is None or order is None:
            continue
        db.execute(
            "UPDATE todo_images SET sort_order = ? WHERE id = ? AND todo_id = ?",
            (order, iid, todo_id),
        )
    db.commit()
    return jsonify({"message": "Reordered"}), 200


# ---------------------------------------------------------------------------
# Web Share Target (unauthenticated – stores image temporarily)
# ---------------------------------------------------------------------------

PENDING_DIR = os.path.join(BASE_DIR, "pending_shares")
os.makedirs(PENDING_DIR, exist_ok=True)
PENDING_EXPIRY_SECONDS = 300  # 5 minutes

def cleanup_pending():
    """Remove expired pending share files."""
    now = time.time()
    try:
        for fname in os.listdir(PENDING_DIR):
            fpath = os.path.join(PENDING_DIR, fname)
            if os.path.isfile(fpath) and now - os.path.getmtime(fpath) > PENDING_EXPIRY_SECONDS:
                os.remove(fpath)
    except OSError:
        pass


@app.route("/share", methods=["POST"])
def share_target():
    """Receive a Web Share Target POST, store images temporarily, redirect to the app."""
    cleanup_pending()

    title = request.form.get("title", "")
    text = request.form.get("text", "")
    url = request.form.get("url", "")

    pending_ids = []
    files = request.files.getlist("images")
    for file in files:
        if file and file.filename:
            try:
                image_bytes = process_image(file)
                pending_id = str(uuid.uuid4())
                pending_path = os.path.join(PENDING_DIR, f"{pending_id}.jpg")
                with open(pending_path, "wb") as f:
                    f.write(image_bytes)
                pending_ids.append(pending_id)
            except Exception:
                pass

    params = []
    if title:
        params.append(f"title={title}")
    if text:
        params.append(f"text={text}")
    if url:
        params.append(f"url={url}")
    if pending_ids:
        params.append(f"pending_images={','.join(pending_ids)}")

    redirect_url = "/todo-app/"
    if params:
        redirect_url += "?" + "&".join(params)

    return "", 303, {"Location": redirect_url}


@app.route("/pending-image/<pending_id>", methods=["POST"])
@auth_required
def claim_pending_image(pending_id):
    """Claim a pending shared image: attach it to a todo."""
    pending_path = os.path.join(PENDING_DIR, f"{pending_id}.jpg")
    if not os.path.exists(pending_path):
        return jsonify({"error": "Pending image not found or expired"}), 404

    data = request.get_json(force=True)
    todo_id = data.get("todo_id")
    if not todo_id:
        return jsonify({"error": "todo_id is required"}), 400

    db = get_db()
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Todo not found"}), 404

    image_id = str(uuid.uuid4())
    filename = f"{image_id}.jpg"
    full_path = os.path.join(UPLOADS_DIR, filename)
    os.rename(pending_path, full_path)

    row = db.execute(
        "SELECT COALESCE(MAX(sort_order), 0) as mx FROM todo_images WHERE todo_id = ?",
        (todo_id,),
    ).fetchone()
    sort_order = (row["mx"] or 0) + 1.0

    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO todo_images (id, todo_id, filename, original_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (image_id, todo_id, filename, "shared_image.jpg", sort_order, now),
    )
    db.commit()

    return jsonify({
        "id": image_id,
        "todo_id": todo_id,
        "original_name": "shared_image.jpg",
        "sort_order": sort_order,
        "thumb_url": f"/images/{image_id}/thumb",
        "full_url": f"/images/{image_id}",
        "created_at": now,
    }), 201


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
