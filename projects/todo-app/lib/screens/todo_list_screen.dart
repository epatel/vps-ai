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
          reorderable: false,
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
