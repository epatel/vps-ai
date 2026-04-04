class TodoImage {
  final String id;
  final String todoId;
  final String originalName;
  final double sortOrder;
  final String thumbUrl;
  final String fullUrl;
  final String createdAt;

  TodoImage({
    required this.id,
    required this.todoId,
    required this.originalName,
    required this.sortOrder,
    required this.thumbUrl,
    required this.fullUrl,
    required this.createdAt,
  });

  factory TodoImage.fromJson(Map<String, dynamic> json) {
    return TodoImage(
      id: json['id'] as String,
      todoId: json['todo_id'] as String,
      originalName: (json['original_name'] as String?) ?? '',
      sortOrder: (json['sort_order'] as num).toDouble(),
      thumbUrl: json['thumb_url'] as String,
      fullUrl: json['full_url'] as String,
      createdAt: json['created_at'] as String,
    );
  }
}
