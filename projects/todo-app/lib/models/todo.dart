class Todo {
  final String id;
  final String userId;
  String title;
  String description;
  bool done;
  double sortOrder;
  final String createdAt;
  String updatedAt;

  Todo({
    required this.id,
    required this.userId,
    required this.title,
    this.description = '',
    this.done = false,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Todo.fromJson(Map<String, dynamic> json) {
    return Todo(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      title: json['title'] as String,
      description: (json['description'] as String?) ?? '',
      done: (json['done'] as int?) == 1,
      sortOrder: (json['sort_order'] as num).toDouble(),
      createdAt: json['created_at'] as String,
      updatedAt: json['updated_at'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'description': description,
      'done': done ? 1 : 0,
      'sort_order': sortOrder,
    };
  }
}
