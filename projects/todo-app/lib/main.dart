import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/api_service.dart';
import 'services/share_handler.dart';
import 'providers/auth_provider.dart';
import 'providers/todo_provider.dart';
import 'app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final apiService = ApiService();
  final sharedData = consumeShareParams();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider(apiService)),
        ChangeNotifierProvider(create: (_) => TodoProvider(apiService)),
      ],
      child: TodoApp(sharedData: sharedData),
    ),
  );
}
