import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/todo_provider.dart';
import '../widgets/todo_tile.dart';
import '../widgets/add_todo_dialog.dart';
import '../widgets/edit_todo_dialog.dart';
import '../models/todo.dart';
import '../services/share_handler.dart';

class TodoListScreen extends StatefulWidget {
  final SharedData? sharedData;

  const TodoListScreen({super.key, this.sharedData});

  @override
  State<TodoListScreen> createState() => _TodoListScreenState();
}

class _TodoListScreenState extends State<TodoListScreen> {
  bool _sharedDataHandled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TodoProvider>().loadTodos();
      _handleSharedData();
    });
  }

  void _handleSharedData() {
    if (_sharedDataHandled || widget.sharedData == null) return;
    _sharedDataHandled = true;
    _addTodo(
      initialTitle: widget.sharedData!.title,
      initialDescription: widget.sharedData!.description,
    );
  }

  Future<void> _addTodo({String? initialTitle, String? initialDescription}) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => AddTodoDialog(
        initialTitle: initialTitle,
        initialDescription: initialDescription,
      ),
    );
    if (result != null && mounted) {
      await context.read<TodoProvider>().addTodo(
            result['title']!,
            description: result['description'] ?? '',
          );
    }
  }

  Future<void> _editTodo(Todo todo) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => EditTodoDialog(todo: todo),
    );
    if (result != null && mounted) {
      if (result['action'] == 'delete') {
        await context.read<TodoProvider>().deleteTodo(todo.id);
      } else if (result['action'] == 'save') {
        await context.read<TodoProvider>().updateTodo(
              todo.id,
              title: result['title'],
              description: result['description'],
            );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final todoProvider = context.watch<TodoProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Todos'),
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
            onPressed: () => todoProvider.loadTodos(),
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
      body: _buildBody(todoProvider),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addTodo,
        icon: const Icon(Icons.add),
        label: const Text('Add Todo'),
      ),
    );
  }

  Widget _buildBody(TodoProvider todoProvider) {
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
        );
      },
    );
  }
}
