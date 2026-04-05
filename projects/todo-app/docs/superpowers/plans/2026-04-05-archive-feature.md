# Archive Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add archive functionality with a bottom navigation bar, allowing users to archive/unarchive todos and delete only archived items.

**Architecture:** Add `archived` column to the database, filter by it in the API, maintain separate lists in the provider, and restructure the UI with a bottom nav bar switching between active and archive views.

**Tech Stack:** Flutter (web), Python Flask, SQLite

---

### Task 1: Backend — Add archived column and filtering

**Files:**
- Modify: `projects/todo-api/app.py`

- [ ] **Step 1: Add migration for archived column**

In `init_db()`, after the existing `ALTER TABLE` migrations (line ~115), add:

```python
try:
    conn.execute("ALTER TABLE todos ADD COLUMN archived INTEGER DEFAULT 0")
except sqlite3.OperationalError:
    pass
```

- [ ] **Step 2: Update GET /todos to filter by archived**

Replace the `list_todos` function (line ~519-529):

```python
@app.route("/todos", methods=["GET"])
@auth_required
def list_todos():
    db = get_db()
    archived = request.args.get("archived", "0")
    rows = db.execute(
        "SELECT * FROM todos WHERE user_id = ? AND archived = ? ORDER BY sort_order ASC",
        (g.user_id, int(archived)),
    ).fetchall()
    todos = [dict(r) for r in rows]
    attach_images(db, todos)
    return jsonify(todos), 200
```

- [ ] **Step 3: Update POST /todos to insert at top and set archived=0**

Replace the sort_order calculation in `create_todo` (line ~544-548):

```python
    row = db.execute(
        "SELECT COALESCE(MIN(sort_order), 1) as mn FROM todos WHERE user_id = ? AND archived = 0",
        (g.user_id,),
    ).fetchone()
    sort_order = (row["mn"] or 1) - 1.0
```

- [ ] **Step 4: Update PUT /todos to handle archived field**

In `update_todo` (line ~589), add `archived` to the fields read from the request body. After `sort_order = data.get("sort_order", todo["sort_order"])`, add:

```python
    archived = data.get("archived", todo["archived"])
```

And update the SQL to include it:

```python
    db.execute(
        "UPDATE todos SET title=?, description=?, done=?, sort_order=?, archived=?, updated_at=? WHERE id=?",
        (title, description, int(bool(done)), sort_order, int(bool(archived)), now, todo_id),
    )
```

- [ ] **Step 5: Commit**

```bash
git add projects/todo-api/app.py
git commit -m "feat(api): add archived column with filtering and top-insert sort order"
```

---

### Task 2: Flutter model — Add archived field

**Files:**
- Modify: `projects/todo-app/lib/models/todo.dart`

- [ ] **Step 1: Add archived field to Todo class**

Add `bool archived;` field after `bool done;` (line 8). Update constructor to include `this.archived = false`. Update `fromJson`:

```dart
archived: (json['archived'] as int?) == 1,
```

Update `toJson`:

```dart
'archived': archived ? 1 : 0,
```

Full updated file:

```dart
import 'todo_image.dart';

class Todo {
  final String id;
  final String userId;
  String title;
  String description;
  bool done;
  bool archived;
  double sortOrder;
  final String createdAt;
  String updatedAt;
  List<TodoImage> images;

  Todo({
    required this.id,
    required this.userId,
    required this.title,
    this.description = '',
    this.done = false,
    this.archived = false,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
    this.images = const [],
  });

  factory Todo.fromJson(Map<String, dynamic> json) {
    return Todo(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      title: json['title'] as String,
      description: (json['description'] as String?) ?? '',
      done: (json['done'] as int?) == 1,
      archived: (json['archived'] as int?) == 1,
      sortOrder: (json['sort_order'] as num).toDouble(),
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
      images: ((json['images'] as List<dynamic>?) ?? []).map((e) => TodoImage.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'description': description,
      'done': done ? 1 : 0,
      'archived': archived ? 1 : 0,
      'sort_order': sortOrder,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add projects/todo-app/lib/models/todo.dart
git commit -m "feat(model): add archived field to Todo"
```

---

### Task 3: API service — Add archived parameter and archive methods

**Files:**
- Modify: `projects/todo-app/lib/services/api_service.dart`

- [ ] **Step 1: Update getTodos to accept archived filter**

Replace `getTodos()` (line 125-132):

```dart
  Future<List<Todo>> getTodos({bool archived = false}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/todos?archived=${archived ? 1 : 0}'),
      headers: _headers,
    );
    final list = await _handleListResponse(response);
    return list.map((json) => Todo.fromJson(json as Map<String, dynamic>)).toList();
  }
```

- [ ] **Step 2: Update updateTodo to accept archived parameter**

Replace `updateTodo` signature and body (line 144-158):

```dart
  Future<Todo> updateTodo(String id, {String? title, String? description, bool? done, double? sortOrder, bool? archived}) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (description != null) body['description'] = description;
    if (done != null) body['done'] = done ? 1 : 0;
    if (sortOrder != null) body['sort_order'] = sortOrder;
    if (archived != null) body['archived'] = archived ? 1 : 0;

    final response = await http.put(
      Uri.parse('$baseUrl/todos/$id'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final data = await _handleResponse(response);
    return Todo.fromJson(data);
  }
```

- [ ] **Step 3: Commit**

```bash
git add projects/todo-app/lib/services/api_service.dart
git commit -m "feat(api-service): add archived filter and update support"
```

---

### Task 4: Provider — Add archive list and methods

**Files:**
- Modify: `projects/todo-app/lib/providers/todo_provider.dart`

- [ ] **Step 1: Add archived todos list and loading state**

After `List<Todo> _todos = [];` (line 8), add:

```dart
  List<Todo> _archivedTodos = [];
  bool _isLoadingArchived = false;
```

After `String? get error => _error;` (line 16), add:

```dart
  List<Todo> get archivedTodos => _archivedTodos;
  bool get isLoadingArchived => _isLoadingArchived;
```

- [ ] **Step 2: Add loadArchivedTodos method**

After the `loadTodos()` method (after line 37), add:

```dart
  Future<void> loadArchivedTodos() async {
    _isLoadingArchived = true;
    _error = null;
    notifyListeners();

    try {
      _archivedTodos = await _api.getTodos(archived: true);
      _isLoadingArchived = false;
      notifyListeners();
    } on ApiException catch (e) {
      _error = e.message;
      _isLoadingArchived = false;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to load archived todos';
      _isLoadingArchived = false;
      notifyListeners();
    }
  }
```

- [ ] **Step 3: Add archiveTodo method**

After `loadArchivedTodos()`, add:

```dart
  Future<bool> archiveTodo(String id) async {
    try {
      final updated = await _api.updateTodo(id, archived: true);
      _todos.removeWhere((t) => t.id == id);
      _archivedTodos.insert(0, updated);
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Failed to archive todo';
      notifyListeners();
      return false;
    }
  }
```

- [ ] **Step 4: Add unarchiveTodo method**

After `archiveTodo()`, add:

```dart
  Future<bool> unarchiveTodo(String id) async {
    try {
      final updated = await _api.updateTodo(id, archived: false);
      _archivedTodos.removeWhere((t) => t.id == id);
      _todos.insert(0, updated);
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Failed to unarchive todo';
      notifyListeners();
      return false;
    }
  }
```

- [ ] **Step 5: Update addTodo and addTodoAndReturn to insert at top**

In `addTodo` (line 41), change `_todos.add(todo)` to `_todos.insert(0, todo)`.

In `addTodoAndReturn` (line 128), change `_todos.add(todo)` to `_todos.insert(0, todo)`.

- [ ] **Step 6: Update clear() to also clear archived**

In `clear()` (line 190), add `_archivedTodos = [];`:

```dart
  void clear() {
    _todos = [];
    _archivedTodos = [];
    _error = null;
    notifyListeners();
  }
```

- [ ] **Step 7: Commit**

```bash
git add projects/todo-app/lib/providers/todo_provider.dart
git commit -m "feat(provider): add archive/unarchive methods and dual lists"
```

---

### Task 5: Edit dialog — Archive/Unarchive/Delete buttons based on state

**Files:**
- Modify: `projects/todo-app/lib/widgets/edit_todo_dialog.dart`

- [ ] **Step 1: Update EditTodoDialog to accept isArchived and change actions**

The dialog already receives a `Todo` which will now have an `archived` field. Update the `actions` section of the `build` method (line 192-207).

Replace the entire `actions` list:

```dart
      actions: [
        if (!widget.todo.archived)
          TextButton.icon(
            onPressed: () => Navigator.pop(context, {'action': 'archive'}),
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.secondary),
            icon: const Icon(Icons.archive_outlined, size: 18),
            label: const Text('Archive'),
          ),
        if (widget.todo.archived) ...[
          TextButton.icon(
            onPressed: () => Navigator.pop(context, {'action': 'unarchive'}),
            style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.secondary),
            icon: const Icon(Icons.unarchive_outlined, size: 18),
            label: const Text('Unarchive'),
          ),
          TextButton.icon(
            onPressed: _confirmDelete,
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            icon: const Icon(Icons.delete_outlined, size: 18),
            label: const Text('Delete'),
          ),
        ],
        const Spacer(),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Save'),
        ),
      ],
```

- [ ] **Step 2: Commit**

```bash
git add projects/todo-app/lib/widgets/edit_todo_dialog.dart
git commit -m "feat(dialog): archive/unarchive/delete buttons based on todo state"
```

---

### Task 6: TodoListScreen — Bottom nav bar and archive tab

**Files:**
- Modify: `projects/todo-app/lib/screens/todo_list_screen.dart`

- [ ] **Step 1: Add tab state and bottom navigation**

Replace the entire `_TodoListScreenState` class. Key changes:
- Add `_selectedTab` index (0=Todos, 1=Archive)
- Load archived todos when switching to archive tab
- Add `BottomNavigationBar`
- Handle archive/unarchive/delete actions from edit dialog
- Build separate bodies for each tab

Replace the full content of `todo_list_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/todo_provider.dart';
import '../widgets/todo_tile.dart';
import '../widgets/add_todo_dialog.dart';
import '../widgets/edit_todo_dialog.dart';
import '../models/todo.dart';
import '../services/share_handler.dart';
import '../widgets/image_attachment_section.dart';

class TodoListScreen extends StatefulWidget {
  final SharedData? sharedData;

  const TodoListScreen({super.key, this.sharedData});

  @override
  State<TodoListScreen> createState() => _TodoListScreenState();
}

class _TodoListScreenState extends State<TodoListScreen> {
  bool _sharedDataHandled = false;
  int _selectedTab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TodoProvider>().loadTodos();
      _handleSharedData();
    });
  }

  void _handleSharedData() async {
    if (_sharedDataHandled || widget.sharedData == null) return;
    _sharedDataHandled = true;

    if (mounted) {
      _addTodo(
        initialTitle: widget.sharedData!.title,
        initialDescription: widget.sharedData!.description,
        pendingImageIds: widget.sharedData!.pendingImageIds,
      );
    }
  }

  Future<void> _addTodo({String? initialTitle, String? initialDescription, List<PendingImage>? initialImages, List<String>? pendingImageIds}) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddTodoDialog(
        initialTitle: initialTitle,
        initialDescription: initialDescription,
        initialImages: initialImages,
        pendingServerImageIds: pendingImageIds,
      ),
    );
    if (result != null && mounted) {
      final provider = context.read<TodoProvider>();
      final todo = await provider.addTodoAndReturn(
        result['title'] as String,
        description: (result['description'] as String?) ?? '',
      );
      if (todo != null) {
        final serverIds = result['serverPendingIds'] as List<String>? ?? [];
        for (final id in serverIds) {
          await provider.claimPendingImage(todo.id, id);
        }
        final pending = result['pendingImages'] as List<PendingImage>? ?? [];
        for (final img in pending) {
          await provider.uploadImage(todo.id, img.bytes, img.filename);
        }
      }
    }
  }

  Future<void> _editTodo(Todo todo) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => EditTodoDialog(todo: todo),
    );
    if (result != null && mounted) {
      final provider = context.read<TodoProvider>();
      final action = result['action'] as String?;
      if (action == 'delete') {
        await provider.deleteTodo(todo.id);
      } else if (action == 'archive') {
        await provider.archiveTodo(todo.id);
      } else if (action == 'unarchive') {
        await provider.unarchiveTodo(todo.id);
      } else if (action == 'save') {
        await provider.updateTodo(
          todo.id,
          title: result['title'] as String?,
          description: result['description'] as String?,
        );
        final deletedIds = result['deletedImageIds'] as List<String>? ?? [];
        for (final id in deletedIds) {
          await provider.deleteImage(todo.id, id);
        }
        final pending = result['pendingImages'] as List<PendingImage>? ?? [];
        for (final img in pending) {
          await provider.uploadImage(todo.id, img.bytes, img.filename);
        }
      }
    }
  }

  void _onTabChanged(int index) {
    setState(() => _selectedTab = index);
    if (index == 1) {
      context.read<TodoProvider>().loadArchivedTodos();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final todoProvider = context.watch<TodoProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(_selectedTab == 0 ? 'My Todos' : 'Archive'),
        actions: [
          if (auth.email != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Center(
                child: Text(
                  auth.email!,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () {
              if (_selectedTab == 0) {
                todoProvider.loadTodos();
              } else {
                todoProvider.loadArchivedTodos();
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () {
              auth.logout();
              todoProvider.clear();
            },
          ),
        ],
      ),
      body: _selectedTab == 0
          ? _buildActiveTodos(todoProvider)
          : _buildArchivedTodos(todoProvider),
      floatingActionButton: _selectedTab == 0
          ? FloatingActionButton.extended(
              onPressed: _addTodo,
              icon: const Icon(Icons.add),
              label: const Text('Add Todo'),
            )
          : null,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedTab,
        onTap: _onTabChanged,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.checklist),
            label: 'Todos',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.archive_outlined),
            label: 'Archive',
          ),
        ],
      ),
    );
  }

  Widget _buildActiveTodos(TodoProvider todoProvider) {
    if (todoProvider.isLoading && todoProvider.todos.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (todoProvider.error != null && todoProvider.todos.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
            const SizedBox(height: 16),
            Text(todoProvider.error!),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => todoProvider.loadTodos(),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (todoProvider.todos.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.checklist, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No todos yet',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.grey.shade600,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Tap the button below to add one',
              style: TextStyle(color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    return ReorderableListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 88),
      itemCount: todoProvider.todos.length,
      buildDefaultDragHandles: false,
      onReorder: (oldIndex, newIndex) {
        todoProvider.reorder(oldIndex, newIndex);
      },
      itemBuilder: (context, index) {
        final todo = todoProvider.todos[index];
        return TodoTile(
          key: ValueKey(todo.id),
          todo: todo,
          index: index,
          onToggle: () => todoProvider.toggleDone(todo),
          onEdit: () => _editTodo(todo),
          onUpdateDescription: (newDesc) {
            todoProvider.updateTodo(todo.id, description: newDesc);
          },
          imageUrl: todoProvider.api.imageUrl,
        );
      },
    );
  }

  Widget _buildArchivedTodos(TodoProvider todoProvider) {
    if (todoProvider.isLoadingArchived && todoProvider.archivedTodos.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (todoProvider.error != null && todoProvider.archivedTodos.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
            const SizedBox(height: 16),
            Text(todoProvider.error!),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => todoProvider.loadArchivedTodos(),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (todoProvider.archivedTodos.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.archive_outlined, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No archived items',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.grey.shade600,
                  ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 16),
      itemCount: todoProvider.archivedTodos.length,
      itemBuilder: (context, index) {
        final todo = todoProvider.archivedTodos[index];
        return TodoTile(
          key: ValueKey(todo.id),
          todo: todo,
          index: index,
          onToggle: () => todoProvider.toggleDone(todo),
          onEdit: () => _editTodo(todo),
          onUpdateDescription: (newDesc) {
            todoProvider.updateTodo(todo.id, description: newDesc);
          },
          imageUrl: todoProvider.api.imageUrl,
        );
      },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add projects/todo-app/lib/screens/todo_list_screen.dart
git commit -m "feat(ui): add bottom nav bar with archive tab"
```

---

### Task 7: Verify and push

- [ ] **Step 1: Run flutter build to verify no compile errors**

```bash
cd projects/todo-app && flutter build web --base-href /todo-app/
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Push all commits**

```bash
git push
```

---

### Task 8: Manual testing checklist

- [ ] Wait for server rebuild (post-merge hook)
- [ ] Open todo app, verify bottom nav bar shows "Todos" and "Archive" tabs
- [ ] Add a new todo — verify it appears at the top of the list
- [ ] Tap a todo to edit — verify Archive button shows, no Delete button
- [ ] Tap Archive — verify todo disappears from active list
- [ ] Switch to Archive tab — verify archived todo appears
- [ ] Tap archived todo — verify Unarchive and Delete buttons show
- [ ] Tap Unarchive — verify todo moves back to top of active list
- [ ] Tap Delete on an archived todo — verify confirmation dialog, then permanent deletion
- [ ] Share an image — verify it still works with the new UI
