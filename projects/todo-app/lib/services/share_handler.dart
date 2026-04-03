import 'package:web/web.dart' as web;

class SharedData {
  final String title;
  final String description;

  SharedData({required this.title, required this.description});
}

/// Checks the current URL for Web Share Target query parameters.
/// Returns [SharedData] if share params are present, null otherwise.
/// Cleans up the URL after reading params so they don't persist on reload.
SharedData? consumeShareParams() {
  final uri = Uri.base;
  final title = uri.queryParameters['title'];
  final text = uri.queryParameters['text'];
  final url = uri.queryParameters['url'];

  if (title == null && text == null && url == null) return null;

  // Build the todo title and description from share data
  final todoTitle = (title != null && title.isNotEmpty) ? title : (text ?? url ?? 'Shared link');
  final parts = <String>[];
  if (url != null && url.isNotEmpty) parts.add(url);
  if (text != null && text.isNotEmpty && text != todoTitle) parts.add(text);
  final todoDescription = parts.join('\n');

  // Clean up URL to remove share params (prevents re-triggering on reload)
  final cleanUri = uri.replace(queryParameters: {});
  web.window.history.replaceState(null, '', cleanUri.toString());

  return SharedData(title: todoTitle, description: todoDescription);
}
