import 'dart:ui';

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
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TodoProvider>().loadTodos();
      _handleSharedData();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
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
    final provider = context.read<TodoProvider>();
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AddTodoDialog(
        initialTitle: initialTitle,
        initialDescription: initialDescription,
        initialImages: initialImages,
        pendingServerImageIds: pendingImageIds,
        initialCategory: provider.currentCategory ?? kDefaultCategory,
        categories: provider.categories,
      ),
    );
    if (result != null && mounted) {
      final todo = await provider.addTodoAndReturn(
        result['title'] as String,
        description: (result['description'] as String?) ?? '',
        category: result['category'] as String?,
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
    final provider = context.read<TodoProvider>();
    // Include the todo's own category in the picker even if no other active
    // todo uses it (important for archived todos or categories about to be
    // removed from the active view).
    final cats = <String>{...provider.categories, todo.category}.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => EditTodoDialog(todo: todo, categories: cats),
    );
    if (result != null && mounted) {
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
          category: result['category'] as String?,
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
        title: _selectedTab == 0
            ? _CategoryTitle(provider: todoProvider)
            : const Text('Archive'),
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

    final visible = todoProvider.filteredTodos;

    if (visible.isEmpty) {
      final filtered = todoProvider.currentCategory != null;
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.checklist, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              filtered
                  ? 'No todos in ${todoProvider.currentCategory}'
                  : 'No todos yet',
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
      itemCount: visible.length,
      buildDefaultDragHandles: false,
      // Long-press delay before drag starts (matches the delayed drag
      // listener in TodoTile). Kept explicit so the haptic-like visual feedback
      // timing stays in sync with our gesture recognizer.
      proxyDecorator: (child, index, animation) {
        return AnimatedBuilder(
          animation: animation,
          builder: (context, child) {
            // Use easeOut so feedback is near-instant when drag begins,
            // making it obvious to the user that long-press succeeded.
            final animValue = Curves.easeOut.transform(animation.value);
            final elevation = lerpDouble(0, 12, animValue)!;
            final scale = lerpDouble(1, 1.04, animValue)!;
            return Transform.scale(
              scale: scale,
              child: Material(
                elevation: elevation,
                color: Colors.transparent,
                shadowColor: Theme.of(context).colorScheme.shadow,
                borderRadius: BorderRadius.circular(12),
                child: child,
              ),
            );
          },
          child: child,
        );
      },
      onReorder: (oldIndex, newIndex) {
        todoProvider.reorder(oldIndex, newIndex);
      },
      itemBuilder: (context, index) {
        final todo = visible[index];
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

    final query = _searchQuery.toLowerCase();
    final filtered = query.isEmpty
        ? todoProvider.archivedTodos
        : todoProvider.archivedTodos.where((t) =>
            t.title.toLowerCase().contains(query) ||
            t.description.toLowerCase().contains(query)).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Search archive...',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 20),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = '');
                      },
                    )
                  : null,
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(28),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
            onChanged: (value) => setState(() => _searchQuery = value),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Text(
                    'No matches',
                    style: TextStyle(color: Colors.grey.shade500),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.only(top: 4, bottom: 16),
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final todo = filtered[index];
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
                ),
        ),
      ],
    );
  }
}

/// AppBar title rendered as a tappable category selector.
/// Shows the current category (or "All") with a dropdown arrow; on tap,
/// opens a popup menu of existing categories plus "+ New category…".
class _CategoryTitle extends StatelessWidget {
  final TodoProvider provider;
  const _CategoryTitle({required this.provider});

  static const _allSentinel = '__all__';
  static const _newSentinel = '__new__';

  Future<void> _promptForNew(BuildContext context) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New category'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'e.g. School',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name != null && name.isNotEmpty) {
      provider.setCategory(name);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = provider.currentCategory;
    final label = current ?? 'All';
    final cats = provider.categories;

    return PopupMenuButton<String>(
      tooltip: 'Switch category',
      position: PopupMenuPosition.under,
      onSelected: (value) {
        if (value == _allSentinel) {
          provider.setCategory(null);
        } else if (value == _newSentinel) {
          _promptForNew(context);
        } else {
          provider.setCategory(value);
        }
      },
      itemBuilder: (ctx) => [
        CheckedPopupMenuItem(
          value: _allSentinel,
          checked: current == null,
          child: const Text('All'),
        ),
        ...cats.map((c) => CheckedPopupMenuItem(
              value: c,
              checked: current == c,
              child: Text(c),
            )),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: _newSentinel,
          child: Row(
            children: [
              Icon(Icons.add, size: 18),
              SizedBox(width: 8),
              Text('New category…'),
            ],
          ),
        ),
      ],
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const Icon(Icons.arrow_drop_down),
        ],
      ),
    );
  }
}
