# Image Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image attachment support (up to 10 per todo) with file picker, clipboard paste, and PWA share sheet input — stored server-side with Pillow processing.

**Architecture:** New `todo_images` SQLite table + file storage on the Flask backend. New REST endpoints for upload/serve/delete. Flutter frontend gets a `TodoImage` model, image API methods, attachment UI in dialogs, thumbnail grid in todo tiles, and a full-screen image viewer. The existing PWA share target is upgraded from GET (text-only) to POST (multipart, supporting files).

**Tech Stack:** Flask + Pillow (backend), Flutter web + `file_picker` + `package:web` (frontend)

---

## File Structure

### Backend (`projects/todo-api/`)

| File | Action | Responsibility |
|---|---|---|
| `app.py` | Modify | Add `todo_images` table to `init_db()`, add image endpoints, add file cleanup on todo delete |
| `requirements.txt` | Modify | Add `Pillow` |

### Frontend (`projects/todo-app/`)

| File | Action | Responsibility |
|---|---|---|
| `lib/models/todo_image.dart` | Create | `TodoImage` data class with JSON parsing |
| `lib/models/todo.dart` | Modify | Add `List<TodoImage> images` field |
| `lib/services/api_service.dart` | Modify | Add `uploadImage`, `deleteImage`, `reorderImages` methods |
| `lib/widgets/image_attachment_section.dart` | Create | Attachment UI for add/edit dialogs (thumbnails, add button, paste zone) |
| `lib/widgets/image_viewer_screen.dart` | Create | Full-screen swipe image viewer |
| `lib/widgets/add_todo_dialog.dart` | Modify | Integrate attachment section, handle paste events |
| `lib/widgets/edit_todo_dialog.dart` | Modify | Integrate attachment section, handle paste events, load existing images |
| `lib/widgets/todo_tile.dart` | Modify | Show image count badge (collapsed) + thumbnail grid (expanded) |
| `lib/providers/todo_provider.dart` | Modify | Add `uploadImage`, `deleteImage` methods |
| `lib/services/share_handler.dart` | Modify | Support reading shared images from IndexedDB |
| `lib/screens/todo_list_screen.dart` | Modify | Pass shared images to add dialog |
| `web/sw.js` | Modify | Intercept POST share target, store files in IndexedDB |
| `web/manifest.json` | Modify | Change share_target to POST multipart with file support |
| `pubspec.yaml` | Modify | Add `file_picker` dependency |

---

## Task 1: Backend — Database Schema & Image Upload Endpoint

**Files:**
- Modify: `projects/todo-api/requirements.txt`
- Modify: `projects/todo-api/app.py:57-97` (init_db)
- Modify: `projects/todo-api/app.py` (new endpoints after todo routes)

- [ ] **Step 1: Add Pillow to requirements.txt**

In `projects/todo-api/requirements.txt`, add:

```
Pillow==11.2.1
```

- [ ] **Step 2: Add `todo_images` table to `init_db()`**

In `projects/todo-api/app.py`, inside the `init_db()` function's `executescript` call, after the `CREATE INDEX` statements for todos, add:

```sql
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
```

- [ ] **Step 3: Add imports and uploads directory setup**

At the top of `projects/todo-api/app.py`, add to existing imports:

```python
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps
import io
```

After the `app = Flask(__name__)` / `CORS(app)` lines, add:

```python
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
THUMBS_DIR = os.path.join(UPLOADS_DIR, "thumbs")
os.makedirs(THUMBS_DIR, exist_ok=True)

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_IMAGES_PER_TODO = 10
MAX_IMAGE_DIMENSION = 1920
THUMB_DIMENSION = 300
JPEG_QUALITY = 85
DARK_BG_COLOR = (30, 30, 46)  # #1e1e2e - app dark mode surface color
```

- [ ] **Step 4: Add image processing helper**

After the `auth_required` decorator section in `app.py`, add:

```python
def process_image(file_storage, max_dim=MAX_IMAGE_DIMENSION):
    """Read an uploaded file, auto-orient, resize, convert to JPEG. Returns bytes."""
    img = Image.open(file_storage)
    img = ImageOps.exif_transpose(img)
    # Composite transparency onto dark background
    if img.mode in ('RGBA', 'LA', 'PA'):
        background = Image.new('RGB', img.size, DARK_BG_COLOR)
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    # Downscale if needed
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
```

- [ ] **Step 5: Add helper to attach images list to todo dicts**

After `make_thumbnail`, add:

```python
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
```

- [ ] **Step 6: Modify `list_todos` and `get_todo` to include images**

Replace the `list_todos` return:

```python
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
```

Replace the `get_todo` return:

```python
@app.route("/todos/<todo_id>", methods=["GET"])
@auth_required
def get_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404
    todo = dict(todo)
    attach_images(db, [todo])
    return jsonify(todo), 200
```

Also update `create_todo` and `update_todo` to include images in their responses — add `attach_images(db, [todo_dict])` before returning. In `create_todo`, change the last two lines:

```python
    todo = dict(db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone())
    attach_images(db, [todo])
    return jsonify(todo), 201
```

In `update_todo`, change the last two lines:

```python
    todo = dict(db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone())
    attach_images(db, [todo])
    return jsonify(todo), 200
```

Also update `reorder_todos` return:

```python
    rows = db.execute(
        "SELECT * FROM todos WHERE user_id = ? ORDER BY sort_order ASC",
        (g.user_id,),
    ).fetchall()
    todos = [dict(r) for r in rows]
    attach_images(db, todos)
    return jsonify(todos), 200
```

- [ ] **Step 7: Add upload image endpoint**

After the `reorder_todos` route, add:

```python
@app.route("/todos/<todo_id>/images", methods=["POST"])
@auth_required
def upload_image(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    # Check file size
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_IMAGE_SIZE:
        return jsonify({"error": "Image too large (max 10MB)"}), 400

    # Check image count
    count = db.execute(
        "SELECT COUNT(*) as cnt FROM todo_images WHERE todo_id = ?", (todo_id,)
    ).fetchone()['cnt']
    if count >= MAX_IMAGES_PER_TODO:
        return jsonify({"error": f"Maximum {MAX_IMAGES_PER_TODO} images per todo"}), 400

    # Process image
    try:
        jpeg_data = process_image(file)
    except Exception:
        return jsonify({"error": "Invalid image file"}), 400

    image_id = str(uuid.uuid4())
    filename = f"{image_id}.jpg"
    filepath = os.path.join(UPLOADS_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(jpeg_data)

    # Get next sort_order
    row = db.execute(
        "SELECT COALESCE(MAX(sort_order), 0) as mx FROM todo_images WHERE todo_id = ?",
        (todo_id,),
    ).fetchone()
    sort_order = (row['mx'] or 0) + 1.0

    original_name = secure_filename(file.filename) or 'image.jpg'
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "INSERT INTO todo_images (id, todo_id, filename, original_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (image_id, todo_id, filename, original_name, sort_order, now),
    )
    db.commit()

    return jsonify({
        'id': image_id,
        'todo_id': todo_id,
        'original_name': original_name,
        'sort_order': sort_order,
        'thumb_url': f"/images/{image_id}/thumb",
        'full_url': f"/images/{image_id}",
        'created_at': now,
    }), 201
```

- [ ] **Step 8: Add serve image and thumbnail endpoints**

```python
@app.route("/images/<image_id>", methods=["GET"])
@auth_required
def serve_image(image_id):
    db = get_db()
    img = db.execute("SELECT * FROM todo_images WHERE id = ?", (image_id,)).fetchone()
    if not img:
        return jsonify({"error": "Not found"}), 404
    # Verify ownership
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (img['todo_id'], g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    filepath = os.path.join(UPLOADS_DIR, img['filename'])
    if not os.path.exists(filepath):
        return jsonify({"error": "File not found"}), 404
    from flask import send_file
    return send_file(filepath, mimetype='image/jpeg')


@app.route("/images/<image_id>/thumb", methods=["GET"])
@auth_required
def serve_thumbnail(image_id):
    db = get_db()
    img = db.execute("SELECT * FROM todo_images WHERE id = ?", (image_id,)).fetchone()
    if not img:
        return jsonify({"error": "Not found"}), 404
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (img['todo_id'], g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    thumb_path = os.path.join(THUMBS_DIR, img['filename'])
    if not os.path.exists(thumb_path):
        full_path = os.path.join(UPLOADS_DIR, img['filename'])
        if not os.path.exists(full_path):
            return jsonify({"error": "File not found"}), 404
        make_thumbnail(full_path, thumb_path)

    from flask import send_file
    return send_file(thumb_path, mimetype='image/jpeg')
```

- [ ] **Step 9: Add delete image endpoint**

```python
@app.route("/images/<image_id>", methods=["DELETE"])
@auth_required
def delete_image(image_id):
    db = get_db()
    img = db.execute("SELECT * FROM todo_images WHERE id = ?", (image_id,)).fetchone()
    if not img:
        return jsonify({"error": "Not found"}), 404
    todo = db.execute(
        "SELECT id FROM todos WHERE id = ? AND user_id = ?", (img['todo_id'], g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    # Delete files
    filepath = os.path.join(UPLOADS_DIR, img['filename'])
    thumb_path = os.path.join(THUMBS_DIR, img['filename'])
    if os.path.exists(filepath):
        os.remove(filepath)
    if os.path.exists(thumb_path):
        os.remove(thumb_path)

    db.execute("DELETE FROM todo_images WHERE id = ?", (image_id,))
    db.commit()
    return jsonify({"message": "Deleted"}), 200
```

- [ ] **Step 10: Add image reorder endpoint**

```python
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
```

- [ ] **Step 11: Add file cleanup when deleting a todo**

Modify the `delete_todo` function to clean up image files before deleting:

```python
@app.route("/todos/<todo_id>", methods=["DELETE"])
@auth_required
def delete_todo(todo_id):
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()
    if not todo:
        return jsonify({"error": "Not found"}), 404

    # Clean up image files before cascade delete removes DB rows
    images = db.execute(
        "SELECT filename FROM todo_images WHERE todo_id = ?", (todo_id,)
    ).fetchall()
    for img in images:
        filepath = os.path.join(UPLOADS_DIR, img['filename'])
        thumb_path = os.path.join(THUMBS_DIR, img['filename'])
        if os.path.exists(filepath):
            os.remove(filepath)
        if os.path.exists(thumb_path):
            os.remove(thumb_path)

    db.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    db.commit()
    return jsonify({"message": "Deleted"}), 200
```

- [ ] **Step 12: Commit backend changes**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-api/requirements.txt projects/todo-api/app.py
git commit -m "feat: add image attachment endpoints to todo API"
```

---

## Task 2: Frontend — TodoImage Model & API Service

**Files:**
- Create: `projects/todo-app/lib/models/todo_image.dart`
- Modify: `projects/todo-app/lib/models/todo.dart`
- Modify: `projects/todo-app/lib/services/api_service.dart`
- Modify: `projects/todo-app/pubspec.yaml`

- [ ] **Step 1: Add `file_picker` dependency**

In `projects/todo-app/pubspec.yaml`, add under `dependencies`:

```yaml
  file_picker: ^8.0.0
```

Run `flutter pub get`.

- [ ] **Step 2: Create `TodoImage` model**

Create `projects/todo-app/lib/models/todo_image.dart`:

```dart
class TodoImage {
  final String id;
  final String todoId;
  final String originalName;
  final double sortOrder;
  final String thumbUrl;
  final String fullUrl;
  final String createdAt;

  TodoImage({
    required this.id,
    required this.todoId,
    required this.originalName,
    required this.sortOrder,
    required this.thumbUrl,
    required this.fullUrl,
    required this.createdAt,
  });

  factory TodoImage.fromJson(Map<String, dynamic> json) {
    return TodoImage(
      id: json['id'] as String,
      todoId: json['todo_id'] as String,
      originalName: (json['original_name'] as String?) ?? '',
      sortOrder: (json['sort_order'] as num).toDouble(),
      thumbUrl: json['thumb_url'] as String,
      fullUrl: json['full_url'] as String,
      createdAt: json['created_at'] as String,
    );
  }
}
```

- [ ] **Step 3: Add images to Todo model**

In `projects/todo-app/lib/models/todo.dart`, add import at top:

```dart
import 'todo_image.dart';
```

Add field to the class:

```dart
  List<TodoImage> images;
```

Add to constructor (with default):

```dart
  this.images = const [],
```

Add to `fromJson`:

```dart
  images: ((json['images'] as List<dynamic>?) ?? [])
      .map((e) => TodoImage.fromJson(e as Map<String, dynamic>))
      .toList(),
```

The `toJson()` method does NOT need to include images (they're managed via separate endpoints).

- [ ] **Step 4: Add image API methods to `ApiService`**

In `projects/todo-app/lib/services/api_service.dart`, add import:

```dart
import 'dart:typed_data';
import '../models/todo_image.dart';
```

Add these methods to the `ApiService` class:

```dart
  Map<String, String> get _authHeaders {
    final headers = <String, String>{};
    if (_token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  Future<TodoImage> uploadImage(String todoId, Uint8List bytes, String filename) async {
    final uri = Uri.parse('$baseUrl/todos/$todoId/images');
    final req = http.MultipartRequest('POST', uri)
      ..headers.addAll(_authHeaders)
      ..files.add(http.MultipartFile.fromBytes('image', bytes, filename: filename));
    final streamed = await req.send();
    final response = await http.Response.fromStream(streamed);
    final data = await _handleResponse(response);
    return TodoImage.fromJson(data);
  }

  Future<void> deleteImage(String imageId) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/images/$imageId'),
      headers: _headers,
    );
    if (response.statusCode >= 300) {
      String message = 'Delete failed';
      try {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        message = body['error'] as String? ?? message;
      } catch (_) {}
      throw ApiException(message, response.statusCode);
    }
  }

  Future<void> reorderImages(String todoId, List<Map<String, dynamic>> items) async {
    final response = await http.post(
      Uri.parse('$baseUrl/todos/$todoId/images/reorder'),
      headers: _headers,
      body: jsonEncode({'items': items}),
    );
    if (response.statusCode >= 300) {
      String message = 'Reorder failed';
      try {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        message = body['error'] as String? ?? message;
      } catch (_) {}
      throw ApiException(message, response.statusCode);
    }
  }
```

- [ ] **Step 5: Add image methods to TodoProvider**

In `projects/todo-app/lib/providers/todo_provider.dart`, add import:

```dart
import 'dart:typed_data';
```

Add these methods to `TodoProvider`:

```dart
  Future<bool> uploadImage(String todoId, Uint8List bytes, String filename) async {
    try {
      final image = await _api.uploadImage(todoId, bytes, filename);
      final index = _todos.indexWhere((t) => t.id == todoId);
      if (index != -1) {
        _todos[index].images = [..._todos[index].images, image];
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = 'Failed to upload image';
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteImage(String todoId, String imageId) async {
    try {
      await _api.deleteImage(imageId);
      final index = _todos.indexWhere((t) => t.id == todoId);
      if (index != -1) {
        _todos[index].images = _todos[index].images.where((i) => i.id != imageId).toList();
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = 'Failed to delete image';
      notifyListeners();
      return false;
    }
  }
```

- [ ] **Step 6: Commit frontend model + API changes**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-app/pubspec.yaml projects/todo-app/lib/models/todo_image.dart \
  projects/todo-app/lib/models/todo.dart projects/todo-app/lib/services/api_service.dart \
  projects/todo-app/lib/providers/todo_provider.dart
git commit -m "feat: add TodoImage model, API service methods, and provider support"
```

---

## Task 3: Frontend — Image Attachment Section Widget

**Files:**
- Create: `projects/todo-app/lib/widgets/image_attachment_section.dart`

- [ ] **Step 1: Create the image attachment section widget**

Create `projects/todo-app/lib/widgets/image_attachment_section.dart`:

```dart
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../models/todo_image.dart';
import '../services/api_service.dart';

/// Represents a pending image not yet uploaded.
class PendingImage {
  final Uint8List bytes;
  final String filename;

  PendingImage({required this.bytes, required this.filename});
}

/// Attachment section for add/edit dialogs.
/// Shows existing image thumbnails (with delete), pending images, and an add button.
class ImageAttachmentSection extends StatelessWidget {
  final List<TodoImage> existingImages;
  final List<PendingImage> pendingImages;
  final ValueChanged<PendingImage> onAddPending;
  final ValueChanged<int> onRemovePending;
  final ValueChanged<String>? onDeleteExisting;
  final int maxImages;

  const ImageAttachmentSection({
    super.key,
    this.existingImages = const [],
    required this.pendingImages,
    required this.onAddPending,
    required this.onRemovePending,
    this.onDeleteExisting,
    this.maxImages = 10,
  });

  int get _totalCount => existingImages.length + pendingImages.length;
  bool get _canAdd => _totalCount < maxImages;

  Future<void> _pickImage() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      if (file.bytes != null) {
        onAddPending(PendingImage(
          bytes: file.bytes!,
          filename: file.name,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_totalCount == 0 && !_canAdd) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 12),
        Row(
          children: [
            Icon(Icons.image_outlined, size: 16,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(
              'Images ($_totalCount/$maxImages)',
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            // Existing images (uploaded)
            for (int i = 0; i < existingImages.length; i++)
              _ExistingThumb(
                image: existingImages[i],
                onDelete: onDeleteExisting != null
                    ? () => onDeleteExisting!(existingImages[i].id)
                    : null,
              ),
            // Pending images (not yet uploaded)
            for (int i = 0; i < pendingImages.length; i++)
              _PendingThumb(
                pending: pendingImages[i],
                onRemove: () => onRemovePending(i),
              ),
            // Add button
            if (_canAdd)
              _AddButton(onTap: _pickImage),
          ],
        ),
      ],
    );
  }
}

class _ExistingThumb extends StatelessWidget {
  final TodoImage image;
  final VoidCallback? onDelete;

  const _ExistingThumb({required this.image, this.onDelete});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              '${ApiService.baseUrl}${image.thumbUrl}',
              width: 72,
              height: 72,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 72,
                height: 72,
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: const Icon(Icons.broken_image, size: 24),
              ),
            ),
          ),
          if (onDelete != null)
            Positioned(
              top: -6,
              right: -6,
              child: GestureDetector(
                onTap: onDelete,
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.error,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.close, size: 14,
                      color: Theme.of(context).colorScheme.onError),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PendingThumb extends StatelessWidget {
  final PendingImage pending;
  final VoidCallback onRemove;

  const _PendingThumb({required this.pending, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(
              pending.bytes,
              width: 72,
              height: 72,
              fit: BoxFit.cover,
            ),
          ),
          Positioned(
            top: -6,
            right: -6,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.error,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.close, size: 14,
                    color: Theme.of(context).colorScheme.onError),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  final VoidCallback onTap;

  const _AddButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: Theme.of(context).colorScheme.outline,
            width: 1.5,
            strokeAlign: BorderSide.strokeAlignInside,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add, size: 24,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            Text('Add', style: TextStyle(fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-app/lib/widgets/image_attachment_section.dart
git commit -m "feat: add image attachment section widget for dialogs"
```

---

## Task 4: Frontend — Integrate Attachments into Add/Edit Dialogs

**Files:**
- Modify: `projects/todo-app/lib/widgets/add_todo_dialog.dart`
- Modify: `projects/todo-app/lib/widgets/edit_todo_dialog.dart`
- Modify: `projects/todo-app/lib/screens/todo_list_screen.dart`
- Modify: `projects/todo-app/lib/providers/todo_provider.dart`

- [ ] **Step 1: Update AddTodoDialog to include attachments and paste support**

In `projects/todo-app/lib/widgets/add_todo_dialog.dart`, add imports:

```dart
import 'dart:typed_data';
import 'package:web/web.dart' as web;
import 'dart:js_interop';
import 'image_attachment_section.dart';
```

Add a `_pendingImages` list to the state:

```dart
  final List<PendingImage> _pendingImages = [];
```

Add a paste handler method:

```dart
  void _handlePaste(web.ClipboardEvent event) {
    final items = event.clipboardData?.items;
    if (items == null) return;
    for (int i = 0; i < items.length; i++) {
      final item = items.item(i);
      if (item != null && item.type.toDart.startsWith('image/')) {
        event.preventDefault();
        final blob = item.getAsFile();
        if (blob == null) continue;
        final reader = web.FileReader();
        reader.onload = (web.Event e) {
          final result = reader.result;
          if (result != null) {
            final bytes = (result as JSArrayBuffer).toDart.asUint8List();
            setState(() {
              _pendingImages.add(PendingImage(
                bytes: bytes,
                filename: 'pasted-image.png',
              ));
            });
          }
        }.toJS;
        reader.readAsArrayBuffer(blob);
        return;
      }
    }
  }
```

Register/unregister the paste listener in `initState`/`dispose` using a `web.EventListener` on `web.document`:

```dart
  late final JSFunction _pasteListener;

  @override
  void initState() {
    super.initState();
    // ... existing code ...
    _pasteListener = _handlePaste.toJS;
    web.document.addEventListener('paste', _pasteListener);
  }

  @override
  void dispose() {
    web.document.removeEventListener('paste', _pasteListener);
    // ... existing dispose code ...
    super.dispose();
  }
```

Update the return type from `Map<String, String>` to `Map<String, dynamic>` and include pending images:

```dart
  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, {
      'title': _titleController.text.trim(),
      'description': _descriptionController.text.trim(),
      'pendingImages': _pendingImages,
    });
  }
```

Add the `ImageAttachmentSection` widget after the description TextFormField, inside the Column:

```dart
            ImageAttachmentSection(
              pendingImages: _pendingImages,
              onAddPending: (p) => setState(() => _pendingImages.add(p)),
              onRemovePending: (i) => setState(() => _pendingImages.removeAt(i)),
            ),
```

Add paste hint to the description decoration:

```dart
                helperText: 'Paste images with Ctrl+V',
                helperStyle: TextStyle(
                  fontStyle: FontStyle.italic,
                  color: Theme.of(context).colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
                ),
```

- [ ] **Step 2: Update TodoListScreen to handle pending image uploads after creating a todo**

In `projects/todo-app/lib/screens/todo_list_screen.dart`, update `_addTodo`:

```dart
  Future<void> _addTodo({String? initialTitle, String? initialDescription, List<PendingImage>? initialImages}) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddTodoDialog(
        initialTitle: initialTitle,
        initialDescription: initialDescription,
      ),
    );
    if (result != null && mounted) {
      final provider = context.read<TodoProvider>();
      final todo = await provider.addTodoAndReturn(
        result['title'] as String,
        description: (result['description'] as String?) ?? '',
      );
      if (todo != null) {
        final pending = result['pendingImages'] as List<PendingImage>? ?? [];
        for (final img in pending) {
          await provider.uploadImage(todo.id, img.bytes, img.filename);
        }
      }
    }
  }
```

Add the import:

```dart
import '../widgets/image_attachment_section.dart';
```

- [ ] **Step 3: Add `addTodoAndReturn` to TodoProvider**

In `projects/todo-app/lib/providers/todo_provider.dart`:

```dart
  Future<Todo?> addTodoAndReturn(String title, {String description = ''}) async {
    try {
      final todo = await _api.createTodo(title, description: description);
      _todos.add(todo);
      notifyListeners();
      return todo;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _error = 'Failed to create todo';
      notifyListeners();
      return null;
    }
  }
```

- [ ] **Step 4: Update EditTodoDialog to include attachments**

In `projects/todo-app/lib/widgets/edit_todo_dialog.dart`, add imports:

```dart
import 'dart:typed_data';
import 'package:web/web.dart' as web;
import 'dart:js_interop';
import 'image_attachment_section.dart';
import '../models/todo_image.dart';
```

Add state for pending images and deleted image IDs:

```dart
  final List<PendingImage> _pendingImages = [];
  late List<TodoImage> _existingImages;
  final List<String> _deletedImageIds = [];
```

Initialize in `initState`:

```dart
    _existingImages = List.of(widget.todo.images);
```

Add paste handler (same as AddTodoDialog — copy the `_handlePaste`, `_pasteListener`, and the `initState`/`dispose` registration).

Update `_submit` to include image changes:

```dart
  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, {
      'action': 'save',
      'title': _titleController.text.trim(),
      'description': _descriptionController.text.trim(),
      'pendingImages': _pendingImages,
      'deletedImageIds': _deletedImageIds,
    });
  }
```

Add the `ImageAttachmentSection` widget after the description field in the Column:

```dart
            ImageAttachmentSection(
              existingImages: _existingImages,
              pendingImages: _pendingImages,
              onAddPending: (p) => setState(() => _pendingImages.add(p)),
              onRemovePending: (i) => setState(() => _pendingImages.removeAt(i)),
              onDeleteExisting: (id) => setState(() {
                _existingImages.removeWhere((img) => img.id == id);
                _deletedImageIds.add(id);
              }),
            ),
```

Add paste hint to description decoration (same as AddTodoDialog).

- [ ] **Step 5: Update TodoListScreen `_editTodo` to handle image changes**

In `projects/todo-app/lib/screens/todo_list_screen.dart`, update `_editTodo`:

```dart
  Future<void> _editTodo(Todo todo) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => EditTodoDialog(todo: todo),
    );
    if (result != null && mounted) {
      final provider = context.read<TodoProvider>();
      if (result['action'] == 'delete') {
        await provider.deleteTodo(todo.id);
      } else if (result['action'] == 'save') {
        await provider.updateTodo(
          todo.id,
          title: result['title'] as String?,
          description: result['description'] as String?,
        );
        // Delete removed images
        final deletedIds = result['deletedImageIds'] as List<String>? ?? [];
        for (final id in deletedIds) {
          await provider.deleteImage(todo.id, id);
        }
        // Upload new images
        final pending = result['pendingImages'] as List<PendingImage>? ?? [];
        for (final img in pending) {
          await provider.uploadImage(todo.id, img.bytes, img.filename);
        }
      }
    }
  }
```

- [ ] **Step 6: Commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-app/lib/widgets/add_todo_dialog.dart \
  projects/todo-app/lib/widgets/edit_todo_dialog.dart \
  projects/todo-app/lib/screens/todo_list_screen.dart \
  projects/todo-app/lib/providers/todo_provider.dart
git commit -m "feat: integrate image attachments into add/edit dialogs"
```

---

## Task 5: Frontend — Todo Tile Image Display

**Files:**
- Modify: `projects/todo-app/lib/widgets/todo_tile.dart`

- [ ] **Step 1: Add image count badge to collapsed view**

In `projects/todo-app/lib/widgets/todo_tile.dart`, add import:

```dart
import '../services/api_service.dart';
```

In the `build` method, after the existing variables, add:

```dart
    final hasImages = widget.todo.images.isNotEmpty;
    final imageCount = widget.todo.images.length;
```

In the `trailing: Row(...)`, add the image count badge before the expand button:

```dart
                if (hasImages)
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.image_outlined, size: 16,
                            color: Theme.of(context).colorScheme.primary),
                        const SizedBox(width: 2),
                        Text(
                          '$imageCount',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
```

- [ ] **Step 2: Add thumbnail grid to expanded view**

In the expanded section (inside `if (_expanded && hasDescription)` padding), after `_buildDescription`, add a thumbnail grid. Change the expanded condition to also show when there are images:

Replace:
```dart
          if (_expanded && hasDescription)
```
With:
```dart
          if (_expanded && (hasDescription || hasImages))
```

And update the content to include both description and images:

```dart
          if (_expanded && (hasDescription || hasImages))
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
              child: SizedBox(
                width: double.infinity,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (hasDescription) _buildDescription(context, normalized),
                    if (hasImages) ...[
                      if (hasDescription) const SizedBox(height: 12),
                      _buildImageGrid(context),
                    ],
                  ],
                ),
              ),
            ),
```

Add the `_buildImageGrid` method:

```dart
  Widget _buildImageGrid(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: widget.todo.images.asMap().entries.map((entry) {
        final index = entry.key;
        final image = entry.value;
        return GestureDetector(
          onTap: () => _openImageViewer(context, index),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              '${ApiService.baseUrl}${image.thumbUrl}',
              width: 80,
              height: 80,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 80,
                height: 80,
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: const Icon(Icons.broken_image, size: 24),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  void _openImageViewer(BuildContext context, int initialIndex) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        pageBuilder: (_, __, ___) => ImageViewerScreen(
          images: widget.todo.images,
          initialIndex: initialIndex,
        ),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
      ),
    );
  }
```

Add the import for the viewer:

```dart
import 'image_viewer_screen.dart';
```

Also update the `onTap` and expand button conditions to trigger on images too. Change:

```dart
            onTap: hasDescription
                ? () => setState(() => _expanded = !_expanded)
                : null,
```
To:
```dart
            onTap: (hasDescription || hasImages)
                ? () => setState(() => _expanded = !_expanded)
                : null,
```

And the expand button condition:

```dart
                if (hasDescription)
```
To:
```dart
                if (hasDescription || hasImages)
```

- [ ] **Step 3: Commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-app/lib/widgets/todo_tile.dart
git commit -m "feat: show image count badge and thumbnail grid in todo tiles"
```

---

## Task 6: Frontend — Full-Screen Image Viewer

**Files:**
- Create: `projects/todo-app/lib/widgets/image_viewer_screen.dart`

- [ ] **Step 1: Create the image viewer screen**

Create `projects/todo-app/lib/widgets/image_viewer_screen.dart`:

```dart
import 'package:flutter/material.dart';
import '../models/todo_image.dart';
import '../services/api_service.dart';

class ImageViewerScreen extends StatefulWidget {
  final List<TodoImage> images;
  final int initialIndex;

  const ImageViewerScreen({
    super.key,
    required this.images,
    required this.initialIndex,
  });

  @override
  State<ImageViewerScreen> createState() => _ImageViewerScreenState();
}

class _ImageViewerScreenState extends State<ImageViewerScreen> {
  late PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.images.length;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Swipeable image pages
          PageView.builder(
            controller: _pageController,
            itemCount: total,
            onPageChanged: (i) => setState(() => _currentIndex = i),
            itemBuilder: (context, index) {
              final image = widget.images[index];
              return InteractiveViewer(
                minScale: 1.0,
                maxScale: 4.0,
                child: Center(
                  child: Image.network(
                    '${ApiService.baseUrl}${image.fullUrl}',
                    fit: BoxFit.contain,
                    loadingBuilder: (_, child, progress) {
                      if (progress == null) return child;
                      return Center(
                        child: CircularProgressIndicator(
                          value: progress.expectedTotalBytes != null
                              ? progress.cumulativeBytesLoaded /
                                  progress.expectedTotalBytes!
                              : null,
                          color: Colors.white70,
                        ),
                      );
                    },
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image, size: 64, color: Colors.white38),
                    ),
                  ),
                ),
              );
            },
          ),
          // Close button
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 16,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 28),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          // Image counter
          if (total > 1)
            Positioned(
              top: MediaQuery.of(context).padding.top + 16,
              left: 0,
              right: 0,
              child: Center(
                child: Text(
                  '${_currentIndex + 1} / $total',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
          // Dot indicators
          if (total > 1)
            Positioned(
              bottom: MediaQuery.of(context).padding.bottom + 24,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(total, (i) {
                  return Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i == _currentIndex
                          ? Colors.white
                          : Colors.white.withValues(alpha: 0.4),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-app/lib/widgets/image_viewer_screen.dart
git commit -m "feat: add full-screen image viewer with swipe and pinch-to-zoom"
```

---

## Task 7: Frontend — Image Thumbnails Need Auth Headers

The `Image.network` widget can't pass auth headers for JWT-protected endpoints. We need to handle this.

**Files:**
- Modify: `projects/todo-app/lib/widgets/todo_tile.dart`
- Modify: `projects/todo-app/lib/widgets/image_attachment_section.dart`
- Modify: `projects/todo-app/lib/widgets/image_viewer_screen.dart`
- Modify: `projects/todo-app/lib/services/api_service.dart`

- [ ] **Step 1: Add an authenticated image widget helper to ApiService**

In `projects/todo-app/lib/services/api_service.dart`, add a static token getter (the token is already stored, we just need access):

```dart
  String? get token => _token;
```

- [ ] **Step 2: Create an authenticated network image helper**

Create a helper function. The simplest approach for Flutter web is to append the token as a query parameter and accept it server-side. Add to the Flask backend — in `app.py`, update `auth_required` to also check for a `token` query parameter:

In the `auth_required` decorator in `app.py`, after `token = auth_header[7:]`, add a fallback:

```python
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
```

- [ ] **Step 3: Create a helper to build authenticated image URLs**

In `projects/todo-app/lib/services/api_service.dart`, add:

```dart
  String imageUrl(String path) {
    if (_token != null) {
      return '$baseUrl$path?token=$_token';
    }
    return '$baseUrl$path';
  }
```

- [ ] **Step 4: Update all image widgets to use authenticated URLs**

In `image_attachment_section.dart`, add import and accept the API service:

Add a `baseImageUrl` callback parameter to `ImageAttachmentSection` and `_ExistingThumb`:

```dart
  final String Function(String path) imageUrl;
```

Pass it through and use `imageUrl(image.thumbUrl)` instead of `'${ApiService.baseUrl}${image.thumbUrl}'`.

In `todo_tile.dart`, get the API service from the provider context and use `api.imageUrl(image.thumbUrl)`.

In `image_viewer_screen.dart`, accept `imageUrl` as a parameter and use it for full-size URLs.

The exact wiring depends on how the API service is accessed. Since `TodoProvider` has the `ApiService`, the simplest approach is to pass the `imageUrl` function down from the screen. In `todo_list_screen.dart`, get the API service and pass it to `TodoTile`:

Add to `TodoTile`:
```dart
  final String Function(String path) imageUrl;
```

And pass it from `TodoListScreen`:
```dart
  TodoTile(
    // ... existing params ...
    imageUrl: context.read<TodoProvider>().api.imageUrl,
  ),
```

This requires exposing `_api` as a getter on `TodoProvider`:
```dart
  ApiService get api => _api;
```

- [ ] **Step 5: Commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-api/app.py \
  projects/todo-app/lib/services/api_service.dart \
  projects/todo-app/lib/providers/todo_provider.dart \
  projects/todo-app/lib/widgets/todo_tile.dart \
  projects/todo-app/lib/widgets/image_attachment_section.dart \
  projects/todo-app/lib/widgets/image_viewer_screen.dart \
  projects/todo-app/lib/screens/todo_list_screen.dart
git commit -m "feat: add token-based auth for image URLs"
```

---

## Task 8: PWA Share Target — Image Sharing

**Files:**
- Modify: `projects/todo-app/web/manifest.json`
- Modify: `projects/todo-app/web/sw.js`
- Modify: `projects/todo-app/lib/services/share_handler.dart`
- Modify: `projects/todo-app/lib/screens/todo_list_screen.dart`

- [ ] **Step 1: Update manifest.json share_target**

Replace the existing `share_target` in `projects/todo-app/web/manifest.json`:

```json
"share_target": {
    "action": "./share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
        "title": "title",
        "text": "text",
        "url": "url",
        "files": [
            {
                "name": "images",
                "accept": ["image/*"]
            }
        ]
    }
}
```

- [ ] **Step 2: Update service worker to handle POST share with files**

Replace `projects/todo-app/web/sw.js`:

```javascript
// Service worker for PWA + Web Share Target support (text + image)
'use strict';

const DB_NAME = 'share-target-db';
const STORE_NAME = 'shared-files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeFiles(files) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  // Clear previous entries
  store.clear();
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    store.add({ name: file.name, type: file.type, data: arrayBuffer });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept POST to share endpoint
  if (event.request.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const files = formData.getAll('images');
      const title = formData.get('title') || '';
      const text = formData.get('text') || '';
      const sharedUrl = formData.get('url') || '';

      if (files.length > 0) {
        await storeFiles(files);
      }

      // Redirect to app with share params
      const params = new URLSearchParams();
      if (title) params.set('title', title);
      if (text) params.set('text', text);
      if (sharedUrl) params.set('url', sharedUrl);
      if (files.length > 0) params.set('shared_images', '1');

      const base = url.pathname.replace(/\/share$/, '/');
      const redirectUrl = base + '?' + params.toString();
      return Response.redirect(redirectUrl, 303);
    })());
    return;
  }

  // Network-only for everything else
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
```

- [ ] **Step 3: Update share_handler.dart to read shared images from IndexedDB**

Replace `projects/todo-app/lib/services/share_handler.dart`:

```dart
import 'dart:async';
import 'dart:typed_data';
import 'package:web/web.dart' as web;
import 'dart:js_interop';

class SharedData {
  final String title;
  final String description;
  final bool hasSharedImages;

  SharedData({
    required this.title,
    required this.description,
    this.hasSharedImages = false,
  });
}

class SharedImage {
  final Uint8List bytes;
  final String name;

  SharedImage({required this.bytes, required this.name});
}

/// Checks the current URL for Web Share Target query parameters.
SharedData? consumeShareParams() {
  final uri = Uri.base;
  final title = uri.queryParameters['title'];
  final text = uri.queryParameters['text'];
  final url = uri.queryParameters['url'];
  final sharedImages = uri.queryParameters['shared_images'];

  if (title == null && text == null && url == null && sharedImages == null) {
    return null;
  }

  final todoTitle = (title != null && title.isNotEmpty)
      ? title
      : (text ?? url ?? 'Shared item');
  final parts = <String>[];
  if (url != null && url.isNotEmpty) parts.add(url);
  if (text != null && text.isNotEmpty && text != todoTitle) parts.add(text);
  final todoDescription = parts.join('\n');

  // Clean up URL
  final cleanUri = uri.replace(queryParameters: {});
  web.window.history.replaceState(null, '', cleanUri.toString());

  return SharedData(
    title: todoTitle,
    description: todoDescription,
    hasSharedImages: sharedImages == '1',
  );
}

/// Read shared images from IndexedDB (stored by the service worker).
Future<List<SharedImage>> readSharedImages() async {
  final completer = Completer<List<SharedImage>>();

  final request = web.window.self.indexedDB.open('share-target-db', 1);
  request.onupgradeneeded = (web.Event event) {
    final db = request.result as web.IDBDatabase;
    if (!db.objectStoreNames.contains('shared-files')) {
      db.createObjectStore('shared-files', web.IDBObjectStoreParameters(autoIncrement: true));
    }
  }.toJS;
  request.onsuccess = (web.Event event) {
    final db = request.result as web.IDBDatabase;
    final tx = db.transaction('shared-files'.toJS, 'readonly');
    final store = tx.objectStore('shared-files');
    final getAll = store.getAll();

    getAll.onsuccess = (web.Event e) {
      final results = <SharedImage>[];
      final items = getAll.result as JSArray;
      for (int i = 0; i < items.length; i++) {
        final item = items[i] as JSObject;
        final name = (item['name'] as JSString).toDart;
        final data = (item['data'] as JSArrayBuffer).toDart;
        results.add(SharedImage(
          bytes: data.asUint8List(),
          name: name,
        ));
      }

      // Clear the store
      final clearTx = db.transaction('shared-files'.toJS, 'readwrite');
      clearTx.objectStore('shared-files').clear();

      completer.complete(results);
    }.toJS;

    getAll.onerror = (web.Event e) {
      completer.complete([]);
    }.toJS;
  }.toJS;

  request.onerror = (web.Event event) {
    completer.complete([]);
  }.toJS;

  return completer.future;
}
```

- [ ] **Step 4: Update TodoListScreen to handle shared images**

In `projects/todo-app/lib/screens/todo_list_screen.dart`, update `_handleSharedData`:

```dart
  void _handleSharedData() async {
    if (_sharedDataHandled || widget.sharedData == null) return;
    _sharedDataHandled = true;

    List<PendingImage>? sharedImages;
    if (widget.sharedData!.hasSharedImages) {
      final images = await readSharedImages();
      sharedImages = images
          .map((img) => PendingImage(bytes: img.bytes, filename: img.name))
          .toList();
    }

    if (mounted) {
      _addTodo(
        initialTitle: widget.sharedData!.title,
        initialDescription: widget.sharedData!.description,
        initialImages: sharedImages,
      );
    }
  }
```

Add import:

```dart
import '../services/share_handler.dart' show SharedData, readSharedImages, SharedImage;
```

Update `_addTodo` to pre-populate pending images in the dialog. Since `AddTodoDialog` needs to accept initial pending images, add a parameter:

In `add_todo_dialog.dart`, add:
```dart
  final List<PendingImage>? initialImages;
```

In `initState`, add:
```dart
    if (widget.initialImages != null) {
      _pendingImages.addAll(widget.initialImages!);
    }
```

Pass from `_addTodo`:
```dart
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddTodoDialog(
        initialTitle: initialTitle,
        initialDescription: initialDescription,
        initialImages: initialImages,
      ),
    );
```

- [ ] **Step 5: Commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add projects/todo-app/web/manifest.json projects/todo-app/web/sw.js \
  projects/todo-app/lib/services/share_handler.dart \
  projects/todo-app/lib/screens/todo_list_screen.dart \
  projects/todo-app/lib/widgets/add_todo_dialog.dart
git commit -m "feat: add PWA share target support for shared images"
```

---

## Task 9: Final Integration & Testing

**Files:**
- All modified files

- [ ] **Step 1: Run Flutter analyze**

```bash
cd /Users/epatel/Development/claude/vps_ai/projects/todo-app
flutter analyze
```

Fix any issues found.

- [ ] **Step 2: Test backend manually**

```bash
cd /Users/epatel/Development/claude/vps_ai/projects/todo-api
pip install -r requirements.txt
python -c "from app import init_db; init_db(); print('DB init OK')"
```

- [ ] **Step 3: Verify Flutter build succeeds**

```bash
cd /Users/epatel/Development/claude/vps_ai/projects/todo-app
flutter build web --base-href /todo-app/
```

- [ ] **Step 4: Add uploads/ to .gitignore**

In `projects/todo-api/.gitignore` (create if doesn't exist), add:

```
uploads/
todo.db
```

Also ensure `.superpowers/` is in `projects/todo-app/.gitignore`.

- [ ] **Step 5: Final commit**

```bash
cd /Users/epatel/Development/claude/vps_ai
git add -A
git commit -m "feat: complete image attachment support for todos"
```
