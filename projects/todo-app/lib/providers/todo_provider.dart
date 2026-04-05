import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import '../models/todo.dart';
import '../services/api_service.dart';

class TodoProvider extends ChangeNotifier {
  final ApiService _api;
  List<Todo> _todos = [];
  List<Todo> _archivedTodos = [];
  bool _isLoading = false;
  bool _isLoadingArchived = false;
  String? _error;

  TodoProvider(this._api);

  List<Todo> get todos => _todos;
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<Todo> get archivedTodos => _archivedTodos;
  bool get isLoadingArchived => _isLoadingArchived;
  ApiService get api => _api;

  Future<void> loadTodos() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _todos = await _api.getTodos();
      _isLoading = false;
      notifyListeners();
    } on ApiException catch (e) {
      _error = e.message;
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = 'Failed to load todos';
      _isLoading = false;
      notifyListeners();
    }
  }

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

  Future<bool> addTodo(String title, {String description = ''}) async {
    try {
      final todo = await _api.createTodo(title, description: description);
      _todos.insert(0, todo);
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'Failed to create todo';
      notifyListeners();
      return false;
    }
  }

  Future<bool> toggleDone(Todo todo) async {
    final newDone = !todo.done;
    try {
      final updated = await _api.updateTodo(todo.id, done: newDone);
      final index = _todos.indexWhere((t) => t.id == todo.id);
      if (index != -1) {
        _todos[index] = updated;
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = 'Failed to update todo';
      notifyListeners();
      return false;
    }
  }

  Future<bool> updateTodo(String id, {String? title, String? description}) async {
    try {
      final updated = await _api.updateTodo(id, title: title, description: description);
      final index = _todos.indexWhere((t) => t.id == id);
      if (index != -1) {
        _todos[index] = updated;
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = 'Failed to update todo';
      notifyListeners();
      return false;
    }
  }

  Future<bool> deleteTodo(String id) async {
    try {
      await _api.deleteTodo(id);
      _todos.removeWhere((t) => t.id == id);
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Failed to delete todo';
      notifyListeners();
      return false;
    }
  }

  Future<void> reorder(int oldIndex, int newIndex) async {
    if (oldIndex < newIndex) {
      newIndex -= 1;
    }
    final item = _todos.removeAt(oldIndex);
    _todos.insert(newIndex, item);
    notifyListeners();

    // Calculate new sort orders
    final items = <Map<String, dynamic>>[];
    for (int i = 0; i < _todos.length; i++) {
      _todos[i].sortOrder = (i + 1).toDouble();
      items.add({'id': _todos[i].id, 'sort_order': _todos[i].sortOrder});
    }

    try {
      await _api.reorderTodos(items);
    } catch (e) {
      // Reload on failure
      await loadTodos();
    }
  }

  Future<Todo?> addTodoAndReturn(String title, {String description = ''}) async {
    try {
      final todo = await _api.createTodo(title, description: description);
      _todos.insert(0, todo);
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

  Future<bool> claimPendingImage(String todoId, String pendingId) async {
    try {
      final image = await _api.claimPendingImage(pendingId, todoId);
      final index = _todos.indexWhere((t) => t.id == todoId);
      if (index != -1) {
        _todos[index].images = [..._todos[index].images, image];
        notifyListeners();
      }
      return true;
    } catch (e) {
      _error = 'Failed to claim shared image';
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

  void clear() {
    _todos = [];
    _archivedTodos = [];
    _error = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
