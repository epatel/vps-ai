# Todo Image Attachments — Design Spec

## Overview

Add image attachment support to the todo app. Users can attach up to 10 images per todo via file picker, clipboard paste, or PWA share sheet. Images are resized server-side to max 1920px and converted to JPEG. Displayed as a thumbnail gallery below the todo description, with a full-screen swipe viewer on tap.

## Architecture: Server-Side File Storage (Approach A)

All image processing happens on the Flask backend using Pillow. Images are stored on disk alongside the SQLite database. The Flutter frontend uploads raw files and receives processed metadata back.

## Database

### New table: `todo_images`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key |
| `todo_id` | TEXT (UUID) | FK → todos.id, ON DELETE CASCADE |
| `filename` | TEXT | Stored filename (`<uuid>.jpg`) |
| `original_name` | TEXT | Original upload filename |
| `sort_order` | REAL | Ordering within a todo |
| `created_at` | TEXT | ISO 8601 datetime |

Cascade delete ensures images are removed from DB when a todo is deleted. A cleanup hook also deletes the corresponding files from disk.

## API Endpoints

### New endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/todos/<todo_id>/images` | Upload image (multipart/form-data). Returns image metadata JSON. |
| `GET` | `/images/<image_id>` | Serve full-size image. Auth required. |
| `GET` | `/images/<image_id>/thumb` | Serve thumbnail (~300px). Generated on first request, cached. |
| `DELETE` | `/images/<image_id>` | Delete image file + DB row. Auth required, must own the todo. |
| `POST` | `/todos/<todo_id>/images/reorder` | Reorder images (array of `{id, sort_order}`). |

### Modified endpoints

- `GET /todos` and `GET /todos/<id>` — include `images` array in each todo's JSON response:
  ```json
  "images": [
    {
      "id": "uuid",
      "thumb_url": "/images/<id>/thumb",
      "full_url": "/images/<id>",
      "original_name": "photo.png",
      "sort_order": 1.0
    }
  ]
  ```
- `DELETE /todos/<id>` — cascade deletes image files from disk (triggered by DB cascade + after-delete cleanup).

## Server File Storage

```
uploads/
├── <image_uuid>.jpg          # Full size (max 1920px longest side)
└── thumbs/
    └── <image_uuid>.jpg      # Thumbnail (~300px longest side)
```

The `uploads/` directory is relative to the Flask app's working directory.

## Image Processing (Pillow)

On upload (`POST /todos/<todo_id>/images`):

1. Read uploaded file with Pillow
2. Auto-orient using EXIF data (`ImageOps.exif_transpose`)
3. Convert to RGB (PNG transparency composited onto dark background matching the app's surface color, e.g. `#1e1e2e`)
4. Resize: if longest side > 1920px, downscale proportionally
5. Save as JPEG, quality 85
6. Store with UUID filename in `uploads/`

On first thumbnail request (`GET /images/<id>/thumb`):

1. Open the full-size JPEG
2. Resize longest side to 300px
3. Save to `uploads/thumbs/`
4. Serve the file (subsequent requests serve the cached file)

## Flutter Frontend

### Model changes

Add `TodoImage` class:
```dart
class TodoImage {
  final String id;
  final String thumbUrl;
  final String fullUrl;
  final String originalName;
  final double sortOrder;
}
```

Add `List<TodoImage> images` field to the `Todo` model, parsed from the API response.

### API service changes

New methods on `ApiService`:
- `uploadImage(todoId, fileBytes, filename)` → `TodoImage`
- `deleteImage(imageId)` → void
- `reorderImages(todoId, List<{id, sortOrder}>)` → void

### UI: Todo tile (collapsed)

- Show a small image icon + count badge (e.g., "📷 3") next to the trailing action buttons when images exist.

### UI: Todo tile (expanded)

- Below the description, show a thumbnail grid: 80px square thumbnails with 8px gap, wrapping to multiple rows.
- Tapping a thumbnail opens the full-screen viewer.

### UI: Add/Edit dialog

Below the description text field, add an attachment section:

- **Header**: "Images (N/10)" with image icon
- **Thumbnail row**: existing image thumbnails (72px) with ✕ delete button on each
- **Add button**: dashed-border "+" square to trigger file picker
- **Paste support**: intercept paste events on the description field — if clipboard contains an image, add it to attachments instead of pasting text. Also show hint text "Paste images here (Ctrl+V)" in the description field.
- **Max 10 images**: disable add button and show message when limit reached.

### UI: Full-screen image viewer

A new screen/overlay triggered by tapping a thumbnail:

- Dark background (#111)
- Image centered, fitting screen with aspect ratio preserved
- Close button (✕) top-right
- Image counter ("1 / 3") top-center
- Left/right navigation arrows on sides
- Dot indicators at bottom
- Swipe gesture support for navigating between images
- Pinch-to-zoom support

## PWA Share Target

### manifest.json addition

```json
"share_target": {
  "action": "/share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "files": [{ "name": "images", "accept": ["image/*"] }]
  }
}
```

### Custom service worker

Override Flutter's default service worker with a wrapper that:

1. Intercepts POST requests to `/share`
2. Extracts the shared image file(s) from the form data
3. Stores them temporarily in IndexedDB
4. Responds with a redirect to `/?shared=1`
5. Delegates all other requests to Flutter's service worker

### App-side share handling

When the app loads with `?shared=1`:

1. Read image(s) from IndexedDB
2. Open the Add Todo dialog with the image(s) pre-populated in the attachment section
3. Clear the IndexedDB entries after reading
4. User adds title, optionally adds description, and saves

## Limits and Constraints

- Max 10 images per todo
- Max upload size: 10MB per image (before server processing)
- Output format: always JPEG
- Full size: max 1920px longest side
- Thumbnail: 300px longest side
- JPEG quality: 85

## Dependencies

### Backend (new)
- `Pillow` — image processing (add to `requirements.txt`)

### Frontend (new)
- `file_picker` — file picker for selecting images (works well on Flutter web)
- No additional packages needed for paste handling (use dart:html / package:web)
- No additional packages needed for the full-screen viewer (custom Flutter widget)
