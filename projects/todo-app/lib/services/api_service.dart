import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../models/todo.dart';
import '../models/todo_image.dart';

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);

  @override
  String toString() => message;
}

class ApiService {
  // Use relative paths so the app works behind the same nginx
  static const String baseUrl = '/todo-api';
  String? _token;

  void setToken(String? token) {
    _token = token;
  }

  String? get token => _token;

  Map<String, String> get _authHeaders {
    final headers = <String, String>{};
    if (_token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  String imageUrl(String path) {
    if (_token != null) {
      return '$baseUrl$path?token=$_token';
    }
    return '$baseUrl$path';
  }

  Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (_token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  Future<Map<String, dynamic>> _handleResponse(http.Response response) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return {};
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    String message = 'Request failed';
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      message = body['error'] as String? ?? message;
    } catch (_) {}
    throw ApiException(message, response.statusCode);
  }

  Future<List<dynamic>> _handleListResponse(http.Response response) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body) as List<dynamic>;
    }
    String message = 'Request failed';
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      message = body['error'] as String? ?? message;
    } catch (_) {}
    throw ApiException(message, response.statusCode);
  }

  // Auth endpoints

  Future<Map<String, dynamic>> signup(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/signup'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> forgotPassword(String email) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/forgot-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> resetPassword(String token, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/reset-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'token': token, 'password': password}),
    );
    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> getMe() async {
    final response = await http.get(
      Uri.parse('$baseUrl/auth/me'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // Todo endpoints

  Future<List<Todo>> getTodos() async {
    final response = await http.get(
      Uri.parse('$baseUrl/todos'),
      headers: _headers,
    );
    final list = await _handleListResponse(response);
    return list.map((json) => Todo.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<Todo> createTodo(String title, {String description = ''}) async {
    final response = await http.post(
      Uri.parse('$baseUrl/todos'),
      headers: _headers,
      body: jsonEncode({'title': title, 'description': description}),
    );
    final data = await _handleResponse(response);
    return Todo.fromJson(data);
  }

  Future<Todo> updateTodo(String id, {String? title, String? description, bool? done, double? sortOrder}) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (description != null) body['description'] = description;
    if (done != null) body['done'] = done ? 1 : 0;
    if (sortOrder != null) body['sort_order'] = sortOrder;

    final response = await http.put(
      Uri.parse('$baseUrl/todos/$id'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final data = await _handleResponse(response);
    return Todo.fromJson(data);
  }

  Future<void> deleteTodo(String id) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/todos/$id'),
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

  Future<List<Todo>> reorderTodos(List<Map<String, dynamic>> items) async {
    final response = await http.post(
      Uri.parse('$baseUrl/todos/reorder'),
      headers: _headers,
      body: jsonEncode({'items': items}),
    );
    final list = await _handleListResponse(response);
    return list.map((json) => Todo.fromJson(json as Map<String, dynamic>)).toList();
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

  Future<TodoImage> claimPendingImage(String pendingId, String todoId) async {
    final response = await http.post(
      Uri.parse('$baseUrl/pending-image/$pendingId'),
      headers: _headers,
      body: jsonEncode({'todo_id': todoId}),
    );
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
}
