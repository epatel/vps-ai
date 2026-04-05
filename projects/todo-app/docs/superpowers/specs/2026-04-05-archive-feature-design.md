# Todo App: Archive Feature Design

## Overview

Add an archive system to the todo app. Archiving is separate from the existing done/undone toggle. Users prune their active list by archiving items, then clean up by deleting archived items.

## Data Model

Add `archived INTEGER DEFAULT 0` column to the `todos` table. Migration: `ALTER TABLE todos ADD COLUMN archived INTEGER DEFAULT 0`.

The `done` field is unchanged and independent of `archived`.

## API Changes

### GET /todos
Add optional query parameter `?archived=0` (default) or `?archived=1` to filter. Both tabs call the same endpoint with different filter values.

### PUT /todos/{id}
Already accepts arbitrary fields. No changes needed — the client sends `archived: true/false` to archive/unarchive.

### POST /todos (new item sort order)
Change sort_order calculation from `MAX(sort_order) + 1` to `MIN(sort_order) - 1` so new items appear at the top of the list. Only consider non-archived todos when calculating.

### DELETE /todos/{id}
No changes. Already works. The UI will only expose delete for archived items.

## UI Changes

### Bottom Navigation Bar
Two tabs using `BottomNavigationBar`:
- **Todos** (icon: `checklist`) — active items, `archived=0`
- **Archive** (icon: `archive_outlined`) — archived items, `archived=1`

The current `TodoListScreen` becomes the body for the Todos tab. A new `ArchiveScreen` (or the same screen parameterized) shows archived items.

### Scaffold restructure
Wrap the app body in an `IndexedStack` or switch body based on the selected tab index. The FAB (add button) only shows on the Todos tab.

### Active list (Todos tab)
- Unchanged behavior: reorderable, checkbox toggle, tap to edit
- Edit dialog: remove the existing delete button, add an **Archive** button (`Icons.archive_outlined`) in its place
- New items appear at the top

### Archive list (Archive tab)
- Non-reorderable list of archived items
- Done state still visible (strikethrough) but checkbox still toggleable
- Tap to open edit dialog
- Edit dialog shows:
  - **Unarchive** button (`Icons.unarchive_outlined`) — sets `archived: false`, moves item back to active list
  - **Delete** button (`Icons.delete_outlined`) — permanently deletes the item
- Refresh button in app bar to reload
- Empty state: "No archived items"

### Edit Todo Dialog changes
The dialog needs to know whether the todo is archived:
- **Active todo**: shows Archive button, no Delete button
- **Archived todo**: shows Unarchive button and Delete button

### Sort order for unarchived items
When unarchiving, set `sort_order = MIN(sort_order) - 1` among active todos so the item appears at the top of the active list.

## Provider Changes

### TodoProvider
- `loadTodos()` and `loadArchivedTodos()` — or parameterize with `archived` flag
- Maintain two lists: `_todos` (active) and `_archivedTodos`
- `archiveTodo(id)` — PUT with `archived: true`, move from `_todos` to `_archivedTodos`
- `unarchiveTodo(id)` — PUT with `archived: false`, recalculate sort_order, move from `_archivedTodos` to `_todos`
- Remove delete from active todos UI (provider method stays for archived use)

## Files to Modify

1. `projects/todo-api/app.py` — migration, filter query, sort_order change
2. `lib/models/todo.dart` — add `archived` field
3. `lib/services/api_service.dart` — add `archived` query param to `listTodos()`
4. `lib/providers/todo_provider.dart` — dual lists, archive/unarchive methods
5. `lib/screens/todo_list_screen.dart` — add bottom nav, split into tabs
6. `lib/widgets/edit_todo_dialog.dart` — archive/unarchive/delete buttons based on state
7. `lib/app.dart` — pass through any structural changes

## Testing

- Share an image, confirm it appears in dialog, add todo — verify image attached
- Archive a todo — verify it disappears from active, appears in archive
- Unarchive — verify it reappears at top of active list
- Delete archived item — verify permanent removal
- New todos appear at top of list
- Done/undone toggle works independently in both tabs
- Reorder still works in active tab
