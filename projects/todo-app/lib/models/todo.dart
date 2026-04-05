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
