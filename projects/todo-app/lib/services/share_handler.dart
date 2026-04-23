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

bool _looksLikeUrl(String? s) {
  if (s == null) return false;
  final trimmed = s.trim();
  if (trimmed.isEmpty) return false;
  final u = Uri.tryParse(trimmed);
  return u != null && u.hasScheme && (u.scheme == 'http' || u.scheme == 'https');
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

  // Figure out the "real" title. Android share sheets often dump the shared
  // URL straight into the title field — detect that and swap in "Link" so
  // the title stays human-readable and the URL lands in the description.
  String todoTitle;
  String? promotedUrl; // a URL we pulled out of title/text into description
  if (title != null && title.isNotEmpty && !_looksLikeUrl(title)) {
    todoTitle = title;
  } else if (_looksLikeUrl(title)) {
    todoTitle = 'Link';
    promotedUrl = title!.trim();
  } else if (_looksLikeUrl(text)) {
    todoTitle = 'Link';
    promotedUrl = text!.trim();
  } else if (url != null && url.isNotEmpty) {
    todoTitle = 'Link';
  } else {
    todoTitle = (text != null && text.isNotEmpty) ? text : 'Shared item';
  }

  final parts = <String>[];
  if (url != null && url.isNotEmpty) parts.add(url);
  if (promotedUrl != null && promotedUrl != url) parts.add(promotedUrl);
  if (text != null &&
      text.isNotEmpty &&
      text != todoTitle &&
      text != url &&
      text != promotedUrl) {
    parts.add(text);
  }
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
