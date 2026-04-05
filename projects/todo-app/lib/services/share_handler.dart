import 'package:web/web.dart' as web;

class SharedData {
  final String title;
  final String description;
  final List<String> pendingImageIds;

  SharedData({
    required this.title,
    required this.description,
    this.pendingImageIds = const [],
  });
}

/// Checks the current URL for Web Share Target query parameters.
SharedData? consumeShareParams() {
  final uri = Uri.base;
  final title = uri.queryParameters['title'];
  final text = uri.queryParameters['text'];
  final url = uri.queryParameters['url'];
  final pendingImages = uri.queryParameters['pending_images'];

  if (title == null && text == null && url == null && pendingImages == null) {
    return null;
  }

  final todoTitle = (title != null && title.isNotEmpty)
      ? title
      : (text ?? url ?? 'Shared item');
  final parts = <String>[];
  if (url != null && url.isNotEmpty) parts.add(url);
  if (text != null && text.isNotEmpty && text != todoTitle) parts.add(text);
  final todoDescription = parts.join('\n');

  final imageIds = (pendingImages != null && pendingImages.isNotEmpty)
      ? pendingImages.split(',')
      : <String>[];

  // Clean up URL
  final cleanUri = uri.replace(queryParameters: {});
  web.window.history.replaceState(null, '', cleanUri.toString());

  return SharedData(
    title: todoTitle,
    description: todoDescription,
    pendingImageIds: imageIds,
  );
}
