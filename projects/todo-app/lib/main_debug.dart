import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/api_service.dart';
import 'providers/auth_provider.dart';
import 'providers/todo_provider.dart';
import 'models/todo.dart';
import 'app.dart';

Todo _mockTodo(int i, String title, {String description = '', bool done = false}) {
  final now = DateTime.now().toIso8601String();
  return Todo(
    id: 'mock-$i',
    userId: 'mock-user',
    title: title,
    description: description,
    done: done,
    sortOrder: i.toDouble(),
    createdAt: now,
    updatedAt: now,
  );
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final apiService = ApiService();

  final mockTodos = [
    _mockTodo(1, 'Buy groceries', description: 'Milk, eggs, bread'),
    _mockTodo(2, 'Walk the dog'),
    _mockTodo(3, 'Finish report', description: '- [ ] Intro\n- [x] Body\n- [ ] Conclusion'),
    _mockTodo(4, 'Call dentist', done: true),
    _mockTodo(5, 'Fix drag-reorder bug'),
    _mockTodo(6, 'Read chapter 4'),
    _mockTodo(7, 'Water plants'),
    _mockTodo(8, 'Renew passport'),
    _mockTodo(9, 'Plan weekend trip'),
    _mockTodo(10, 'Backup laptop'),
  ];

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>(
          create: (_) => AuthProvider.mock(apiService),
        ),
        ChangeNotifierProvider<TodoProvider>(
          create: (_) => TodoProvider.mock(apiService, mockTodos),
        ),
      ],
      child: const TodoApp(),
    ),
  );
}
